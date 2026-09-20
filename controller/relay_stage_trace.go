package controller

import (
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

type relayStageTrace struct {
	startAt        time.Time
	relayEnteredAt time.Time
	clientWriter   *relayTraceResponseWriter

	validateRequest      time.Duration
	genRelayInfo         time.Duration
	preprocess           time.Duration
	pricing              time.Duration
	preConsume           time.Duration
	selectChannel        time.Duration
	refreshBilling       time.Duration
	bodyStorage          time.Duration
	promptCacheQueue     time.Duration
	channelCapacityQueue time.Duration
	upstreamRelay        time.Duration
	upstreamStarted      time.Time

	attempts  int
	channelID int
	group     string
}

func newRelayStageTrace(c *gin.Context) *relayStageTrace {
	now := time.Now()
	startAt := common.GetContextKeyTime(c, constant.ContextKeyRequestStartTime)
	if startAt.IsZero() || startAt.After(now) {
		startAt = now
	}
	trace := &relayStageTrace{
		startAt:        startAt,
		relayEnteredAt: now,
	}
	trace.promptCacheQueue, _ = common.GetContextKeyType[time.Duration](c, constant.ContextKeyPromptCacheQueue)
	trace.channelCapacityQueue, _ = common.GetContextKeyType[time.Duration](c, constant.ContextKeyChannelCapacityQueue)
	traceResponse := common.RelayStageLogThresholdMs > 0 || common.LogConsumeEnabled || constant.ErrorLogEnabled
	if traceResponse && c != nil && c.Writer != nil {
		writer := &relayTraceResponseWriter{ResponseWriter: c.Writer}
		trace.clientWriter = writer
		c.Writer = writer
	}
	return trace
}

func (t *relayStageTrace) beginUpstreamRelay() {
	if t == nil || !t.upstreamStarted.IsZero() {
		return
	}
	t.upstreamStarted = time.Now()
}

func (t *relayStageTrace) endUpstreamRelay() {
	if t == nil || t.upstreamStarted.IsZero() {
		return
	}
	t.upstreamRelay += time.Since(t.upstreamStarted)
	t.upstreamStarted = time.Time{}
}

func (t *relayStageTrace) SnapshotRelayStageMetrics() relaycommon.RelayStageMetricsSnapshot {
	if t == nil {
		return relaycommon.RelayStageMetricsSnapshot{}
	}
	now := time.Now()
	upstreamRelay := t.upstreamRelay
	if !t.upstreamStarted.IsZero() {
		upstreamRelay += now.Sub(t.upstreamStarted)
	}
	snapshot := relaycommon.RelayStageMetricsSnapshot{
		Total:                now.Sub(t.startAt),
		IngressBeforeRelay:   t.relayEnteredAt.Sub(t.startAt),
		ValidateRequest:      t.validateRequest,
		GenRelayInfo:         t.genRelayInfo,
		Preprocess:           t.preprocess,
		Pricing:              t.pricing,
		PreConsume:           t.preConsume,
		SelectChannel:        t.selectChannel,
		RefreshBilling:       t.refreshBilling,
		BodyStorage:          t.bodyStorage,
		PromptCacheQueue:     t.promptCacheQueue,
		ChannelCapacityQueue: t.channelCapacityQueue,
		UpstreamRelay:        upstreamRelay,
		Attempts:             t.attempts,
	}
	if t.clientWriter == nil {
		return snapshot
	}
	writer := t.clientWriter.snapshot()
	snapshot.ClientWriterObserved = true
	snapshot.ClientWriteBlocked = writer.writeBlocked
	snapshot.ClientResponseBytes = writer.bytes
	if !writer.firstWriteAt.IsZero() {
		snapshot.ClientFirstWrite = writer.firstWriteAt.Sub(t.startAt)
		snapshot.ClientFirstWriteSet = true
	}
	if !writer.firstWriteAt.IsZero() && !writer.lastWriteAt.IsZero() {
		snapshot.ClientStreamSpan = writer.lastWriteAt.Sub(writer.firstWriteAt)
		snapshot.ClientStreamSpanSet = true
	}
	return snapshot
}

func (t *relayStageTrace) addSince(target *time.Duration, start time.Time) {
	if t == nil || target == nil || start.IsZero() {
		return
	}
	*target += time.Since(start)
}

func (t *relayStageTrace) setSelected(channelID int, group string) {
	if t == nil {
		return
	}
	t.attempts++
	if channelID > 0 {
		t.channelID = channelID
	}
	group = strings.TrimSpace(group)
	if group != "" {
		t.group = group
	}
}

func (t *relayStageTrace) logIfSlow(c *gin.Context, info *relaycommon.RelayInfo, relayErr *types.NewAPIError) {
	if t == nil || common.RelayStageLogThresholdMs <= 0 {
		return
	}
	total := time.Since(t.startAt)
	if relayErr == nil && total.Milliseconds() < int64(common.RelayStageLogThresholdMs) {
		return
	}

	status := "ok"
	statusCode := 200
	errCode := ""
	if relayErr != nil {
		status = "error"
		statusCode = relayErr.StatusCode
		errCode = string(relayErr.GetErrorCode())
	}

	modelName := ""
	group := t.group
	firstEventMs := int64(-1)
	upstreamToFirstEventMs := int64(-1)
	applicationStreamAfterFirstEventMs := int64(-1)
	traceSnapshots := []relaycommon.UpstreamTraceSnapshot(nil)
	traceOverflow := 0
	if info != nil {
		modelName = info.OriginModelName
		if strings.TrimSpace(group) == "" {
			group = info.UsingGroup
		}
		if info.HasSendResponse() {
			firstEventMs = info.FirstResponseTime.Sub(t.startAt).Milliseconds()
		}
		traceSnapshots, traceOverflow = info.UpstreamTraceSnapshots()
		if len(traceSnapshots) > 0 && info.HasSendResponse() {
			last := traceSnapshots[len(traceSnapshots)-1]
			if !last.WroteRequestAt.IsZero() && info.FirstResponseTime.After(last.WroteRequestAt) {
				upstreamToFirstEventMs = info.FirstResponseTime.Sub(last.WroteRequestAt).Milliseconds()
			}
			if !last.ResponseBodyDoneAt.IsZero() && last.ResponseBodyDoneAt.After(info.FirstResponseTime) {
				applicationStreamAfterFirstEventMs = last.ResponseBodyDoneAt.Sub(info.FirstResponseTime).Milliseconds()
			}
		}
	}

	bodyReadMs := int64(-1)
	clientRequestBytes := int64(0)
	bodyStoredOnDisk := false
	bodyMetricsObserved := false
	if bodyMetrics, ok := common.GetRequestBodyMetrics(c); ok {
		bodyMetricsObserved = true
		bodyReadMs = bodyMetrics.ReadTime.Milliseconds()
		clientRequestBytes = bodyMetrics.Bytes
		bodyStoredOnDisk = bodyMetrics.Disk
	}

	clientFirstWriteMs := int64(-1)
	clientStreamSpanMs := int64(-1)
	clientWriteBlockedMs := int64(0)
	clientResponseBytes := 0
	if t.clientWriter != nil {
		writerSnapshot := t.clientWriter.snapshot()
		clientResponseBytes = writerSnapshot.bytes
		clientWriteBlockedMs = writerSnapshot.writeBlocked.Milliseconds()
		if !writerSnapshot.firstWriteAt.IsZero() {
			clientFirstWriteMs = writerSnapshot.firstWriteAt.Sub(t.startAt).Milliseconds()
		}
		if !writerSnapshot.firstWriteAt.IsZero() && !writerSnapshot.lastWriteAt.IsZero() {
			clientStreamSpanMs = writerSnapshot.lastWriteAt.Sub(writerSnapshot.firstWriteAt).Milliseconds()
		}
	}

	inboundCFRay := ""
	if c != nil && c.Request != nil {
		inboundCFRay = strings.TrimSpace(c.Request.Header.Get("CF-Ray"))
	}
	inboundCFColo := relaycommon.CloudflareColo(inboundCFRay)
	affinityFingerprint := service.GetChannelAffinityFingerprint(c)
	ingressBeforeRelayMs := t.relayEnteredAt.Sub(t.startAt).Milliseconds()
	traceCoverage := "unavailable"
	if len(traceSnapshots) > 0 {
		traceCoverage = "central_http"
	}

	logger.LogInfo(c, fmt.Sprintf(
		"relay stage latency: status=%s status_code=%d err_code=%s total_ms=%d ingress_before_relay_ms=%d client_body_observed=%t client_body_read_ms=%d client_request_bytes=%d client_body_disk=%t validate_ms=%d relay_info_ms=%d preprocess_ms=%d pricing_ms=%d pre_consume_ms=%d select_channel_ms=%d refresh_billing_ms=%d body_storage_ms=%d prompt_cache_queue_ms=%d channel_capacity_queue_ms=%d upstream_relay_ms=%d first_event_ms=%d upstream_to_first_event_ms=%d application_stream_after_first_event_ms=%d client_first_write_ms=%d client_stream_span_ms=%d client_write_blocked_ms=%d client_response_bytes=%d attempts=%d trace_coverage=%s trace_attempts=%d trace_overflow=%d model=%q group=%q channel_id=%d inbound_cf_ray=%q inbound_cf_colo=%q affinity_fp=%q",
		status,
		statusCode,
		errCode,
		total.Milliseconds(),
		ingressBeforeRelayMs,
		bodyMetricsObserved,
		bodyReadMs,
		clientRequestBytes,
		bodyStoredOnDisk,
		t.validateRequest.Milliseconds(),
		t.genRelayInfo.Milliseconds(),
		t.preprocess.Milliseconds(),
		t.pricing.Milliseconds(),
		t.preConsume.Milliseconds(),
		t.selectChannel.Milliseconds(),
		t.refreshBilling.Milliseconds(),
		t.bodyStorage.Milliseconds(),
		t.promptCacheQueue.Milliseconds(),
		t.channelCapacityQueue.Milliseconds(),
		t.upstreamRelay.Milliseconds(),
		firstEventMs,
		upstreamToFirstEventMs,
		applicationStreamAfterFirstEventMs,
		clientFirstWriteMs,
		clientStreamSpanMs,
		clientWriteBlockedMs,
		clientResponseBytes,
		t.attempts,
		traceCoverage,
		len(traceSnapshots),
		traceOverflow,
		modelName,
		group,
		t.channelID,
		inboundCFRay,
		inboundCFColo,
		affinityFingerprint,
	))

	for attempt, snapshot := range traceSnapshots {
		attemptUpstreamToFirstEventMs := int64(-1)
		attemptApplicationStreamAfterFirstEventMs := int64(-1)
		if attempt == len(traceSnapshots)-1 && info != nil && info.HasSendResponse() {
			if !snapshot.WroteRequestAt.IsZero() && info.FirstResponseTime.After(snapshot.WroteRequestAt) {
				attemptUpstreamToFirstEventMs = info.FirstResponseTime.Sub(snapshot.WroteRequestAt).Milliseconds()
			}
			if !snapshot.ResponseBodyDoneAt.IsZero() && snapshot.ResponseBodyDoneAt.After(info.FirstResponseTime) {
				attemptApplicationStreamAfterFirstEventMs = snapshot.ResponseBodyDoneAt.Sub(info.FirstResponseTime).Milliseconds()
			}
		}
		logger.LogInfo(c, fmt.Sprintf(
			"relay upstream trace: attempt=%d route=%s direct=%t conn_reused=%t conn_was_idle=%t conn_idle_ms=%d tls_resumed=%t dns_observed=%t dns_ms=%d tcp_observed=%t tcp_ms=%d tls_observed=%t tls_ms=%d request_write_approx_ms=%d upstream_ttfb_ms=%d application_first_body_read_ms=%d upstream_to_first_event_ms=%d application_body_read_span_ms=%d application_stream_after_first_event_ms=%d got_conn_events=%d wrote_request_events=%d upstream_request_bytes_total=%d upstream_response_bytes=%d http_proto=%q",
			attempt+1,
			snapshot.ProxyMode,
			snapshot.Direct,
			snapshot.ConnReused,
			snapshot.ConnWasIdle,
			snapshot.ConnIdleFor.Milliseconds(),
			snapshot.TLSResumed,
			snapshot.DNSObserved,
			snapshot.DNSLookup.Milliseconds(),
			snapshot.TCPObserved,
			snapshot.TCPConnect.Milliseconds(),
			snapshot.TLSObserved,
			snapshot.TLSHandshake.Milliseconds(),
			snapshot.RequestWriteApprox.Milliseconds(),
			snapshot.TimeToFirstHeaderByte.Milliseconds(),
			snapshot.ApplicationFirstBodyRead.Milliseconds(),
			attemptUpstreamToFirstEventMs,
			snapshot.ApplicationBodyReadSpan.Milliseconds(),
			attemptApplicationStreamAfterFirstEventMs,
			snapshot.GotConnEvents,
			snapshot.WroteRequestEvents,
			snapshot.RequestBytes,
			snapshot.ResponseBytes,
			snapshot.HTTPProto,
		))
	}
}

type relayTraceResponseWriter struct {
	gin.ResponseWriter
	mu           sync.Mutex
	firstWriteAt time.Time
	lastWriteAt  time.Time
	writeBlocked time.Duration
	bytes        int
}

type relayTraceWriterSnapshot struct {
	firstWriteAt time.Time
	lastWriteAt  time.Time
	bytes        int
	writeBlocked time.Duration
}

func (w *relayTraceResponseWriter) beginWrite() time.Time {
	w.mu.Lock()
	now := time.Now()
	if w.firstWriteAt.IsZero() {
		w.firstWriteAt = now
	}
	return now
}

func (w *relayTraceResponseWriter) endWrite(startedAt time.Time, bytes int) {
	finishedAt := time.Now()
	w.lastWriteAt = finishedAt
	if !startedAt.IsZero() {
		w.writeBlocked += finishedAt.Sub(startedAt)
	}
	if bytes > 0 {
		w.bytes += bytes
	}
	w.mu.Unlock()
}

func (w *relayTraceResponseWriter) Write(data []byte) (n int, err error) {
	startedAt := w.beginWrite()
	defer func() { w.endWrite(startedAt, n) }()
	return w.ResponseWriter.Write(data)
}

func (w *relayTraceResponseWriter) WriteString(data string) (n int, err error) {
	startedAt := w.beginWrite()
	defer func() { w.endWrite(startedAt, n) }()
	return w.ResponseWriter.WriteString(data)
}

func (w *relayTraceResponseWriter) WriteHeaderNow() {
	startedAt := w.beginWrite()
	defer w.endWrite(startedAt, 0)
	w.ResponseWriter.WriteHeaderNow()
}

func (w *relayTraceResponseWriter) Flush() {
	startedAt := w.beginWrite()
	defer w.endWrite(startedAt, 0)
	w.ResponseWriter.Flush()
}

func (w *relayTraceResponseWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

func (w *relayTraceResponseWriter) snapshot() relayTraceWriterSnapshot {
	if w == nil {
		return relayTraceWriterSnapshot{}
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	return relayTraceWriterSnapshot{
		firstWriteAt: w.firstWriteAt,
		lastWriteAt:  w.lastWriteAt,
		bytes:        w.bytes,
		writeBlocked: w.writeBlocked,
	}
}
