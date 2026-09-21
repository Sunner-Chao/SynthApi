package operation_setting

import "testing"

func TestValidateLongContextOptimizationOption(t *testing.T) {
	tests := []struct {
		name    string
		key     string
		value   string
		wantErr bool
	}{
		{name: "unrelated", key: "RetryTimes", value: "2"},
		{name: "boolean", key: "long_context_optimization.enabled", value: "true"},
		{name: "bad boolean", key: "long_context_optimization.enabled", value: "yes", wantErr: true},
		{name: "threshold", key: "long_context_optimization.compact_threshold_tokens", value: "50000"},
		{name: "threshold too small", key: "long_context_optimization.compact_threshold_tokens", value: "999", wantErr: true},
		{name: "effort", key: "long_context_optimization.reasoning_target_effort", value: "high"},
		{name: "bad effort", key: "long_context_optimization.reasoning_target_effort", value: "xhigh", wantErr: true},
		{name: "ids", key: "long_context_optimization.apply_to_token_ids", value: "15, 20"},
		{name: "empty ids", key: "long_context_optimization.apply_to_user_ids", value: ""},
		{name: "bad ids", key: "long_context_optimization.apply_to_user_ids", value: "20,zero", wantErr: true},
		{name: "unknown", key: "long_context_optimization.unknown", value: "true", wantErr: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := ValidateLongContextOptimizationOption(test.key, test.value)
			if (err != nil) != test.wantErr {
				t.Fatalf("ValidateLongContextOptimizationOption() error = %v, wantErr %v", err, test.wantErr)
			}
		})
	}
}
