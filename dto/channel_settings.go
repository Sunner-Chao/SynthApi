package dto

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

var importedAccountQuotaPercentPattern = regexp.MustCompile(`(?i)(5\s*h|5-hour|5\s*hour|7\s*d|7-day|7\s*day|weekly)\D{0,12}([0-9]+(?:\.[0-9]+)?)\s*%`)

type ChannelSettings struct {
	ForceFormat                 bool   `json:"force_format,omitempty"`
	ThinkingToContent           bool   `json:"thinking_to_content,omitempty"`
	Proxy                       string `json:"proxy"`
	PassThroughBodyEnabled      bool   `json:"pass_through_body_enabled,omitempty"`
	SystemPrompt                string `json:"system_prompt,omitempty"`
	SystemPromptOverride        bool   `json:"system_prompt_override,omitempty"`
	UpstreamRequestGzipEnabled  *bool  `json:"upstream_request_gzip_enabled,omitempty"`
	UpstreamRequestGzipMinBytes int64  `json:"upstream_request_gzip_min_bytes,omitempty"`
}

const (
	DefaultUpstreamRequestGzipMinBytes int64 = 1 << 20
	MinimumUpstreamRequestGzipMinBytes int64 = 1 << 10
)

func (s ChannelSettings) EffectiveUpstreamRequestGzipMinBytes() int64 {
	if s.UpstreamRequestGzipMinBytes <= 0 {
		return DefaultUpstreamRequestGzipMinBytes
	}
	return s.UpstreamRequestGzipMinBytes
}

func (s ChannelSettings) EffectiveUpstreamRequestGzipEnabled(defaultEnabled bool) bool {
	if s.UpstreamRequestGzipEnabled == nil {
		return defaultEnabled
	}
	return *s.UpstreamRequestGzipEnabled
}

type VertexKeyType string

const (
	VertexKeyTypeJSON   VertexKeyType = "json"
	VertexKeyTypeAPIKey VertexKeyType = "api_key"
)

type AwsKeyType string

const (
	AwsKeyTypeAKSK   AwsKeyType = "ak_sk" // 默认
	AwsKeyTypeApiKey AwsKeyType = "api_key"
)

type ChannelOtherSettings struct {
	AzureResponsesVersion                 string         `json:"azure_responses_version,omitempty"`
	VertexKeyType                         VertexKeyType  `json:"vertex_key_type,omitempty"` // "json" or "api_key"
	OpenRouterEnterprise                  *bool          `json:"openrouter_enterprise,omitempty"`
	ClaudeBetaQuery                       bool           `json:"claude_beta_query,omitempty"`         // Claude 渠道是否强制追加 ?beta=true
	AllowServiceTier                      bool           `json:"allow_service_tier,omitempty"`        // 是否允许 service_tier 透传（默认过滤以避免额外计费）
	AllowInferenceGeo                     bool           `json:"allow_inference_geo,omitempty"`       // 是否允许 inference_geo 透传（仅 Claude，默认过滤以满足数据驻留合规
	AllowSpeed                            bool           `json:"allow_speed,omitempty"`               // 是否允许 speed 透传（仅 Claude，默认过滤以避免意外切换推理速度模式）
	AllowSafetyIdentifier                 bool           `json:"allow_safety_identifier,omitempty"`   // 是否允许 safety_identifier 透传（默认过滤以保护用户隐私）
	DisableStore                          bool           `json:"disable_store,omitempty"`             // 是否禁用 store 透传（默认允许透传，禁用后可能导致 Codex 无法使用）
	AllowIncludeObfuscation               bool           `json:"allow_include_obfuscation,omitempty"` // 是否允许 stream_options.include_obfuscation 透传（默认过滤以避免关闭流混淆保护）
	AwsKeyType                            AwsKeyType     `json:"aws_key_type,omitempty"`
	UpstreamModelUpdateCheckEnabled       bool           `json:"upstream_model_update_check_enabled,omitempty"`        // 是否检测上游模型更新
	UpstreamModelUpdateAutoSyncEnabled    bool           `json:"upstream_model_update_auto_sync_enabled,omitempty"`    // 是否自动同步上游模型更新
	UpstreamModelUpdateLastCheckTime      int64          `json:"upstream_model_update_last_check_time,omitempty"`      // 上次检测时间
	UpstreamModelUpdateLastDetectedModels []string       `json:"upstream_model_update_last_detected_models,omitempty"` // 上次检测到的可加入模型
	UpstreamModelUpdateLastRemovedModels  []string       `json:"upstream_model_update_last_removed_models,omitempty"`  // 上次检测到的可删除模型
	UpstreamModelUpdateIgnoredModels      []string       `json:"upstream_model_update_ignored_models,omitempty"`       // 手动忽略的模型
	ImportedAccountPlatform               string         `json:"imported_account_platform,omitempty"`
	ImportedAccountType                   string         `json:"imported_account_type,omitempty"`
	ImportedAccountEmail                  string         `json:"imported_account_email,omitempty"`
	ImportedAccountID                     string         `json:"imported_account_id,omitempty"`
	ImportedAccountMonitor                map[string]any `json:"imported_account_monitor,omitempty"`
}

