package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestFormatUserLogsKeepsPublicRelayTrace(t *testing.T) {
	logs := []*Log{{
		Id:          99,
		ChannelName: "private-channel",
		Other: common.MapToJsonStr(map[string]interface{}{
			"admin_info":    map[string]interface{}{"use_channel": []int{1}},
			"stream_status": map[string]interface{}{"status": "ok"},
			"relay_trace": map[string]interface{}{
				"version": 1,
				"client":  map[string]interface{}{"user_agent": "test-client"},
			},
		}),
	}}

	formatUserLogs(logs, 10)
	require.Equal(t, 11, logs[0].Id)
	require.Empty(t, logs[0].ChannelName)

	other, err := common.StrToMap(logs[0].Other)
	require.NoError(t, err)
	require.NotContains(t, other, "admin_info")
	require.NotContains(t, other, "stream_status")
	require.Contains(t, other, "relay_trace")
}
