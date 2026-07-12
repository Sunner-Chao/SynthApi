package common

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	projectcommon "github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestUpstreamRequestTraceCapturesRequestAndResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		require.Equal(t, "request-body", string(body))
		w.Header().Set("CF-Ray", "abc123-SJC")
		w.Header().Set("Server-Timing", "queue;dur=12")
		_, err = w.Write([]byte("response-body"))
		require.NoError(t, err)
	}))
	t.Cleanup(server.Close)

	trace := NewUpstreamRequestTrace("direct")
	req, err := http.NewRequest(http.MethodPost, server.URL, strings.NewReader("request-body"))
	require.NoError(t, err)
	req = trace.Attach(req)

	resp, err := server.Client().Do(req)
	require.NoError(t, err)
	trace.ObserveResponse(resp)
	responseBody, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())
	require.Equal(t, "response-body", string(responseBody))

	snapshot := trace.Snapshot()
	require.True(t, snapshot.Direct)
	require.Equal(t, "direct", snapshot.ProxyMode)
	require.True(t, snapshot.TCPObserved)
	require.False(t, snapshot.ConnReused)
	require.Equal(t, 1, snapshot.GotConnEvents)
	require.Equal(t, 1, snapshot.WroteRequestEvents)
	require.EqualValues(t, len("request-body"), snapshot.RequestBytes)
	require.EqualValues(t, len("response-body"), snapshot.ResponseBytes)
	require.False(t, snapshot.WroteRequestAt.IsZero())
	require.False(t, snapshot.FirstHeaderByteAt.IsZero())
	require.False(t, snapshot.FirstBodyByteAt.IsZero())
	require.False(t, snapshot.ResponseBodyDoneAt.IsZero())
	require.Equal(t, "abc123-SJC", snapshot.CFRay)
	require.Equal(t, "SJC", snapshot.CFColo)
	require.Equal(t, "queue;dur=12", snapshot.ServerTiming)
}

func TestUpstreamRequestTraceDetectsReusedConnection(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, err := w.Write([]byte("ok"))
		require.NoError(t, err)
	}))
	t.Cleanup(server.Close)
	client := server.Client()

	doRequest := func() UpstreamTraceSnapshot {
		trace := NewUpstreamRequestTrace("direct")
		req, err := http.NewRequest(http.MethodGet, server.URL, nil)
		require.NoError(t, err)
		resp, err := client.Do(trace.Attach(req))
		require.NoError(t, err)
		trace.ObserveResponse(resp)
		_, err = io.Copy(io.Discard, resp.Body)
		require.NoError(t, err)
		require.NoError(t, resp.Body.Close())
		return trace.Snapshot()
	}

	first := doRequest()
	second := doRequest()
	require.False(t, first.ConnReused)
	require.True(t, second.ConnReused)
	require.False(t, second.TCPObserved)
}

func TestUpstreamRequestTraceCountsRedirectBodyReplay(t *testing.T) {
	const requestBody = "request-body"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/start" {
			http.Redirect(w, r, "/finish", http.StatusTemporaryRedirect)
			return
		}
		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		require.Equal(t, requestBody, string(body))
		_, err = w.Write([]byte("ok"))
		require.NoError(t, err)
	}))
	t.Cleanup(server.Close)

	trace := NewUpstreamRequestTrace("direct")
	req, err := http.NewRequest(http.MethodPost, server.URL+"/start", strings.NewReader(requestBody))
	require.NoError(t, err)
	resp, err := server.Client().Do(trace.Attach(req))
	require.NoError(t, err)
	trace.ObserveResponse(resp)
	_, err = io.Copy(io.Discard, resp.Body)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())

	snapshot := trace.Snapshot()
	require.Equal(t, 2, snapshot.GotConnEvents)
	require.Equal(t, 2, snapshot.WroteRequestEvents)
	require.EqualValues(t, 2*len(requestBody), snapshot.RequestBytes)
	require.False(t, snapshot.FirstHeaderByteAt.Before(snapshot.WroteRequestAt))
	require.GreaterOrEqual(t, snapshot.TimeToFirstHeaderByte, time.Duration(0))
}

func TestRelayInfoCapsUpstreamTraceAttempts(t *testing.T) {
	info := &RelayInfo{upstreamTraceCollector: newUpstreamTraceCollector()}
	for i := 0; i < maxUpstreamTraces+2; i++ {
		info.AddUpstreamTrace(NewUpstreamRequestTrace("direct"))
	}
	snapshots, overflow := info.UpstreamTraceSnapshots()
	require.Len(t, snapshots, maxUpstreamTraces)
	require.Equal(t, 2, overflow)
}

