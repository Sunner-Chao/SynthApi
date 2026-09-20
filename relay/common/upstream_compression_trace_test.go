package common

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestPublicUpstreamAttemptIncludesSafeCompressionMetadata(t *testing.T) {
	t.Parallel()

	info := &RelayInfo{upstreamTraceCollector: newUpstreamTraceCollector()}
	trace := NewUpstreamRequestTrace("direct")
	trace.SetRequestBodyMetadata("gzip", 4<<20, 12*time.Millisecond, 3*time.Millisecond, 5)
	info.AddUpstreamTrace(trace)

	req := httptest.NewRequest(http.MethodPost, "https://example.com/v1/responses", bytes.NewReader([]byte("compressed")))
	req = trace.Attach(req)
	_, err := io.ReadAll(req.Body)
	require.NoError(t, err)

	attempts, overflow := info.PublicUpstreamAttempts()
	require.Zero(t, overflow)
	require.Len(t, attempts, 1)
	require.Equal(t, "gzip", attempts[0].RequestContentEncoding)
	require.Equal(t, int64(4<<20), attempts[0].RequestOriginalBytes)
	require.NotNil(t, attempts[0].RequestCompressionMs)
	require.Equal(t, int64(12), *attempts[0].RequestCompressionMs)
	require.NotNil(t, attempts[0].RequestCompressionQueueMs)
	require.Equal(t, int64(3), *attempts[0].RequestCompressionQueueMs)
	require.Equal(t, 5, attempts[0].RequestCompressionLevel)
	require.Equal(t, int64(len("compressed")), attempts[0].RequestBytesTotal)
}
