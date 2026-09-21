package service

import (
	"bytes"
	"encoding/json"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	appconstant "github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/reasoning"

	"github.com/gin-gonic/gin"
)

type LongContextOptimizationAudit struct {
	PromptTokens              int    `json:"prompt_tokens"`
	ChannelID                 int    `json:"channel_id,omitempty"`
	CompactionInjected        bool   `json:"compaction_injected,omitempty"`
	CompactionAlreadyPresent  bool   `json:"compaction_already_present,omitempty"`
	CompactionThresholdTokens int    `json:"compact_threshold_tokens,omitempty"`
	CompactionObserved        bool   `json:"compaction_observed,omitempty"`
	CompactionSkippedReason   string `json:"compaction_skipped_reason,omitempty"`
	ReasoningFrom             string `json:"reasoning_from,omitempty"`
	ReasoningTo               string `json:"reasoning_to,omitempty"`
	ReasoningModelSuffix      bool   `json:"reasoning_model_suffix,omitempty"`
	RequestMutated            bool   `json:"request_mutated,omitempty"`
}

type contextManagementEntry struct {
	Type string `json:"type"`
}

// ApplyLongContextOptimization applies opt-in transformations after a channel
// has been selected. Official server-side compaction is only sent to OpenAI or
// Codex API channels, where Responses context_management is supported.
func ApplyLongContextOptimization(c *gin.Context, request *dto.OpenAIResponsesRequest, info *relaycommon.RelayInfo) *LongContextOptimizationAudit {
	if c != nil {
		common.SetContextKey(c, appconstant.ContextKeyLongContextOptimization, (*LongContextOptimizationAudit)(nil))
	}
	setting := operation_setting.GetLongContextOptimizationSetting()
	if setting == nil || !setting.Enabled || request == nil || info == nil ||
		info.RelayMode != relayconstant.RelayModeResponses || info.ChannelMeta == nil ||
		(info.ApiType != appconstant.APITypeOpenAI && info.ApiType != appconstant.APITypeCodex) ||
		!longContextScopeMatches(setting, info) {
		return nil
	}

	audit := &LongContextOptimizationAudit{
		PromptTokens: info.GetEstimatePromptTokens(),
		ChannelID:    info.ChannelId,
	}

	if setting.ServerSideCompactionEnabled {
		updated, injected, present, err := mergeServerSideCompaction(
			request.ContextManagement,
			setting.CompactThresholdTokens,
			setting.OverrideExistingCompaction,
		)
		if err != nil {
			audit.CompactionSkippedReason = "invalid_context_management"
		} else {
			request.ContextManagement = updated
			audit.CompactionInjected = injected
			audit.CompactionAlreadyPresent = present
			if injected {
				audit.CompactionThresholdTokens = setting.CompactThresholdTokens
			}
			audit.RequestMutated = audit.RequestMutated || injected
		}
	}

	if setting.ReasoningDowngradeEnabled && audit.PromptTokens >= setting.ReasoningThresholdTokens {
		applyReasoningDowngrade(request, setting.ReasoningTargetEffort, audit)
	}

	if c != nil {
		common.SetContextKey(c, appconstant.ContextKeyLongContextOptimization, audit)
	}
	return audit
}

func mergeServerSideCompaction(raw json.RawMessage, threshold int, override bool) (json.RawMessage, bool, bool, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		updated, err := common.Marshal([]map[string]any{{
			"type":              "compaction",
			"compact_threshold": threshold,
		}})
		return updated, err == nil, false, err
	}

	var entries []json.RawMessage
	if err := common.Unmarshal(trimmed, &entries); err != nil {
		return raw, false, false, err
	}

	for index, entryRaw := range entries {
		var entry contextManagementEntry
		if err := common.Unmarshal(entryRaw, &entry); err != nil {
			continue
		}
		if entry.Type != "compaction" {
			continue
		}
		if !override {
			return raw, false, true, nil
		}

		var fields map[string]json.RawMessage
		if err := common.Unmarshal(entryRaw, &fields); err != nil {
			return raw, false, true, err
		}
		thresholdJSON, err := common.Marshal(threshold)
		if err != nil {
			return raw, false, true, err
		}
		fields["compact_threshold"] = thresholdJSON
		entries[index], err = common.Marshal(fields)
		if err != nil {
			return raw, false, true, err
		}
		updated, err := common.Marshal(entries)
		return updated, err == nil, true, err
	}

	compaction, err := common.Marshal(map[string]any{
		"type":              "compaction",
		"compact_threshold": threshold,
	})
	if err != nil {
		return raw, false, false, err
	}
	entries = append(entries, compaction)
	updated, err := common.Marshal(entries)
	return updated, err == nil, false, err
}

