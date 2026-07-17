package service

import (
	"encoding/json"
	"testing"

	"github.com/QuantumNous/new-api/common"
	appconstant "github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func longContextTestSetup(t *testing.T) (*gin.Context, *relaycommon.RelayInfo) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(nil)

	setting := operation_setting.GetLongContextOptimizationSetting()
	original := *setting
	*setting = operation_setting.LongContextOptimizationSetting{
		Enabled:                     true,
		ServerSideCompactionEnabled: true,
		CompactThresholdTokens:      50_000,
		ReasoningThresholdTokens:    150_000,
		ReasoningTargetEffort:       "high",
	}
	t.Cleanup(func() { *setting = original })

	info := &relaycommon.RelayInfo{
		RelayMode:   relayconstant.RelayModeResponses,
		UserId:      20,
		TokenId:     15,
		UsingGroup:  "default",
		ChannelMeta: &relaycommon.ChannelMeta{ApiType: appconstant.APITypeOpenAI, ChannelId: 652},
	}
	info.SetEstimatePromptTokens(175_000)
	return c, info
}

func decodeContextManagement(t *testing.T, raw json.RawMessage) []map[string]any {
	t.Helper()
	var entries []map[string]any
	require.NoError(t, common.Unmarshal(raw, &entries))
	return entries
}

func TestApplyLongContextOptimizationDisabled(t *testing.T) {
	c, info := longContextTestSetup(t)
	operation_setting.GetLongContextOptimizationSetting().Enabled = false
	request := &dto.OpenAIResponsesRequest{Model: "gpt-5.2-codex"}

	audit := ApplyLongContextOptimization(c, request, info)
	require.Nil(t, audit)
	require.Empty(t, request.ContextManagement)
	require.False(t, LongContextOptimizationMutated(c))
}

func TestApplyLongContextOptimizationHonorsTokenScope(t *testing.T) {
	c, info := longContextTestSetup(t)
	operation_setting.GetLongContextOptimizationSetting().ApplyToTokenIDs = "9, 10"
	request := &dto.OpenAIResponsesRequest{Model: "gpt-5.2-codex"}

	require.Nil(t, ApplyLongContextOptimization(c, request, info))
	require.Empty(t, request.ContextManagement)
}

func TestApplyLongContextOptimizationInjectsCompactionAndRetainsUnknownEntries(t *testing.T) {
	c, info := longContextTestSetup(t)
	request := &dto.OpenAIResponsesRequest{
		Model:             "gpt-5.2-codex",
		ContextManagement: json.RawMessage(`[{"type":"custom","value":{"keep":true}}]`),
	}

	audit := ApplyLongContextOptimization(c, request, info)
	require.NotNil(t, audit)
	require.True(t, audit.CompactionInjected)
	require.True(t, audit.RequestMutated)
	entries := decodeContextManagement(t, request.ContextManagement)
	require.Len(t, entries, 2)
	require.Equal(t, "custom", entries[0]["type"])
	require.Equal(t, true, entries[0]["value"].(map[string]any)["keep"])
	require.Equal(t, "compaction", entries[1]["type"])
	require.Equal(t, float64(50_000), entries[1]["compact_threshold"])
}

func TestApplyLongContextOptimizationPreservesExistingCompactionByDefault(t *testing.T) {
	c, info := longContextTestSetup(t)
	original := json.RawMessage(`[{"type":"compaction","compact_threshold":88000,"vendor":"keep"}]`)
	request := &dto.OpenAIResponsesRequest{Model: "gpt-5.2-codex", ContextManagement: append(json.RawMessage(nil), original...)}

	audit := ApplyLongContextOptimization(c, request, info)
	require.NotNil(t, audit)
	require.True(t, audit.CompactionAlreadyPresent)
	require.False(t, audit.CompactionInjected)
	require.False(t, audit.RequestMutated)
	require.JSONEq(t, string(original), string(request.ContextManagement))
}

func TestApplyLongContextOptimizationOverridesExistingCompactionExplicitly(t *testing.T) {
	c, info := longContextTestSetup(t)
	operation_setting.GetLongContextOptimizationSetting().OverrideExistingCompaction = true
	request := &dto.OpenAIResponsesRequest{
		Model:             "gpt-5.2-codex",
		ContextManagement: json.RawMessage(`[{"type":"compaction","compact_threshold":88000,"vendor":"keep"}]`),
	}

	audit := ApplyLongContextOptimization(c, request, info)
	require.NotNil(t, audit)
	require.True(t, audit.CompactionInjected)
	entries := decodeContextManagement(t, request.ContextManagement)
	require.Equal(t, float64(50_000), entries[0]["compact_threshold"])
	require.Equal(t, "keep", entries[0]["vendor"])
}

