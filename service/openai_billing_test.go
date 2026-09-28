package service

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestOpenAILongContextSettlementAndLog(t *testing.T) {
	for _, tt := range []struct {
		name, model, tier string
		input, cached, want int
		long bool
	}{
		{"boundary", "gpt-6-astra", "default", 272000, 200000, 92500, false},
		{"cached input crosses threshold", "gpt-6-astra", "default", 272001, 200000, 184752, true},
		{"long default without tier", "gpt-5.4", "", 300000, 250000, 150750, true},
		{"compact alias", "gpt-5.5-openai-compact", "", 300000, 250000, 150750, true},
		{"terra", "gpt-5.6-terra", "", 300000, 250000, 150750, true},
		{"mini excluded", "gpt-5.4-mini", "", 300000, 250000, 75500, false},
		{"non OpenAI excluded", "claude-opus-4-6", "priority", 300000, 250000, 75500, false},
		{"priority short", "gpt-6-astra", "priority", 1000, 0, 3000, false},
		{"priority and long", "gpt-6-astra", "priority", 300000, 250000, 301500, true},
		{"gpt55 priority", "gpt-5.5", "priority", 1000, 0, 3750, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
			info := &relaycommon.RelayInfo{OriginModelName: tt.model, StartTime: time.Now(),
				PriceData: types.PriceData{ModelRatio: 1, CompletionRatio: 5, CacheRatio: 0.1,
					GroupRatioInfo: types.GroupRatioInfo{GroupRatio: 1}}}
			info.ApplyBillingServiceTier(tt.tier)
			usage := &dto.Usage{PromptTokens: tt.input, CompletionTokens: 100,
				PromptTokensDetails: dto.InputTokenDetails{CachedTokens: tt.cached}}
			got := calculateTextQuotaSummary(ctx, info, usage)
			require.Equal(t, tt.want, got.Quota)
			require.Equal(t, tt.long, info.BillingLongContext)
			// Retrying calculation must not multiply the rates a second time.
			require.Equal(t, tt.want, calculateTextQuotaSummary(ctx, info, usage).Quota)
			other := map[string]interface{}{}
			appendBillingInfo(info, other)
			if tt.long {
				require.Equal(t, true, other["billing_long_context"])
				require.Equal(t, tt.input, other["billing_context_tokens"])
				require.Equal(t, 272000, other["billing_context_threshold"])
				require.Equal(t, info.BillingInputRate(), other["billing_input_multiplier"])
				require.Equal(t, info.BillingOutputRate(), other["billing_output_multiplier"])
			}
		})
	}
}
