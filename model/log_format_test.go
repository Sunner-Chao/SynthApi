package model

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestClassifyIngressHost(t *testing.T) {
	tests := []struct {
		name     string
		host     string
		wantHost string
		wantLine string
	}{
		{name: "fast IP", host: "116.62.113.242", wantHost: "116.62.113.242", wantLine: ingressLineFast},
		{name: "fast IP with port", host: "116.62.113.242:443", wantHost: "116.62.113.242", wantLine: ingressLineFast},
		{name: "official primary", host: "synthapi.asia", wantHost: "synthapi.asia", wantLine: ingressLineOfficial},
		{name: "official primary normalized", host: "SYNTHAPI.ASIA.:443", wantHost: "synthapi.asia", wantLine: ingressLineOfficial},
		{name: "official backup", host: "api.synthapi.asia:443", wantHost: "api.synthapi.asia", wantLine: ingressLineOfficial},
		{name: "unknown", host: "admin.synthapi.asia", wantHost: "", wantLine: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			host, line := classifyIngressHost(tt.host)
			require.Equal(t, tt.wantHost, host)
			require.Equal(t, tt.wantLine, line)
		})
	}
}

func TestAppendIngressLogInfo(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldNodeName := common.NodeName
	common.NodeName = "shanghai-worker"
	t.Cleanup(func() { common.NodeName = oldNodeName })
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "https://116.62.113.242/v1/responses", nil)
	common.SetContextKey(c, constant.ContextKeyChannelConcurrencyActive, 7)
	common.SetContextKey(c, constant.ContextKeyChannelConcurrencyLimit, 15)

	other := appendIngressLogInfo(c, nil)
	require.Equal(t, "116.62.113.242", other["ingress_host"])
	require.Equal(t, ingressLineFast, other["ingress_line"])
	require.Equal(t, "shanghai-worker", other["worker_node"])
	require.Equal(t, 7, other["channel_concurrency_active"])
	require.Equal(t, 15, other["channel_concurrency_limit"])
}

func TestAppendIngressLogInfoIgnoresClientLineHeader(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "https://116.62.113.242/v1/responses", nil)
	c.Request.Header.Set("X-SynthAPI-Ingress-Line", ingressLineOfficial)

	other := appendIngressLogInfo(c, map[string]interface{}{})
	require.Equal(t, "116.62.113.242", other["ingress_host"])
	require.Equal(t, ingressLineFast, other["ingress_line"])
}

func TestFormatUserLogsKeepsPublicRelayTrace(t *testing.T) {
	logs := []*Log{{
		Id:          99,
		ChannelName: "private-channel",
		Other: common.MapToJsonStr(map[string]interface{}{
			"admin_info":    map[string]interface{}{"use_channel": []int{1}},
			"stream_status": map[string]interface{}{"status": "ok"},
			"ingress_host":  "116.62.113.242",
			"ingress_line":  ingressLineFast,
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
	require.Equal(t, "116.62.113.242", other["ingress_host"])
	require.Equal(t, ingressLineFast, other["ingress_line"])
	require.Contains(t, other, "relay_trace")
}