func applyReasoningDowngrade(request *dto.OpenAIResponsesRequest, target string, audit *LongContextOptimizationAudit) {
	target = strings.ToLower(strings.TrimSpace(target))
	targetRank, ok := reasoningEffortRank(target)
	if !ok {
		return
	}

	current := ""
	fromSuffix := false
	if suffixEffort, baseModel := reasoning.ParseOpenAIReasoningEffortFromModelSuffix(request.Model); suffixEffort != "" {
		current = suffixEffort
		fromSuffix = true
		if currentRank, known := reasoningEffortRank(current); known && currentRank > targetRank {
			request.Model = baseModel
		}
	} else if request.Reasoning != nil {
		current = strings.ToLower(strings.TrimSpace(request.Reasoning.Effort))
	}

	currentRank, known := reasoningEffortRank(current)
	if !known || currentRank <= targetRank {
		return
	}
	if request.Reasoning == nil {
		request.Reasoning = &dto.Reasoning{}
	}
	request.Reasoning.Effort = target
	audit.ReasoningFrom = current
	audit.ReasoningTo = target
	audit.ReasoningModelSuffix = fromSuffix
	audit.RequestMutated = true
}

func reasoningEffortRank(effort string) (int, bool) {
	switch effort {
	case "none":
		return 0, true
	case "minimal":
		return 1, true
	case "low":
		return 2, true
	case "medium":
		return 3, true
	case "high":
		return 4, true
	case "xhigh", "max":
		return 5, true
	default:
		return 0, false
	}
}

func longContextScopeMatches(setting *operation_setting.LongContextOptimizationSetting, info *relaycommon.RelayInfo) bool {
	if !csvIDMatches(setting.ApplyToUserIDs, info.UserId) || !csvIDMatches(setting.ApplyToTokenIDs, info.TokenId) {
		return false
	}
	groups := csvStrings(setting.ApplyToGroups)
	if len(groups) == 0 {
		return true
	}
	effectiveGroup := strings.TrimSpace(info.UsingGroup)
	if effectiveGroup == "" {
		effectiveGroup = strings.TrimSpace(info.TokenGroup)
	}
	for _, group := range groups {
		if group == effectiveGroup {
			return true
		}
	}
	return false
}

func csvIDMatches(raw string, value int) bool {
	values := csvStrings(raw)
	if len(values) == 0 {
		return true
	}
	for _, item := range values {
		parsed, err := strconv.Atoi(item)
		if err == nil && parsed == value {
			return true
		}
	}
	return false
}

func csvStrings(raw string) []string {
	parts := strings.Split(raw, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		if value := strings.TrimSpace(part); value != "" {
			result = append(result, value)
		}
	}
	return result
}

func GetLongContextOptimizationAudit(c *gin.Context) *LongContextOptimizationAudit {
	if c == nil {
		return nil
	}
	audit, ok := common.GetContextKeyType[*LongContextOptimizationAudit](c, appconstant.ContextKeyLongContextOptimization)
	if !ok {
		return nil
	}
	return audit
}

func LongContextOptimizationMutated(c *gin.Context) bool {
	audit := GetLongContextOptimizationAudit(c)
	return audit != nil && audit.RequestMutated
}

func MarkLongContextCompactionObserved(c *gin.Context) {
	if audit := GetLongContextOptimizationAudit(c); audit != nil {
		audit.CompactionObserved = true
	}
}

func IsLongContextCompactionType(value string) bool {
	value = strings.ToLower(strings.TrimSpace(value))
	return value == "compaction" || value == "response.compaction" || strings.HasPrefix(value, "response.compaction.")
}
