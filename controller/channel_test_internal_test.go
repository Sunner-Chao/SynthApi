package controller

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestSettleTestQuotaUsesTieredBilling(t *testing.T) {
	info := &relaycommon.RelayInfo{
		TieredBillingSnapshot: &billingexpr.BillingSnapshot{
			BillingMode:   "tiered_expr",
			ExprString:    `param("stream") == true ? tier("stream", p * 3) : tier("base", p * 2)`,
			ExprHash:      billingexpr.ExprHashString(`param("stream") == true ? tier("stream", p * 3) : tier("base", p * 2)`),
			GroupRatio:    1,
			EstimatedTier: "stream",
			QuotaPerUnit:  common.QuotaPerUnit,
			ExprVersion:   1,
		},
		BillingRequestInput: &billingexpr.RequestInput{
			Body: []byte(`{"stream":true}`),
		},
	}

	quota, result := settleTestQuota(info, types.PriceData{
		ModelRatio:      1,
		CompletionRatio: 2,
	}, &dto.Usage{
		PromptTokens: 1000,
	})

	require.Equal(t, 1500, quota)
	require.NotNil(t, result)
	require.Equal(t, "stream", result.MatchedTier)
}

func TestSettleTestQuotaAppliesGroupAndCacheRatios(t *testing.T) {
	info := &relaycommon.RelayInfo{}
	priceData := types.PriceData{
		ModelRatio:      0.6849315,
		CompletionRatio: 6,
		CacheRatio:      0.1,
		GroupRatioInfo: types.GroupRatioInfo{GroupRatio: 0.065},
	}
	usage := &dto.Usage{
		PromptTokens:     4387,
		CompletionTokens: 14,
		PromptTokensDetails: dto.InputTokenDetails{
			CachedTokens: 3840,
		},
	}

	quota, result := settleTestQuota(info, priceData, usage)

	require.Nil(t, result)
	// (4387 - 3840 + 3840*0.1 + 14*6) * 0.6849315 * 0.065 = 45.18.
	require.Equal(t, 45, quota)
}

func TestSettleTestQuotaPriceAppliesGroupRatio(t *testing.T) {
	priceData := types.PriceData{
		UsePrice: true,
		ModelPrice: 0.04,
		GroupRatioInfo: types.GroupRatioInfo{GroupRatio: 0.065},
	}

	quota, result := settleTestQuota(nil, priceData, &dto.Usage{PromptTokens: 1})

	require.Nil(t, result)
	require.Equal(t, 1300, quota)
}

func TestSettleTestQuotaDoesNotDoubleCountClaudeCacheWrites(t *testing.T) {
	info := &relaycommon.RelayInfo{RelayFormat: types.RelayFormatClaude}
	priceData := types.PriceData{
		ModelRatio:           1,
		CompletionRatio:      1,
		CacheRatio:           0.1,
		CacheCreationRatio:   1,
		CacheCreation5mRatio: 1,
		CacheCreation1hRatio: 2,
		GroupRatioInfo:       types.GroupRatioInfo{GroupRatio: 1},
	}
	usage := &dto.Usage{
		PromptTokens:     100,
		CompletionTokens: 10,
		PromptTokensDetails: dto.InputTokenDetails{
			CachedTokens:         20,
			CachedCreationTokens: 30,
		},
		ClaudeCacheCreation5mTokens: 10,
		ClaudeCacheCreation1hTokens:  5,
	}

	quota, result := settleTestQuota(info, priceData, usage)

	require.Nil(t, result)
	// 100 text + 20*0.1 cache read + (15*1 + 10*1 + 5*2) cache write + 10 output.
	require.Equal(t, 147, quota)
}

func TestSettleTestQuotaZeroUsageIsFree(t *testing.T) {
	quota, result := settleTestQuota(nil, types.PriceData{
		ModelRatio:      1,
		GroupRatioInfo: types.GroupRatioInfo{GroupRatio: 1},
	}, &dto.Usage{})

	require.Nil(t, result)
	require.Zero(t, quota)
}

func TestBuildTestLogOtherInjectsTieredInfo(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())

	info := &relaycommon.RelayInfo{
		TieredBillingSnapshot: &billingexpr.BillingSnapshot{
			BillingMode: "tiered_expr",
			ExprString:  `tier("base", p * 2)`,
		},
		ChannelMeta: &relaycommon.ChannelMeta{},
	}
	priceData := types.PriceData{
		GroupRatioInfo: types.GroupRatioInfo{GroupRatio: 1},
	}
	usage := &dto.Usage{
		PromptTokensDetails: dto.InputTokenDetails{
			CachedTokens: 12,
		},
	}

	other := buildTestLogOther(ctx, info, priceData, usage, &billingexpr.TieredResult{
		MatchedTier: "base",
	})

	require.Equal(t, "tiered_expr", other["billing_mode"])
	require.Equal(t, "base", other["matched_tier"])
	require.NotEmpty(t, other["expr_b64"])
}

func TestResolveChannelTestUserIDUsesRequestUser(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Set("id", 2)

	userID, err := resolveChannelTestUserID(ctx)

	require.NoError(t, err)
	require.Equal(t, 2, userID)
}

func TestNormalizeChannelTestStreamForCodex(t *testing.T) {
	require.True(t, normalizeChannelTestStream(&model.Channel{Type: constant.ChannelTypeCodex}, false))
	require.True(t, normalizeChannelTestStream(&model.Channel{Type: constant.ChannelTypeOpenAI}, true))
	require.False(t, normalizeChannelTestStream(&model.Channel{Type: constant.ChannelTypeOpenAI}, false))
}

func TestCodexResponsesChannelTestRequestUsesForcedStream(t *testing.T) {
	channel := &model.Channel{Type: constant.ChannelTypeCodex}
	req := buildTestRequest(
		"gpt-5",
		string(constant.EndpointTypeOpenAIResponse),
		channel,
		normalizeChannelTestStream(channel, false),
	)

	responseReq, ok := req.(*dto.OpenAIResponsesRequest)
	require.True(t, ok)
	require.NotNil(t, responseReq.Stream)
	require.True(t, *responseReq.Stream)
}
