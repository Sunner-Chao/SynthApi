package service

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func importedAccountFailoverContext(settings dto.ChannelOtherSettings) *gin.Context {
	rec := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(rec)
	common.SetContextKey(ctx, constant.ContextKeyChannelId, 123)
	common.SetContextKey(ctx, constant.ContextKeyChannelOtherSetting, settings)
	return ctx
}

func TestIsImportedAccountQuotaError(t *testing.T) {
	ctx := importedAccountFailoverContext(dto.ChannelOtherSettings{
		ImportedAccountPlatform: "codex",
	})

	err := types.NewOpenAIError(errors.New("5h quota exhausted"), types.ErrorCodeBadResponseStatusCode, http.StatusTooManyRequests)
	require.True(t, IsImportedAccountQuotaError(ctx, err))

	err = types.NewOpenAIError(errors.New("invalid request"), types.ErrorCodeBadResponseStatusCode, http.StatusBadRequest)
	require.False(t, IsImportedAccountQuotaError(ctx, err))

	regularCtx := importedAccountFailoverContext(dto.ChannelOtherSettings{})
	err = types.NewOpenAIError(errors.New("5h quota exhausted"), types.ErrorCodeBadResponseStatusCode, http.StatusTooManyRequests)
	require.False(t, IsImportedAccountQuotaError(regularCtx, err))
}

func TestPrepareImportedAccountFailoverMarksChannelExcluded(t *testing.T) {
	ctx := importedAccountFailoverContext(dto.ChannelOtherSettings{
		ImportedAccountPlatform: "codex",
	})
	common.SetContextKey(ctx, constant.ContextKeyChannelId, 0)
	err := types.NewOpenAIError(errors.New("usage limit reached for 5h window"), types.ErrorCodeBadResponseStatusCode, http.StatusTooManyRequests)

	require.False(t, PrepareImportedAccountFailover(ctx, err))
	common.SetContextKey(ctx, constant.ContextKeyChannelId, 123)

	require.True(t, PrepareImportedAccountFailover(ctx, err))
	excluded := ImportedAccountExcludedChannelIDs(ctx)
	_, exists := excluded[123]
	require.True(t, exists)
}

func TestShouldSkipChannelForImportedAccountFailover(t *testing.T) {
	ctx := importedAccountFailoverContext(dto.ChannelOtherSettings{})
	MarkImportedAccountChannelExcluded(ctx, 456)

	require.True(t, ShouldSkipChannelForImportedAccountFailover(ctx, &model.Channel{Id: 456}))

	channel := &model.Channel{
		Id:            789,
		OtherSettings: `{"imported_account_platform":"codex","imported_account_monitor":{"quota_status":"success","quota_message":"5h 100% · 7d 20%"}}`,
	}
	require.True(t, ShouldSkipChannelForImportedAccountFailover(ctx, channel))
}
