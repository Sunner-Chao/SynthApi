package dto

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestChannelOtherSettingsDetectsImportedAccount(t *testing.T) {
	var settings ChannelOtherSettings
	err := common.Unmarshal([]byte(`{"imported_account_platform":"codex"}`), &settings)
	require.NoError(t, err)
	require.True(t, settings.IsImportedAccountChannel())
}

func TestChannelOtherSettingsDetectsRegularChannel(t *testing.T) {
	settings := ChannelOtherSettings{AzureResponsesVersion: "preview"}
	require.False(t, settings.IsImportedAccountChannel())
}

func TestChannelSettingsEffectiveUpstreamRequestGzipMinBytes(t *testing.T) {
	t.Parallel()

	require.Equal(t, DefaultUpstreamRequestGzipMinBytes, (ChannelSettings{}).EffectiveUpstreamRequestGzipMinBytes())
	require.Equal(t, int64(2<<20), (ChannelSettings{UpstreamRequestGzipMinBytes: 2 << 20}).EffectiveUpstreamRequestGzipMinBytes())
}

func TestChannelSettingsEffectiveUpstreamRequestGzipEnabled(t *testing.T) {
	t.Parallel()

	require.True(t, (ChannelSettings{}).EffectiveUpstreamRequestGzipEnabled(true))
	require.False(t, (ChannelSettings{}).EffectiveUpstreamRequestGzipEnabled(false))
	require.True(t, (ChannelSettings{UpstreamRequestGzipEnabled: common.GetPointer(true)}).EffectiveUpstreamRequestGzipEnabled(false))
	require.False(t, (ChannelSettings{UpstreamRequestGzipEnabled: common.GetPointer(false)}).EffectiveUpstreamRequestGzipEnabled(true))
}

func TestChannelSettingsPreservesExplicitFalseGzipOverride(t *testing.T) {
	t.Parallel()

	settings := ChannelSettings{UpstreamRequestGzipEnabled: common.GetPointer(false)}
	encoded, err := common.Marshal(settings)
	require.NoError(t, err)
	require.JSONEq(t, `{"proxy":"","upstream_request_gzip_enabled":false}`, string(encoded))

	var decoded ChannelSettings
	require.NoError(t, common.Unmarshal(encoded, &decoded))
	require.NotNil(t, decoded.UpstreamRequestGzipEnabled)
	require.False(t, *decoded.UpstreamRequestGzipEnabled)
}

func TestChannelSettingsEffectiveConcurrencyLimits(t *testing.T) {
	settings := ChannelSettings{}
	require.Equal(t, 15, settings.EffectiveMaxConcurrency(15))
	require.Equal(t, 6, settings.EffectiveMaxConcurrencyPerUser(6))

	settings.MaxConcurrency = 20
	settings.MaxConcurrencyPerUser = 8
	require.Equal(t, 20, settings.EffectiveMaxConcurrency(15))
	require.Equal(t, 8, settings.EffectiveMaxConcurrencyPerUser(6))
}

func TestImportedAccountMonitorLowQuota(t *testing.T) {
	settings := ChannelOtherSettings{
		ImportedAccountPlatform: "codex",
		ImportedAccountMonitor: map[string]any{
			"quota_status":  "success",
			"quota_message": "5h 100% · 7d 20%",
		},
	}
	require.True(t, settings.ImportedAccountMonitorLowQuota())

	settings.ImportedAccountMonitor["quota_message"] = "5h 12% · 7d 20%"
	require.False(t, settings.ImportedAccountMonitorLowQuota())

	settings.ImportedAccountMonitor["quota_message"] = "5h 96% · 7d 20%"
	require.True(t, settings.ImportedAccountMonitorLowQuota())

	settings.ImportedAccountMonitor["quota_status"] = "exhausted"
	require.True(t, settings.ImportedAccountMonitorLowQuota())
}
