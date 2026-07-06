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

	settings.ImportedAccountMonitor["quota_status"] = "exhausted"
	require.True(t, settings.ImportedAccountMonitorLowQuota())
}
