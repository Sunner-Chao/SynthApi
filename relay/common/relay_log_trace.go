package common

import (
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var ipv4TextPattern = regexp.MustCompile(`(?:^|[^0-9])(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?:$|[^0-9])`)

var publicServerTimingNames = map[string]string{
	"app":        "app",
	"cache":      "cache",
	"cfl4":       "cfL4",
	"compute":    "compute",
	"connect":    "connect",
	"db":         "db",
	"dns":        "dns",
	"edge":       "edge",
	"generation": "generation",
	"inference":  "inference",
	"model":      "model",
	"origin":     "origin",
	"processing": "processing",
	"proxy":      "proxy",
	"queue":      "queue",
	"request":    "request",
	"response":   "response",
	"server":     "server",
	"tcp":        "tcp",
	"tls":        "tls",
	"total":      "total",
	"ttfb":       "ttfb",
	"upstream":   "upstream",
}

type RelayStageMetricsSnapshot struct {
	Total                time.Duration
	IngressBeforeRelay   time.Duration
	ValidateRequest      time.Duration
	GenRelayInfo         time.Duration
	Preprocess           time.Duration
	Pricing              time.Duration
	PreConsume           time.Duration
	SelectChannel        time.Duration
	RefreshBilling       time.Duration
	BodyStorage          time.Duration
	PromptCacheQueue     time.Duration
	ChannelCapacityQueue time.Duration
	UpstreamRelay        time.Duration
	Attempts             int

	ClientWriterObserved bool
	ClientFirstWrite     time.Duration
	ClientFirstWriteSet  bool
	ClientStreamSpan     time.Duration
	ClientStreamSpanSet  bool
	ClientWriteBlocked   time.Duration
	ClientResponseBytes  int
}

type RelayStageMetricsProvider interface {
	SnapshotRelayStageMetrics() RelayStageMetricsSnapshot
}

type PublicServerTimingMetric struct {
	Name       string   `json:"name"`
	DurationMs *float64 `json:"duration_ms,omitempty"`
}

// PublicUpstreamAttempt is an explicit allowlist for user-visible logs.
// Remote addresses, proxy URLs, channel base URLs, and credentials must never
// be added to this type.
type PublicUpstreamAttempt struct {
	Attempt int    `json:"attempt"`
	Route   string `json:"route"`
	Direct  bool   `json:"direct"`

	ConnReused  bool   `json:"conn_reused"`
	ConnWasIdle bool   `json:"conn_was_idle"`
	ConnIdleMs  int64  `json:"conn_idle_ms,omitempty"`
	HTTPProto   string `json:"http_protocol,omitempty"`

	DNSObserved bool   `json:"dns_observed"`
	DNSMs       *int64 `json:"dns_ms,omitempty"`
	TCPObserved bool   `json:"tcp_observed"`
	TCPMs       *int64 `json:"tcp_ms,omitempty"`
	TLSObserved bool   `json:"tls_observed"`
	TLSMs       *int64 `json:"tls_ms,omitempty"`
	TLSResumed  bool   `json:"tls_resumed"`

	RequestWriteApproxMs               *int64 `json:"request_write_approx_ms,omitempty"`
	TimeToFirstHeaderByteMs            *int64 `json:"ttfb_ms,omitempty"`
	ApplicationFirstBodyReadMs         *int64 `json:"application_first_body_read_ms,omitempty"`
	UpstreamToFirstEventMs             *int64 `json:"upstream_to_first_event_ms,omitempty"`
	ApplicationBodyReadSpanMs          *int64 `json:"application_body_read_span_ms,omitempty"`
	ApplicationStreamAfterFirstEventMs *int64 `json:"application_stream_after_first_event_ms,omitempty"`

	GotConnEvents             int    `json:"got_conn_events"`
	WroteRequestEvents        int    `json:"wrote_request_events"`
	RequestBytesTotal         int64  `json:"request_bytes_total"`
	ResponseBytes             int64  `json:"response_bytes"`
	RequestContentEncoding    string `json:"request_content_encoding,omitempty"`
	RequestOriginalBytes      int64  `json:"request_original_bytes,omitempty"`
	RequestCompressionMs      *int64 `json:"request_compression_ms,omitempty"`
	RequestCompressionQueueMs *int64 `json:"request_compression_queue_ms,omitempty"`
	RequestCompressionLevel   int    `json:"request_compression_level,omitempty"`

	CFRay        string                     `json:"cf_ray,omitempty"`
	CFColo       string                     `json:"cf_colo,omitempty"`
	ServerTiming []PublicServerTimingMetric `json:"server_timing,omitempty"`
}

func (info *RelayInfo) PublicUpstreamAttempts() ([]PublicUpstreamAttempt, int) {
	snapshots, overflow := info.UpstreamTraceSnapshots()
	if len(snapshots) == 0 {
		return nil, overflow
	}
	attempts := make([]PublicUpstreamAttempt, 0, len(snapshots))
	for index, snapshot := range snapshots {
		route := publicProxyMode(snapshot.ProxyMode)
		cfRay := publicCFRay(snapshot.CFRay)
		attempt := PublicUpstreamAttempt{
			Attempt:                 index + 1,
			Route:                   route,
			Direct:                  route == "direct",
			ConnReused:              snapshot.ConnReused,
			ConnWasIdle:             snapshot.ConnWasIdle,
			ConnIdleMs:              nonNegativeMilliseconds(snapshot.ConnIdleFor),
			HTTPProto:               publicHTTPProtocol(snapshot.HTTPProto),
			DNSObserved:             snapshot.DNSObserved,
			TCPObserved:             snapshot.TCPObserved,
			TLSObserved:             snapshot.TLSObserved,
			TLSResumed:              snapshot.TLSObserved && snapshot.TLSResumed,
			GotConnEvents:           snapshot.GotConnEvents,
			WroteRequestEvents:      snapshot.WroteRequestEvents,
			RequestBytesTotal:       snapshot.RequestBytes,
			ResponseBytes:           snapshot.ResponseBytes,
			RequestContentEncoding:  snapshot.RequestContentEncoding,
			RequestOriginalBytes:    snapshot.RequestOriginalBytes,
			RequestCompressionLevel: snapshot.RequestCompressionLevel,
			CFRay:                   cfRay,
			CFColo:                  publicCFColo(cloudflareColo(cfRay)),
			ServerTiming:            parsePublicServerTiming(snapshot.ServerTiming),
		}
		if snapshot.RequestContentEncoding == "gzip" {
			attempt.RequestCompressionMs = millisecondsPointer(snapshot.RequestCompression)
			attempt.RequestCompressionQueueMs = millisecondsPointer(snapshot.RequestCompressionQueue)
		}
		if snapshot.DNSObserved {
			attempt.DNSMs = millisecondsPointer(snapshot.DNSLookup)
		}
		if snapshot.TCPObserved {
			attempt.TCPMs = millisecondsPointer(snapshot.TCPConnect)
		}
		if snapshot.TLSObserved {
			attempt.TLSMs = millisecondsPointer(snapshot.TLSHandshake)
		}
		attempt.RequestWriteApproxMs = durationBetween(snapshot.GotConnAt, snapshot.WroteRequestAt)
		attempt.TimeToFirstHeaderByteMs = durationBetween(snapshot.WroteRequestAt, snapshot.FirstHeaderByteAt)
		attempt.ApplicationFirstBodyReadMs = durationBetween(snapshot.WroteRequestAt, snapshot.FirstBodyByteAt)
		attempt.ApplicationBodyReadSpanMs = durationBetween(snapshot.FirstBodyByteAt, snapshot.ResponseBodyDoneAt)
		if index == len(snapshots)-1 && info != nil && info.HasSendResponse() {
			attempt.UpstreamToFirstEventMs = durationBetween(snapshot.WroteRequestAt, info.FirstResponseTime)
			attempt.ApplicationStreamAfterFirstEventMs = durationBetween(info.FirstResponseTime, snapshot.ResponseBodyDoneAt)
		}
		attempts = append(attempts, attempt)
	}
	return attempts, overflow
}

func durationBetween(start, end time.Time) *int64 {
	if start.IsZero() || end.IsZero() || end.Before(start) {
		return nil
	}
	value := end.Sub(start).Milliseconds()
	return &value
}

func millisecondsPointer(duration time.Duration) *int64 {
	value := nonNegativeMilliseconds(duration)
	return &value
}

func nonNegativeMilliseconds(duration time.Duration) int64 {
	if duration <= 0 {
		return 0
	}
	return duration.Milliseconds()
}

func publicProxyMode(value string) string {
	switch strings.TrimSpace(value) {
	case "direct", "channel_socks_proxy", "channel_http_proxy", "environment_proxy":
		return strings.TrimSpace(value)
	default:
		return "unknown"
	}
}

func publicHTTPProtocol(value string) string {
	switch strings.TrimSpace(value) {
	case "HTTP/1.0", "HTTP/1.1", "HTTP/2.0", "HTTP/3.0":
		return strings.TrimSpace(value)
	default:
		return ""
	}
}

func publicCFRay(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > 64 || strings.Count(value, "-") != 1 {
		return ""
	}
	rayID, colo, ok := strings.Cut(value, "-")
	if !ok || len(rayID) < 6 || len(rayID) > 32 || len(colo) < 3 || len(colo) > 8 {
		return ""
	}
	for _, ch := range rayID {
		if !isASCIIDigit(ch) && !(ch >= 'a' && ch <= 'f') && !(ch >= 'A' && ch <= 'F') {
			return ""
		}
	}
	for _, ch := range colo {
		if !isASCIILetter(ch) && !isASCIIDigit(ch) {
			return ""
		}
	}
	return value
}

func publicCFColo(value string) string {
	value = strings.ToUpper(strings.TrimSpace(value))
	if value == "" || len(value) > 8 {
		return ""
	}
	for _, ch := range value {
		if !isASCIILetter(ch) && !isASCIIDigit(ch) {
			return ""
		}
	}
	return value
}

func parsePublicServerTiming(value string) []PublicServerTimingMetric {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	entries := strings.Split(value, ",")
	metrics := make([]PublicServerTimingMetric, 0, len(entries))
	for _, entry := range entries {
		parts := strings.Split(entry, ";")
		name, ok := publicServerTimingName(parts[0])
		if !ok {
			continue
		}
		metric := PublicServerTimingMetric{Name: name}
		for _, parameter := range parts[1:] {
			key, raw, ok := strings.Cut(strings.TrimSpace(parameter), "=")
			if !ok || !strings.EqualFold(strings.TrimSpace(key), "dur") {
				continue
			}
			duration, err := strconv.ParseFloat(strings.Trim(strings.TrimSpace(raw), `"`), 64)
			if err != nil || math.IsNaN(duration) || math.IsInf(duration, 0) || duration < 0 || duration > 86_400_000 {
				continue
			}
			metric.DurationMs = &duration
			break
		}
		metrics = append(metrics, metric)
		if len(metrics) >= 16 {
			break
		}
	}
	return metrics
}

func publicServerTimingName(value string) (string, bool) {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > 64 || ipv4TextPattern.MatchString(value) {
		return "", false
	}
	name, ok := publicServerTimingNames[strings.ToLower(value)]
	return name, ok
}

func isASCIILetter(ch rune) bool {
	return ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z'
}

func isASCIIDigit(ch rune) bool {
	return ch >= '0' && ch <= '9'
}
