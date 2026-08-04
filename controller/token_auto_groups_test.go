package controller

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func configureTokenAutoGroupsTest(t *testing.T) {
	t.Helper()
	originalMax := setting.GetMaxTokenAutoGroups()
	originalAutoGroups := setting.AutoGroups2JsonString()
	originalUsableGroups := setting.UserUsableGroups2JSONString()
	originalRatios := ratio_setting.GroupRatio2JSONString()
	originalGlobalRetry := setting.IsAutoCrossGroupRetryEnabled()
	require.NoError(t, setting.UpdateMaxTokenAutoGroups("2"))
	require.NoError(t, setting.UpdateAutoGroupsByJsonString(`["default","vip"]`))
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default","vip":"VIP"}`))
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"vip":1}`))
	setting.SetAutoCrossGroupRetryEnabled(true)
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateMaxTokenAutoGroups(fmt.Sprintf("%d", originalMax)))
		require.NoError(t, setting.UpdateAutoGroupsByJsonString(originalAutoGroups))
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalUsableGroups))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalRatios))
		setting.SetAutoCrossGroupRetryEnabled(originalGlobalRetry)
	})
}

func autoTokenRequest(name string, groups []string) map[string]any {
	return map[string]any{
		"name":              name,
		"expired_time":      -1,
		"remain_quota":      0,
		"unlimited_quota":   true,
		"group":             "auto",
		"cross_group_retry": true,
		"auto_groups":       groups,
	}
}

func TestAddTokenPersistsOrderedAutoGroups(t *testing.T) {
	configureTokenAutoGroupsTest(t)
	setupTokenControllerTestDB(t)
	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/token/",
		autoTokenRequest("ordered-auto", []string{"vip", "default"}), 1)
	common.SetContextKey(ctx, constant.ContextKeyUserGroup, "default")
	AddToken(ctx)
	require.True(t, decodeAPIResponse(t, recorder).Success)

	var token model.Token
	require.NoError(t, model.DB.Where("name = ?", "ordered-auto").First(&token).Error)
	assert.JSONEq(t, `["vip","default"]`, token.AutoGroups)
	response := buildMaskedTokenResponse(&token)
	assert.Equal(t, []string{"vip", "default"}, response.AutoGroups)
}

func TestAddTokenRejectsInvalidAutoGroups(t *testing.T) {
	configureTokenAutoGroupsTest(t)
	setupTokenControllerTestDB(t)
	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/token/",
		autoTokenRequest("invalid-auto", []string{"default", "default"}), 1)
	common.SetContextKey(ctx, constant.ContextKeyUserGroup, "default")
	AddToken(ctx)
	assert.False(t, decodeAPIResponse(t, recorder).Success)
}

func TestAddTokenRequiresCustomGroupsWhenGlobalOrderIsEmpty(t *testing.T) {
	configureTokenAutoGroupsTest(t)
	setupTokenControllerTestDB(t)
	require.NoError(t, setting.UpdateAutoGroupsByJsonString(`[]`))
	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/token/",
		autoTokenRequest("missing-auto-order", []string{}), 1)
	common.SetContextKey(ctx, constant.ContextKeyUserGroup, "default")
	AddToken(ctx)
	assert.False(t, decodeAPIResponse(t, recorder).Success)
}

func TestGetTokenAutoGroupsReturnsPolicy(t *testing.T) {
	configureTokenAutoGroupsTest(t)
	setupTokenControllerTestDB(t)
	setting.SetAutoCrossGroupRetryEnabled(false)
	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, "/api/token/auto-groups", nil, 1)
	common.SetContextKey(ctx, constant.ContextKeyUserGroup, "default")
	GetTokenAutoGroups(ctx)
	response := decodeAPIResponse(t, recorder)
	require.True(t, response.Success)
	var data struct {
		Groups                 []string `json:"groups"`
		MaxCount               int      `json:"max_count"`
		CrossGroupRetryEnabled bool     `json:"cross_group_retry_enabled"`
	}
	require.NoError(t, common.Unmarshal(response.Data, &data))
	assert.Equal(t, []string{"default", "vip"}, data.Groups)
	assert.Equal(t, 2, data.MaxCount)
	assert.False(t, data.CrossGroupRetryEnabled)
}

func TestGetUserGroupsAlwaysExposesAuto(t *testing.T) {
	configureTokenAutoGroupsTest(t)
	db := setupTokenControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.User{}))
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default"}`))
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1}`))
	require.NoError(t, db.Create(&model.User{
		Id:       901,
		Username: "single-group-user",
		Password: "test-password",
		Group:    "default",
	}).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, "/api/user/self/groups", nil, 901)
	GetUserGroups(ctx)
	response := decodeAPIResponse(t, recorder)
	require.True(t, response.Success)
	var groups map[string]map[string]interface{}
	require.NoError(t, common.Unmarshal(response.Data, &groups))
	assert.Contains(t, groups, "default")
	assert.Contains(t, groups, "auto")
}