func (s *ChannelOtherSettings) IsOpenRouterEnterprise() bool {
	if s == nil || s.OpenRouterEnterprise == nil {
		return false
	}
	return *s.OpenRouterEnterprise
}

func (s *ChannelOtherSettings) IsImportedAccountChannel() bool {
	if s == nil {
		return false
	}
	return strings.TrimSpace(s.ImportedAccountPlatform) != "" ||
		strings.TrimSpace(s.ImportedAccountType) != "" ||
		strings.TrimSpace(s.ImportedAccountEmail) != "" ||
		strings.TrimSpace(s.ImportedAccountID) != "" ||
		s.ImportedAccountMonitor != nil
}

func (s *ChannelOtherSettings) ImportedAccountMonitorLowQuota() bool {
	if s == nil || len(s.ImportedAccountMonitor) == 0 {
		return false
	}
	status := strings.ToLower(strings.TrimSpace(fmt.Sprint(s.ImportedAccountMonitor["quota_status"])))
	message := strings.ToLower(strings.TrimSpace(fmt.Sprint(s.ImportedAccountMonitor["quota_message"])))
	if status == "limited" || status == "exhausted" || status == "quota_exceeded" || status == "rate_limited" {
		return true
	}
	return importedAccountQuotaMessageLooksLow(message)
}

func importedAccountQuotaMessageLooksLow(message string) bool {
	if message == "" {
		return false
	}
	if importedAccountQuotaMessagePercentLooksLow(message) {
		return true
	}
	lowQuotaKeywords := []string{
		"quota exhausted",
		"quota exceeded",
		"quota used",
		"limit exhausted",
		"limit exceeded",
		"usage limit",
		"rate limit",
		"too many requests",
		"5h 100%",
		"5 h 100%",
		"5-hour 100%",
		"5 hour 100%",
		"weekly 100%",
		"7d 100%",
		"7 d 100%",
		"额度用尽",
		"配额用尽",
		"额度不足",
		"配额不足",
		"额度耗尽",
		"配额耗尽",
	}
	for _, keyword := range lowQuotaKeywords {
		if strings.Contains(message, keyword) {
			return true
		}
	}
	return false
}

func importedAccountQuotaMessagePercentLooksLow(message string) bool {
	matches := importedAccountQuotaPercentPattern.FindAllStringSubmatch(message, -1)
	for _, match := range matches {
		if len(match) < 3 {
			continue
		}
		percent, err := strconv.ParseFloat(match[2], 64)
		if err != nil {
			continue
		}
		if percent >= 95 {
			return true
		}
	}
	return false
}
