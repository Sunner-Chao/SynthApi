package middleware

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTokenAutoGroupsContext() *gin.Context {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	return ctx
}

func TestSetupContextForTokenAppliesAutoPolicy(t *testing.T) {
	original := setting.IsAutoCrossGroupRetryEnabled()
	t.Cleanup(func() { setting.SetAutoCrossGroupRetryEnabled(original) })
	token := &model.Token{
		Id:              1,
		UserId:          2,
		CrossGroupRetry: true,
		AutoGroups:      `["vip","default"]`,
	}

	setting.SetAutoCrossGroupRetryEnabled(true)
	ctx := newTokenAutoGroupsContext()
	require.NoError(t, SetupContextForToken(ctx, token))
	value, ok := common.GetContextKey(ctx, constant.ContextKeyTokenAutoGroups)
	require.True(t, ok)
	assert.Equal(t, []string{"vip", "default"}, value)
	assert.True(t, common.GetContextKeyBool(ctx, constant.ContextKeyTokenCrossGroupRetry))

	setting.SetAutoCrossGroupRetryEnabled(false)
	disabledCtx := newTokenAutoGroupsContext()
	require.NoError(t, SetupContextForToken(disabledCtx, token))
	assert.False(t, common.GetContextKeyBool(disabledCtx, constant.ContextKeyTokenCrossGroupRetry))
}

func TestSetupContextForTokenMalformedAutoGroupsFailsClosed(t *testing.T) {
	ctx := newTokenAutoGroupsContext()
	token := &model.Token{Id: 1, UserId: 2, AutoGroups: `not-json`}
	require.NoError(t, SetupContextForToken(ctx, token))
	value, ok := common.GetContextKey(ctx, constant.ContextKeyTokenAutoGroups)
	require.True(t, ok)
	assert.Equal(t, []string{}, value)
}