func TestApplyLongContextOptimizationSkipsMalformedContextManagement(t *testing.T) {
	c, info := longContextTestSetup(t)
	original := json.RawMessage(`{"type":"compaction"}`)
	request := &dto.OpenAIResponsesRequest{Model: "gpt-5.2-codex", ContextManagement: original}

	audit := ApplyLongContextOptimization(c, request, info)
	require.NotNil(t, audit)
	require.Equal(t, "invalid_context_management", audit.CompactionSkippedReason)
	require.False(t, audit.RequestMutated)
	require.Equal(t, string(original), string(request.ContextManagement))
}

func TestApplyLongContextOptimizationDowngradesOnlyAboveThreshold(t *testing.T) {
	c, info := longContextTestSetup(t)
	setting := operation_setting.GetLongContextOptimizationSetting()
	setting.ServerSideCompactionEnabled = false
	setting.ReasoningDowngradeEnabled = true
	request := &dto.OpenAIResponsesRequest{Model: "gpt-5.2-codex", Reasoning: &dto.Reasoning{Effort: "xhigh", Summary: "auto"}}

	audit := ApplyLongContextOptimization(c, request, info)
	require.Equal(t, "high", request.Reasoning.Effort)
	require.Equal(t, "auto", request.Reasoning.Summary)
	require.Equal(t, "xhigh", audit.ReasoningFrom)
	require.Equal(t, "high", audit.ReasoningTo)

	info.SetEstimatePromptTokens(149_999)
	request.Reasoning.Effort = "xhigh"
	audit = ApplyLongContextOptimization(c, request, info)
	require.Equal(t, "xhigh", request.Reasoning.Effort)
	require.Empty(t, audit.ReasoningTo)
}

func TestApplyLongContextOptimizationNeverUpgradesReasoning(t *testing.T) {
	c, info := longContextTestSetup(t)
	setting := operation_setting.GetLongContextOptimizationSetting()
	setting.ServerSideCompactionEnabled = false
	setting.ReasoningDowngradeEnabled = true
	request := &dto.OpenAIResponsesRequest{Model: "gpt-5.2-codex", Reasoning: &dto.Reasoning{Effort: "medium"}}

	audit := ApplyLongContextOptimization(c, request, info)
	require.Equal(t, "medium", request.Reasoning.Effort)
	require.False(t, audit.RequestMutated)
}

func TestApplyLongContextOptimizationHandlesReasoningModelSuffix(t *testing.T) {
	c, info := longContextTestSetup(t)
	setting := operation_setting.GetLongContextOptimizationSetting()
	setting.ServerSideCompactionEnabled = false
	setting.ReasoningDowngradeEnabled = true
	request := &dto.OpenAIResponsesRequest{Model: "gpt-5.2-codex-xhigh"}

	audit := ApplyLongContextOptimization(c, request, info)
	require.Equal(t, "gpt-5.2-codex", request.Model)
	require.NotNil(t, request.Reasoning)
	require.Equal(t, "high", request.Reasoning.Effort)
	require.True(t, audit.ReasoningModelSuffix)
}

func TestApplyLongContextOptimizationSkipsUnsupportedChannelAndClearsPriorAttempt(t *testing.T) {
	c, info := longContextTestSetup(t)
	request := &dto.OpenAIResponsesRequest{Model: "gpt-5.2-codex"}
	require.NotNil(t, ApplyLongContextOptimization(c, request, info))
	require.True(t, LongContextOptimizationMutated(c))

	info.ChannelMeta.ApiType = appconstant.APITypeAnthropic
	request.ContextManagement = nil
	require.Nil(t, ApplyLongContextOptimization(c, request, info))
	require.False(t, LongContextOptimizationMutated(c))
}

func TestMarkLongContextCompactionObserved(t *testing.T) {
	c, info := longContextTestSetup(t)
	request := &dto.OpenAIResponsesRequest{Model: "gpt-5.2-codex"}
	audit := ApplyLongContextOptimization(c, request, info)

	MarkLongContextCompactionObserved(c)
	require.True(t, audit.CompactionObserved)
	require.True(t, IsLongContextCompactionType("response.compaction.delta"))
	require.False(t, IsLongContextCompactionType("response.output_text.delta"))
}
