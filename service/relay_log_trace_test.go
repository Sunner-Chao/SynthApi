package service

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type relayTraceStageProviderStub struct {
	snapshot relaycommon.RelayStageMetricsSnapshot
}

func (s relayTraceStageProviderStub) SnapshotRelayStageMetrics() relaycommon.RelayStageMetricsSnapshot {
	return s.snapshot
}

func TestAppendRelayTraceLogInfoIncludesClientAndStageMetrics(t *testing.T) {
	gin.SetMode(gin.TestMode)
	now := time.Now()
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest("POST", "http://example.com/v1/responses", nil)
	c.Request.Header.Set("User-Agent", "Codex CLI\n1.0")
	c.Request.Header.Set("CF-Ray", "abc123-SIN")
	c.Request.Header.Set("CF-IPCountry", "sg")
	c.Request.Header.Set("CF-Region", "Central Singapore")
	c.Request.Header.Set("CF-Region-Code", "SG-01")
	c.Request.Header.Set("CF-IPCity", "Singapore")
	c.Request.Header.Set("CF-Timezone", "Asia/Singapore")
	c.Set(common.KeyRequestBodyMetrics, common.RequestBodyMetrics{
		Bytes:    1024,
		ReadTime: 25 * time.Millisecond,
		Disk:     true,
	})
	c.Set(ginKeyChannelAffinityLogInfo, map[string]interface{}{"key_fp": "A1B2C3D4"})

	info := &relaycommon.RelayInfo{
		StartTime:         now.Add(-2 * time.Second),
		FirstResponseTime: now.Add(-500 * time.Millisecond),
		StageMetricsProvider: relayTraceStageProviderStub{snapshot: relaycommon.RelayStageMetricsSnapshot{
			Total:                2 * time.Second,
			IngressBeforeRelay:   20 * time.Millisecond,
			ValidateRequest:      5 * time.Millisecond,
			PromptCacheQueue:     125 * time.Millisecond,
			ChannelCapacityQueue: 250 * time.Millisecond,
			UpstreamRelay:        1500 * time.Millisecond,
			Attempts:             1,
			ClientWriterObserved: true,
			ClientFirstWrite:     1500 * time.Millisecond,
			ClientFirstWriteSet:  true,
			ClientStreamSpan:     400 * time.Millisecond,
			ClientStreamSpanSet:  true,
			ClientWriteBlocked:   3 * time.Millisecond,
			ClientResponseBytes:  2048,
		}},
	}
	other := map[string]interface{}{}
	AppendRelayTraceLogInfo(c, info, other)

	trace, ok := other["relay_trace"].(relayTraceLog)
	require.True(t, ok)
	require.Equal(t, relayTraceLogVersion, trace.Version)
	require.Equal(t, "a1b2c3d4", trace.AffinityFP)
	require.Equal(t, "unavailable", trace.Coverage)
	require.NotNil(t, trace.Client)
	require.Equal(t, "Codex CLI 1.0", trace.Client.UserAgent)
	require.Equal(t, "HTTP/1.1", trace.Client.HTTPProtocol)
	require.Equal(t, "SIN", trace.Client.CFColo)
	require.Equal(t, "SG", trace.Client.Country)
	require.Equal(t, "Singapore", trace.Client.City)
	require.Equal(t, "disk", trace.Client.BodyStorage)
	require.EqualValues(t, 1024, *trace.Client.RequestBytes)
	require.EqualValues(t, 2048, *trace.Client.ResponseBytes)
	require.NotNil(t, trace.Gateway)
	require.EqualValues(t, 125, trace.Gateway.PromptCacheQueueMs)
	require.EqualValues(t, 250, trace.Gateway.ChannelCapacityQueueMs)
	require.EqualValues(t, 1500, trace.Gateway.UpstreamRelayMs)
	require.EqualValues(t, 1500, *trace.Gateway.FirstEventMs)

	encoded, err := common.Marshal(other)
	require.NoError(t, err)
	require.NotContains(t, string(encoded), "remote_ip")
	require.NotContains(t, string(encoded), "client_ip")
}
