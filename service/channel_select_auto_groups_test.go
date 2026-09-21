package service

import (
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupChannelSelectAutoGroupsTest(t *testing.T) *gorm.DB {
	t.Helper()
	originalDB := model.DB
	originalMemoryCacheEnabled := common.MemoryCacheEnabled
	originalRetryTimes := common.RetryTimes
	originalAutoGroups := setting.AutoGroups2JsonString()
	originalUsableGroups := setting.UserUsableGroups2JSONString()
	originalGroupRatios := ratio_setting.GroupRatio2JSONString()
	originalMax := setting.GetMaxTokenAutoGroups()
	originalGlobalRetry := setting.IsAutoCrossGroupRetryEnabled()

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Channel{}, &model.Ability{}))
	model.DB = db
	common.MemoryCacheEnabled = true
	common.RetryTimes = 1
	require.NoError(t, setting.UpdateAutoGroupsByJsonString(`[]`))
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default","vip":"VIP"}`))
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"vip":1}`))
	require.NoError(t, setting.UpdateMaxTokenAutoGroups("2"))
	setting.SetAutoCrossGroupRetryEnabled(true)

	t.Cleanup(func() {
		model.DB = originalDB
		common.MemoryCacheEnabled = originalMemoryCacheEnabled
		common.RetryTimes = originalRetryTimes
		require.NoError(t, setting.UpdateAutoGroupsByJsonString(originalAutoGroups))
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalUsableGroups))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalGroupRatios))
		require.NoError(t, setting.UpdateMaxTokenAutoGroups(fmt.Sprintf("%d", originalMax)))
		setting.SetAutoCrossGroupRetryEnabled(originalGlobalRetry)
		if originalMemoryCacheEnabled && originalDB != nil {
			model.InitChannelCache()
		}
		sqlDB, err := db.DB()
		if err == nil {
			require.NoError(t, sqlDB.Close())
		}
	})
	return db
}

func createAutoGroupsChannel(t *testing.T, db *gorm.DB, id int, group, modelName string) {
	t.Helper()
	priority := int64(0)
	weight := uint(100)
	require.NoError(t, db.Create(&model.Channel{
		Id: id, Type: constant.ChannelTypeOpenAI, Key: fmt.Sprintf("key-%d", id),
		Status: common.ChannelStatusEnabled, Name: fmt.Sprintf("channel-%d", id),
		Weight: &weight, Models: modelName, Group: group, Priority: &priority,
	}).Error)
	require.NoError(t, db.Create(&model.Ability{
		Group: group, Model: modelName, ChannelId: id, Enabled: true,
		Priority: &priority, Weight: weight,
	}).Error)
}

func TestCacheGetRandomSatisfiedChannelUsesCustomOrderAndGlobalSwitch(t *testing.T) {
	db := setupChannelSelectAutoGroupsTest(t)
	const modelName = "auto-groups-policy-model"
	createAutoGroupsChannel(t, db, 2201, "vip", modelName)
	createAutoGroupsChannel(t, db, 2202, "default", modelName)
	model.InitChannelCache()

	newParam := func() (*gin.Context, *RetryParam) {
		gin.SetMode(gin.TestMode)
		ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
		common.SetContextKey(ctx, constant.ContextKeyUserGroup, "default")
		common.SetContextKey(ctx, constant.ContextKeyTokenAutoGroups, []string{"vip", "default"})
		common.SetContextKey(ctx, constant.ContextKeyTokenCrossGroupRetry, true)
		retry := 0
		return ctx, &RetryParam{Ctx: ctx, TokenGroup: "auto", ModelName: modelName, Retry: &retry}
	}

	_, param := newParam()
	first, selectedGroup, err := CacheGetRandomSatisfiedChannel(param)
	require.NoError(t, err)
	require.NotNil(t, first)
	assert.Equal(t, 2201, first.Id)
	assert.Equal(t, "vip", selectedGroup)
	param.IncreaseRetry()
	second, selectedGroup, err := CacheGetRandomSatisfiedChannel(param)
	require.NoError(t, err)
	require.NotNil(t, second)
	assert.Equal(t, 2201, second.Id)
	assert.Equal(t, "vip", selectedGroup)
	param.IncreaseRetry()
	third, selectedGroup, err := CacheGetRandomSatisfiedChannel(param)
	require.NoError(t, err)
	require.NotNil(t, third)
	assert.Equal(t, 2202, third.Id)
	assert.Equal(t, "default", selectedGroup)

	setting.SetAutoCrossGroupRetryEnabled(false)
	_, disabledParam := newParam()
	first, _, err = CacheGetRandomSatisfiedChannel(disabledParam)
	require.NoError(t, err)
	require.NotNil(t, first)
	disabledParam.IncreaseRetry()
	second, _, err = CacheGetRandomSatisfiedChannel(disabledParam)
	require.NoError(t, err)
	require.NotNil(t, second)
	assert.Equal(t, 2201, second.Id)
	groupIndex, exists := common.GetContextKey(disabledParam.Ctx, constant.ContextKeyAutoGroupIndex)
	require.True(t, exists)
	assert.Equal(t, 0, groupIndex)
}

func TestCacheGetRandomSatisfiedChannelRestartsWhenGlobalOrderChanges(t *testing.T) {
	db := setupChannelSelectAutoGroupsTest(t)
	const modelName = "auto-groups-order-change-model"
	createAutoGroupsChannel(t, db, 2211, "vip", modelName)
	createAutoGroupsChannel(t, db, 2212, "default", modelName)
	require.NoError(t, setting.UpdateAutoGroupsByJsonString(`["vip","default"]`))
	model.InitChannelCache()

	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	common.SetContextKey(ctx, constant.ContextKeyUserGroup, "default")
	common.SetContextKey(ctx, constant.ContextKeyTokenCrossGroupRetry, true)
	retry := 0
	param := &RetryParam{Ctx: ctx, TokenGroup: "auto", ModelName: modelName, Retry: &retry}

	first, group, err := CacheGetRandomSatisfiedChannel(param)
	require.NoError(t, err)
	require.NotNil(t, first)
	assert.Equal(t, 2211, first.Id)
	assert.Equal(t, "vip", group)

	// An admin inserts a new highest-priority group by changing the global
	// order. The same request's next retry must restart from the new P0.
	require.NoError(t, setting.UpdateAutoGroupsByJsonString(`["default","vip"]`))
	param.IncreaseRetry()
	second, group, err := CacheGetRandomSatisfiedChannel(param)
	require.NoError(t, err)
	require.NotNil(t, second)
	assert.Equal(t, 2212, second.Id)
	assert.Equal(t, "default", group)
}
