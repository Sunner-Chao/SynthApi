package operation_setting

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
)

const longContextOptimizationPrefix = "long_context_optimization."

type LongContextOptimizationSetting struct {
	Enabled                     bool   `json:"enabled"`
	ServerSideCompactionEnabled bool   `json:"server_side_compaction_enabled"`
	CompactThresholdTokens      int    `json:"compact_threshold_tokens"`
	OverrideExistingCompaction  bool   `json:"override_existing_compaction"`
	ReasoningDowngradeEnabled   bool   `json:"reasoning_downgrade_enabled"`
	ReasoningThresholdTokens    int    `json:"reasoning_threshold_tokens"`
	ReasoningTargetEffort       string `json:"reasoning_target_effort"`
	ApplyToUserIDs              string `json:"apply_to_user_ids"`
	ApplyToTokenIDs             string `json:"apply_to_token_ids"`
	ApplyToGroups               string `json:"apply_to_groups"`
}

var longContextOptimizationSetting = LongContextOptimizationSetting{
	Enabled:                     false,
	ServerSideCompactionEnabled: true,
	CompactThresholdTokens:      50_000,
	OverrideExistingCompaction:  false,
	ReasoningDowngradeEnabled:   false,
	ReasoningThresholdTokens:    150_000,
	ReasoningTargetEffort:       "high",
}

func init() {
	config.GlobalConfig.Register("long_context_optimization", &longContextOptimizationSetting)
}

func GetLongContextOptimizationSetting() *LongContextOptimizationSetting {
	return &longContextOptimizationSetting
}

func ValidateLongContextOptimizationOption(key, value string) error {
	if !strings.HasPrefix(key, longContextOptimizationPrefix) {
		return nil
	}

	field := strings.TrimPrefix(key, longContextOptimizationPrefix)
	switch field {
	case "enabled", "server_side_compaction_enabled", "override_existing_compaction", "reasoning_downgrade_enabled":
		if _, err := strconv.ParseBool(strings.TrimSpace(value)); err != nil {
			return fmt.Errorf("%s must be true or false", key)
		}
	case "compact_threshold_tokens", "reasoning_threshold_tokens":
		threshold, err := strconv.Atoi(strings.TrimSpace(value))
		if err != nil || threshold < 1_000 || threshold > 1_000_000 {
			return fmt.Errorf("%s must be an integer between 1000 and 1000000", key)
		}
	case "reasoning_target_effort":
		switch strings.ToLower(strings.TrimSpace(value)) {
		case "low", "medium", "high":
		default:
			return fmt.Errorf("%s must be low, medium, or high", key)
		}
	case "apply_to_user_ids", "apply_to_token_ids":
		if err := validatePositiveIDList(value); err != nil {
			return fmt.Errorf("%s: %w", key, err)
		}
	case "apply_to_groups":
		if strings.ContainsAny(value, "\r\n") {
			return fmt.Errorf("%s must be a comma-separated list", key)
		}
	default:
		return fmt.Errorf("unknown long-context optimization setting: %s", key)
	}
	return nil
}

func validatePositiveIDList(value string) error {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	for _, raw := range strings.Split(value, ",") {
		id, err := strconv.Atoi(strings.TrimSpace(raw))
		if err != nil || id <= 0 {
			return fmt.Errorf("IDs must be positive integers separated by commas")
		}
	}
	return nil
}
