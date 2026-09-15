package router

import (
	"fmt"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestMediaAuditRoutesEnforceOwnership(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	oldDB, oldLogDB := model.DB, model.LOG_DB
	model.DB = db
	model.LOG_DB = db
	t.Cleanup(func() { model.DB = oldDB; model.LOG_DB = oldLogDB; sqlDB, _ := db.DB(); _ = sqlDB.Close() })
	require.NoError(t, db.AutoMigrate(&model.Log{}, &model.Task{}, &model.Midjourney{}))
	for _, id := range []int{41, 42} {
		require.NoError(t, db.Create(&model.Log{UserId: id, CreatedAt: 100, Type: model.LogTypeConsume, ModelName: "gpt-image-2.5", Quota: 100}).Error)
	}
	require.NoError(t, db.Create(&model.Task{UserId: 42, TaskID: "private-task", Action: "imageGenerate", Status: model.TaskStatusSuccess, SubmitTime: 100}).Error)
	for _, role := range []int{0, 1, 10, 100} {
		t.Run(fmt.Sprint(role), func(t *testing.T) {
			r := gin.New()
			r.Use(sessions.Sessions("session", cookie.NewStore([]byte("audit-test-secret"))))
			r.Use(func(c *gin.Context) {
				if role > 0 {
					s := sessions.Default(c)
					s.Set("id", 41)
					s.Set("username", "audit-user")
					s.Set("status", 1)
					s.Set("role", role)
				}
				c.Next()
			})
			registerMediaAuditRoutes(r.Group("/api"))
			for _, scope := range []string{"self", "admin"} {
				req := httptest.NewRequest("GET", "/api/media-logs/"+scope+"/image?start_timestamp=99&end_timestamp=110&user_id=42", nil)
				res := httptest.NewRecorder()
				r.ServeHTTP(res, req)
				var body struct {
					Success bool                 `json:"success"`
					Data    model.MediaAuditPage `json:"data"`
				}
				_ = common.Unmarshal(res.Body.Bytes(), &body)
				allowed := role > 0 && (scope == "self" || role >= 10)
				require.Equal(t, allowed, body.Success)
				if allowed {
					require.Len(t, body.Data.Items, 1)
					if scope == "self" {
						require.Zero(t, body.Data.Items[0].UserID)
						require.Zero(t, body.Data.Items[0].ChannelID)
					} else {
						require.Equal(t, 42, body.Data.Items[0].UserID)
					}
				}
			}
			if role > 0 {
				denied := httptest.NewRecorder()
				r.ServeHTTP(denied, httptest.NewRequest("GET", "/api/media-logs/self/image/private-task/content", nil))
				require.Equal(t, 404, denied.Code)
				for _, query := range []string{"page_size=-1", "p=-1", "status=invalid", "start_timestamp=1&end_timestamp=9999999999"} {
					res := httptest.NewRecorder()
					r.ServeHTTP(res, httptest.NewRequest("GET", "/api/media-logs/self/image?"+query, nil))
					require.Equal(t, 400, res.Code, query)
				}
			}
		})
	}
}

func TestMediaAuditPublicExposure(t *testing.T) {
	require.True(t, isBlockedOnPublicPort("/api/media-logs/admin/image"))
	require.True(t, isBlockedOnPublicPort("/api/media-logs/admin/video/task_id/content"))
	require.False(t, isBlockedOnPublicPort("/api/media-logs/self/image"))
	require.False(t, isBlockedOnPublicPort("/image-logs"))
}
