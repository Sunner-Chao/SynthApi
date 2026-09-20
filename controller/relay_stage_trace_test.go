package controller

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestRelayTraceResponseWriterCapturesWrites(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	w := &relayTraceResponseWriter{ResponseWriter: c.Writer}
	require.Same(t, c.Writer, w.Unwrap())
	var _ interface{ Unwrap() http.ResponseWriter } = w

	n, err := w.WriteString("hello")
	require.NoError(t, err)
	require.Equal(t, 5, n)
	w.Flush()

	snapshot := w.snapshot()
	require.False(t, snapshot.firstWriteAt.IsZero())
	require.False(t, snapshot.lastWriteAt.IsZero())
	require.GreaterOrEqual(t, snapshot.lastWriteAt, snapshot.firstWriteAt)
	require.Equal(t, 5, snapshot.bytes)
	require.GreaterOrEqual(t, snapshot.writeBlocked.Nanoseconds(), int64(0))
}

func TestRelayTraceResponseWriterSerializesConcurrentWrites(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	w := &relayTraceResponseWriter{ResponseWriter: c.Writer}

	const writes = 16
	errs := make(chan error, writes)
	var wg sync.WaitGroup
	for i := 0; i < writes; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := w.WriteString("x")
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		require.NoError(t, err)
	}

	snapshot := w.snapshot()
	require.Equal(t, writes, snapshot.bytes)
	require.Equal(t, writes, recorder.Body.Len())
}

func TestRelayStageTraceDoesNotWrapWriterWhenDisabled(t *testing.T) {
	oldThreshold := common.RelayStageLogThresholdMs
	oldConsumeLog := common.LogConsumeEnabled
	oldErrorLog := constant.ErrorLogEnabled
	common.RelayStageLogThresholdMs = 0
	common.LogConsumeEnabled = false
	constant.ErrorLogEnabled = false
	t.Cleanup(func() {
		common.RelayStageLogThresholdMs = oldThreshold
		common.LogConsumeEnabled = oldConsumeLog
		constant.ErrorLogEnabled = oldErrorLog
	})

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	originalWriter := c.Writer
	trace := newRelayStageTrace(c)

	require.Nil(t, trace.clientWriter)
	require.Same(t, originalWriter, c.Writer)
}

func TestRelayStageTraceSnapshotIncludesActiveUpstreamRelay(t *testing.T) {
	now := time.Now()
	trace := &relayStageTrace{
		startAt:         now.Add(-100 * time.Millisecond),
		relayEnteredAt:  now.Add(-90 * time.Millisecond),
		upstreamStarted: now.Add(-20 * time.Millisecond),
		attempts:        1,
	}

	snapshot := trace.SnapshotRelayStageMetrics()
	require.GreaterOrEqual(t, snapshot.UpstreamRelay, 20*time.Millisecond)
	require.GreaterOrEqual(t, snapshot.Total, 100*time.Millisecond)
	require.Equal(t, 1, snapshot.Attempts)
}