func TestRelayInfoCopySharesUpstreamTraceCollector(t *testing.T) {
	info := &RelayInfo{upstreamTraceCollector: newUpstreamTraceCollector()}
	infoCopy := *info

	var wg sync.WaitGroup
	for i := 0; i < maxUpstreamTraces+2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			infoCopy.AddUpstreamTrace(NewUpstreamRequestTrace("direct"))
		}()
	}
	wg.Wait()

	snapshots, overflow := info.UpstreamTraceSnapshots()
	require.Len(t, snapshots, maxUpstreamTraces)
	require.Equal(t, 2, overflow)
}

func TestRelayInfoWithoutUpstreamTraceCollectorIsSafe(t *testing.T) {
	info := &RelayInfo{}
	info.AddUpstreamTrace(NewUpstreamRequestTrace("direct"))

	snapshots, overflow := info.UpstreamTraceSnapshots()
	require.Empty(t, snapshots)
	require.Zero(t, overflow)
}

func TestPublicUpstreamAttemptsExcludeRemoteAddresses(t *testing.T) {
	now := time.Now()
	trace := NewUpstreamRequestTrace("https://203.0.113.7:8443")
	trace.mu.Lock()
	trace.gotConnAt = now.Add(-4 * time.Second)
	trace.wroteRequestAt = now.Add(-3 * time.Second)
	trace.firstHeaderByteAt = now.Add(-2500 * time.Millisecond)
	trace.firstBodyByteAt = now.Add(-2 * time.Second)
	trace.responseBodyDoneAt = now
	trace.gotConnEvents = 1
	trace.wroteRequestEvents = 1
	trace.httpProto = "HTTP/2.0"
	trace.cfRay = "abc123-SJC"
	trace.cfColo = "SJC"
	trace.serverTiming = `queue;dur=12;desc="203.0.113.8",ip-203.0.113.9;dur=5,compute;desc="2001:db8::6";dur=20`
	trace.mu.Unlock()

	info := &RelayInfo{
		StartTime:              now.Add(-5 * time.Second),
		FirstResponseTime:      now.Add(-1500 * time.Millisecond),
		upstreamTraceCollector: newUpstreamTraceCollector(),
	}
	info.AddUpstreamTrace(trace)
	attempts, overflow := info.PublicUpstreamAttempts()
	require.Zero(t, overflow)
	require.Len(t, attempts, 1)
	require.Equal(t, "unknown", attempts[0].Route)
	require.Len(t, attempts[0].ServerTiming, 2)

	encoded, err := projectcommon.Marshal(attempts)
	require.NoError(t, err)
	serialized := string(encoded)
	require.NotContains(t, serialized, "remote_ip")
	require.NotContains(t, serialized, "203.0.113")
	require.NotContains(t, serialized, "2001:db8")
	require.NotContains(t, serialized, "desc")
	require.Contains(t, serialized, `"name":"queue"`)
	require.Contains(t, serialized, `"name":"compute"`)
}

func TestPublicUpstreamAttemptsRejectEncodedAddressHeaders(t *testing.T) {
	trace := NewUpstreamRequestTrace("direct")
	trace.mu.Lock()
	trace.cfRay = "10-0-0-5"
	trace.cfColo = "5"
	trace.serverTiming = "origin_10_0_0_5;dur=1,host-203-0-113-7;dur=2,ip_2001_db8_1;dur=3,queue;dur=4"
	trace.mu.Unlock()

	info := &RelayInfo{upstreamTraceCollector: newUpstreamTraceCollector()}
	info.AddUpstreamTrace(trace)
	attempts, _ := info.PublicUpstreamAttempts()
	require.Len(t, attempts, 1)
	require.Empty(t, attempts[0].CFRay)
	require.Empty(t, attempts[0].CFColo)
	require.Equal(t, []PublicServerTimingMetric{{Name: "queue", DurationMs: float64Pointer(4)}}, attempts[0].ServerTiming)

	encoded, err := projectcommon.Marshal(attempts)
	require.NoError(t, err)
	require.NotContains(t, string(encoded), "10_0_0_5")
	require.NotContains(t, string(encoded), "203-0-113-7")
	require.NotContains(t, string(encoded), "2001_db8_1")
}

func float64Pointer(value float64) *float64 {
	return &value
}
