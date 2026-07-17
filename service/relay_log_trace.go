package service

import (
	"strings"
	"time"
	"unicode"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"

	"github.com/gin-gonic/gin"
)

const relayTraceLogVersion = 1

type relayTraceLog struct {
	Version         int                                 `json:"version"`
	Coverage        string                              `json:"coverage"`
	AffinityFP      string                              `json:"affinity_fingerprint,omitempty"`
	TotalMs         *int64                              `json:"total_ms,omitempty"`
	Client          *relayTraceClientLog                `json:"client,omitempty"`
	Gateway         *relayTraceGatewayLog               `json:"gateway,omitempty"`
	Attempts        []relaycommon.PublicUpstreamAttempt `json:"attempts,omitempty"`
	AttemptOverflow int                                 `json:"attempt_overflow,omitempty"`
}

type relayTraceClientLog struct {
	UserAgent    string `json:"user_agent,omitempty"`
	HTTPProtocol string `json:"http_protocol,omitempty"`
	CFRay        string `json:"cf_ray,omitempty"`
	CFColo       string `json:"cf_colo,omitempty"`
	Country      string `json:"country,omitempty"`
	Region       string `json:"region,omitempty"`
	RegionCode   string `json:"region_code,omitempty"`
	City         string `json:"city,omitempty"`
	Timezone     string `json:"timezone,omitempty"`

	BodyObserved bool   `json:"body_observed"`
	BodyReadMs   *int64 `json:"body_read_ms,omitempty"`
	RequestBytes *int64 `json:"request_bytes,omitempty"`
	BodyStorage  string `json:"body_storage,omitempty"`

	FirstWriteMs   *int64 `json:"first_write_ms,omitempty"`
	StreamSpanMs   *int64 `json:"stream_span_ms,omitempty"`
	WriteBlockedMs *int64 `json:"write_blocked_ms,omitempty"`
	ResponseBytes  *int   `json:"response_bytes,omitempty"`
}

type relayTraceGatewayLog struct {
	IngressBeforeRelayMs   int64  `json:"ingress_before_relay_ms"`
	ValidateMs             int64  `json:"validate_ms"`
	RelayInfoMs            int64  `json:"relay_info_ms"`
	PreprocessMs           int64  `json:"preprocess_ms"`
	PricingMs              int64  `json:"pricing_ms"`
	PreConsumeMs           int64  `json:"pre_consume_ms"`
	SelectChannelMs        int64  `json:"select_channel_ms"`
	RefreshBillingMs       int64  `json:"refresh_billing_ms"`
	BodyStorageMs          int64  `json:"body_storage_ms"`
	PromptCacheQueueMs     int64  `json:"prompt_cache_queue_ms"`
	ChannelCapacityQueueMs int64  `json:"channel_capacity_queue_ms"`
	UpstreamRelayMs        int64  `json:"upstream_relay_ms"`
	FirstEventMs           *int64 `json:"first_event_ms,omitempty"`
	Attempts               int    `json:"attempts"`
}

// AppendRelayTraceLogInfo adds the user-visible trace allowlist to a log.
// Upstream remote addresses and proxy endpoint details are intentionally not
// represented by any of the serialized types used here.
func AppendRelayTraceLogInfo(ctx *gin.Context, relayInfo *relaycommon.RelayInfo, other map[string]interface{}) {
	if ctx == nil || relayInfo == nil || other == nil {
		return
	}

	attempts, overflow := relayInfo.PublicUpstreamAttempts()
	trace := relayTraceLog{
		Version:         relayTraceLogVersion,
		Coverage:        "unavailable",
		AffinityFP:      safeAffinityFingerprint(GetChannelAffinityFingerprint(ctx)),
		Client:          buildRelayTraceClientLog(ctx),
		Attempts:        attempts,
		AttemptOverflow: overflow,
	}
	if len(attempts) > 0 {
		trace.Coverage = "central_http"
	}
	if provider := relayInfo.StageMetricsProvider; provider != nil {
		stage := provider.SnapshotRelayStageMetrics()
		totalMs := nonNegativeDurationMs(stage.Total)
		trace.TotalMs = &totalMs
		trace.Gateway = &relayTraceGatewayLog{
			IngressBeforeRelayMs:   nonNegativeDurationMs(stage.IngressBeforeRelay),
			ValidateMs:             nonNegativeDurationMs(stage.ValidateRequest),
			RelayInfoMs:            nonNegativeDurationMs(stage.GenRelayInfo),
			PreprocessMs:           nonNegativeDurationMs(stage.Preprocess),
			PricingMs:              nonNegativeDurationMs(stage.Pricing),
			PreConsumeMs:           nonNegativeDurationMs(stage.PreConsume),
			SelectChannelMs:        nonNegativeDurationMs(stage.SelectChannel),
			RefreshBillingMs:       nonNegativeDurationMs(stage.RefreshBilling),
			BodyStorageMs:          nonNegativeDurationMs(stage.BodyStorage),
			PromptCacheQueueMs:     nonNegativeDurationMs(stage.PromptCacheQueue),
			ChannelCapacityQueueMs: nonNegativeDurationMs(stage.ChannelCapacityQueue),
			UpstreamRelayMs:        nonNegativeDurationMs(stage.UpstreamRelay),
			Attempts:               stage.Attempts,
		}
		if relayInfo.HasSendResponse() && !relayInfo.StartTime.IsZero() {
			trace.Gateway.FirstEventMs = durationBetweenMs(relayInfo.StartTime, relayInfo.FirstResponseTime)
		}
		appendClientWriterMetrics(trace.Client, stage)
	}
	other["relay_trace"] = trace
}

