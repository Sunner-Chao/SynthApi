package controller

import (
	"bytes"
	"fmt"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestAdministratorPermissionsAndSidebarParity(t *testing.T) {
	require.Equal(t, calculateUserPermissions(100), calculateUserPermissions(10))
	require.JSONEq(t, generateDefaultSidebarConfig(100), generateDefaultSidebarConfig(10))
	require.NotEqual(t, calculateUserPermissions(10), calculateUserPermissions(1))
	for _, target := range []int{0, 1, 10, 100} {
		require.True(t, canManageTargetRole(10, target))
		require.True(t, canManageTargetRole(100, target))
		require.False(t, canManageTargetRole(1, target))
	}
	require.False(t, canManageTargetRole(99, 1))
	require.False(t, canManageTargetRole(10, 99))
}

func TestAdministratorsCanManagePeersAndProtectRoot(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}))
	oldDB, oldRedis := model.DB, common.RedisEnabled
	model.DB, common.RedisEnabled = db, false
	t.Cleanup(func() { model.DB, common.RedisEnabled = oldDB, oldRedis; sqlDB, _ := db.DB(); _ = sqlDB.Close() })
	for _, role := range []int{10, 100} {
		t.Run(fmt.Sprint(role), func(t *testing.T) {
			root := model.User{Id: 9001, Username: "root-fixture", AffCode: "testroot", Role: 100, Status: 1}
			peer := model.User{Id: 9002, Username: "admin-fixture", AffCode: "testpeer", Role: 10, Status: 1, Setting: `{"sidebar_modules":"{\"admin\":{\"setting\":false}}"}`}
			require.NoError(t, db.Save(&root).Error)
			require.NoError(t, db.Save(&peer).Error)
			router := gin.New()
			router.Use(func(c *gin.Context) { c.Set("role", role); c.Set("id", 9002) })
			router.GET("/user/:id", GetUser)
			router.GET("/self", GetSelf)
			router.POST("/manage", ManageUser)
			router.POST("/user", CreateUser)
			router.DELETE("/user/:id", DeleteUser)
			request := func(method, path string, body any) bool {
				payload, err := common.Marshal(body)
				require.NoError(t, err)
				response := httptest.NewRecorder()
				router.ServeHTTP(response, httptest.NewRequest(method, path, bytes.NewReader(payload)))
				var result struct {
					Success bool `json:"success"`
				}
				require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
				return result.Success
			}
			for _, createdRole := range []int{0, 1, 10, 100} {
				username := fmt.Sprintf("created-%d-%d", role, createdRole)
				allowed := request("POST", "/user", model.User{Username: username, Password: "fixture-password", Role: createdRole})
				require.Equal(t, createdRole != 100, allowed)
				if allowed {
					var created model.User
					require.NoError(t, db.Where("username = ?", username).First(&created).Error)
					if createdRole == 0 {
						require.Equal(t, 1, created.Role)
					} else {
						require.Equal(t, createdRole, created.Role)
					}
				}
			}
			self := httptest.NewRecorder()
			router.ServeHTTP(self, httptest.NewRequest("GET", "/self", nil))
			var selfResult struct {
				Success bool `json:"success"`
				Data    struct {
					SidebarModules string `json:"sidebar_modules"`
					Role           int    `json:"role"`
				} `json:"data"`
			}
			require.NoError(t, common.Unmarshal(self.Body.Bytes(), &selfResult))
			require.True(t, selfResult.Success)
			require.Empty(t, selfResult.Data.SidebarModules)
			require.Equal(t, 10, selfResult.Data.Role, "do not rewrite stored role IDs")
			require.True(t, request("GET", "/user/9001", nil))
			require.True(t, request("GET", "/user/9002", nil))
			for _, action := range []string{"disable", "enable", "demote", "promote"} {
				require.True(t, request("POST", "/manage", ManageRequest{Id: 9002, Action: action}), action)
				require.NoError(t, db.First(&peer, 9002).Error)
				if action == "demote" {
					require.Equal(t, 1, peer.Role)
				}
				if action == "promote" {
					require.Equal(t, 10, peer.Role)
				}
			}
			for _, action := range []string{"disable", "demote", "delete"} {
				require.False(t, request("POST", "/manage", ManageRequest{Id: 9001, Action: action}), action)
			}
			require.False(t, request("DELETE", "/user/9001", nil))
			require.True(t, request("DELETE", "/user/9002", nil))
			require.NoError(t, db.First(&root, 9001).Error)
			require.Equal(t, 100, root.Role)
			require.Equal(t, 1, root.Status)
		})
	}
}
