package model

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/require"
)

func TestChannelValidateSettingsUpstreamRequestGzipThreshold(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		setting   string
		wantError string
	}{
		{name: "legacy settings", setting: `{}`},
		{name: "default threshold", setting: `{"upstream_request_gzip_enabled":true}`},
		{name: "valid threshold", setting: `{"upstream_request_gzip_enabled":true,"upstream_request_gzip_min_bytes":1048576}`},
		{name: "negative", setting: `{"upstream_request_gzip_min_bytes":-1}`, wantError: "cannot be negative"},
		{name: "too small", setting: `{"upstream_request_gzip_min_bytes":1023}`, wantError: "must be at least"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			setting := test.setting
			channel := &Channel{Type: constant.ChannelTypeOpenAI, Setting: &setting}
			err := channel.ValidateSettings()
			if test.wantError == "" {
				require.NoError(t, err)
				return
			}
			require.ErrorContains(t, err, test.wantError)
		})
	}
}

func TestChannelValidateSettingsUpstreamRequestGzipCapability(t *testing.T) {
	t.Parallel()

	enabledSetting := `{"upstream_request_gzip_enabled":true}`
	disabledSetting := `{"upstream_request_gzip_enabled":false}`

	require.NoError(t, (&Channel{Type: constant.ChannelTypeAnthropic, Setting: &enabledSetting}).ValidateSettings())
	require.ErrorContains(t, (&Channel{Type: constant.ChannelTypeAws, Setting: &enabledSetting}).ValidateSettings(), "not supported")
	require.NoError(t, (&Channel{Type: constant.ChannelTypeAws, Setting: &disabledSetting}).ValidateSettings())
}