func buildRelayTraceClientLog(ctx *gin.Context) *relayTraceClientLog {
	client := &relayTraceClientLog{}
	if ctx == nil || ctx.Request == nil {
		return client
	}
	request := ctx.Request
	client.UserAgent = safeClientLogText(request.UserAgent(), 512)
	client.HTTPProtocol = safeClientHTTPProtocol(request.Proto)
	client.CFRay = safeClientToken(request.Header.Get("CF-Ray"), 64, true)
	client.CFColo = relaycommon.CloudflareColo(client.CFRay)
	client.Country = strings.ToUpper(safeClientToken(request.Header.Get("CF-IPCountry"), 8, false))
	client.Region = safeClientLogText(request.Header.Get("CF-Region"), 80)
	client.RegionCode = safeClientToken(request.Header.Get("CF-Region-Code"), 16, true)
	client.City = safeClientLogText(request.Header.Get("CF-IPCity"), 80)
	client.Timezone = safeClientLogText(request.Header.Get("CF-Timezone"), 80)
	if bodyMetrics, ok := common.GetRequestBodyMetrics(ctx); ok {
		client.BodyObserved = true
		bodyReadMs := nonNegativeDurationMs(bodyMetrics.ReadTime)
		requestBytes := bodyMetrics.Bytes
		client.BodyReadMs = &bodyReadMs
		client.RequestBytes = &requestBytes
		if bodyMetrics.Disk {
			client.BodyStorage = "disk"
		} else {
			client.BodyStorage = "memory"
		}
	}
	return client
}

func appendClientWriterMetrics(client *relayTraceClientLog, stage relaycommon.RelayStageMetricsSnapshot) {
	if client == nil || !stage.ClientWriterObserved {
		return
	}
	if stage.ClientFirstWriteSet {
		value := nonNegativeDurationMs(stage.ClientFirstWrite)
		client.FirstWriteMs = &value
	}
	if stage.ClientStreamSpanSet {
		value := nonNegativeDurationMs(stage.ClientStreamSpan)
		client.StreamSpanMs = &value
	}
	blockedMs := nonNegativeDurationMs(stage.ClientWriteBlocked)
	responseBytes := stage.ClientResponseBytes
	client.WriteBlockedMs = &blockedMs
	client.ResponseBytes = &responseBytes
}

func durationBetweenMs(start, end time.Time) *int64 {
	if start.IsZero() || end.IsZero() || end.Before(start) {
		return nil
	}
	value := end.Sub(start).Milliseconds()
	return &value
}

func nonNegativeDurationMs(duration time.Duration) int64 {
	if duration <= 0 {
		return 0
	}
	return duration.Milliseconds()
}

func safeClientHTTPProtocol(value string) string {
	switch strings.TrimSpace(value) {
	case "HTTP/1.0", "HTTP/1.1", "HTTP/2.0", "HTTP/3.0":
		return strings.TrimSpace(value)
	default:
		return ""
	}
}

func safeClientToken(value string, maxLength int, allowHyphen bool) string {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > maxLength {
		return ""
	}
	for _, ch := range value {
		valid := ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z' || ch >= '0' && ch <= '9'
		if !valid && !(allowHyphen && (ch == '-' || ch == '_')) {
			return ""
		}
	}
	return value
}

func safeAffinityFingerprint(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if len(value) != 8 {
		return ""
	}
	for _, ch := range value {
		if !(ch >= '0' && ch <= '9') && !(ch >= 'a' && ch <= 'f') {
			return ""
		}
	}
	return value
}

func safeClientLogText(value string, maxRunes int) string {
	value = strings.TrimSpace(strings.Map(func(ch rune) rune {
		if unicode.IsControl(ch) {
			return ' '
		}
		return ch
	}, value))
	if value == "" || maxRunes <= 0 {
		return value
	}
	runes := []rune(value)
	if len(runes) > maxRunes {
		value = string(runes[:maxRunes])
	}
	return value
}
