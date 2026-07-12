package common

import (
	"crypto/tls"
	"io"
	"net/http"
	"net/http/httptrace"
	"strings"
	"sync"
	"time"
)

const maxUpstreamTraces = 8

type upstreamTraceCollector struct {
	mu       sync.Mutex
	traces   []*UpstreamRequestTrace
	overflow int
}

func newUpstreamTraceCollector() *upstreamTraceCollector {
	return &upstreamTraceCollector{}
}

type UpstreamTraceSnapshot struct {
	StartedAt          time.Time
	GotConnAt          time.Time
	WroteRequestAt     time.Time
	FirstHeaderByteAt  time.Time
	FirstBodyByteAt    time.Time
	ResponseBodyDoneAt time.Time

	DNSLookup                time.Duration
	TCPConnect               time.Duration
	TLSHandshake             time.Duration
	RequestWriteApprox       time.Duration
	TimeToFirstHeaderByte    time.Duration
	ApplicationFirstBodyRead time.Duration
	ApplicationBodyReadSpan  time.Duration
	DNSObserved              bool
	TCPObserved              bool
	TLSObserved              bool
	GotConnEvents            int
	WroteRequestEvents       int

	RequestBytes            int64
	ResponseBytes           int64
	RequestContentEncoding  string
	RequestOriginalBytes    int64
	RequestCompression      time.Duration
	RequestCompressionQueue time.Duration
	RequestCompressionLevel int

	Direct       bool
	ProxyMode    string
	ConnReused   bool
	ConnWasIdle  bool
	ConnIdleFor  time.Duration
	TLSResumed   bool
	HTTPProto    string
	CFRay        string
	CFColo       string
	ServerTiming string
}

type UpstreamRequestTrace struct {
	mu sync.Mutex

	startedAt          time.Time
	dnsStartedAt       time.Time
	dnsLookup          time.Duration
	connectStartedAt   time.Time
	tcpConnect         time.Duration
	tlsStartedAt       time.Time
	tlsHandshake       time.Duration
	gotConnAt          time.Time
	wroteRequestAt     time.Time
	firstHeaderByteAt  time.Time
	firstBodyByteAt    time.Time
	responseBodyDoneAt time.Time
	gotConnEvents      int
	wroteRequestEvents int

	requestBytes            int64
	responseBytes           int64
	requestContentEncoding  string
	requestOriginalBytes    int64
	requestCompression      time.Duration
	requestCompressionQueue time.Duration
	requestCompressionLevel int

	direct       bool
	proxyMode    string
	connReused   bool
	connWasIdle  bool
	connIdleFor  time.Duration
	tlsResumed   bool
	httpProto    string
	cfRay        string
	cfColo       string
	serverTiming string
}

func NewUpstreamRequestTrace(proxyMode string) *UpstreamRequestTrace {
	proxyMode = strings.TrimSpace(proxyMode)
	if proxyMode == "" {
		proxyMode = "direct"
	}
	return &UpstreamRequestTrace{
		startedAt: time.Now(),
		direct:    proxyMode == "direct",
		proxyMode: proxyMode,
	}
}

func (t *UpstreamRequestTrace) SetRequestBodyMetadata(contentEncoding string, originalBytes int64, compression time.Duration, compressionQueue time.Duration, compressionLevel int) {
	if t == nil {
		return
	}
	contentEncoding = strings.ToLower(strings.TrimSpace(contentEncoding))
	if contentEncoding != "gzip" {
		return
	}
	t.mu.Lock()
	t.requestContentEncoding = contentEncoding
	t.requestOriginalBytes = originalBytes
	t.requestCompression = compression
	t.requestCompressionQueue = compressionQueue
	t.requestCompressionLevel = compressionLevel
	t.mu.Unlock()
}

func (info *RelayInfo) AddUpstreamTrace(trace *UpstreamRequestTrace) {
	if info == nil || trace == nil {
		return
	}
	collector := info.upstreamTraceCollector
	if collector == nil {
		return
	}
	collector.mu.Lock()
	defer collector.mu.Unlock()
	if len(collector.traces) >= maxUpstreamTraces {
		collector.overflow++
		return
	}
	collector.traces = append(collector.traces, trace)
}

func (info *RelayInfo) UpstreamTraceSnapshots() ([]UpstreamTraceSnapshot, int) {
	if info == nil || info.upstreamTraceCollector == nil {
		return nil, 0
	}
	collector := info.upstreamTraceCollector
	collector.mu.Lock()
	traces := append([]*UpstreamRequestTrace(nil), collector.traces...)
	overflow := collector.overflow
	collector.mu.Unlock()
	if len(traces) == 0 {
		return nil, overflow
	}
	snapshots := make([]UpstreamTraceSnapshot, 0, len(traces))
	for _, trace := range traces {
		if trace != nil {
			snapshots = append(snapshots, trace.Snapshot())
		}
	}
	return snapshots, overflow
}

func (t *UpstreamRequestTrace) Attach(req *http.Request) *http.Request {
	if t == nil || req == nil {
		return req
	}
	if req.Body != nil {
		req.Body = &traceReadCloser{
			ReadCloser: req.Body,
			onRead:     t.recordRequestRead,
		}
	}
	if req.GetBody != nil {
		getBody := req.GetBody
		req.GetBody = func() (io.ReadCloser, error) {
			body, err := getBody()
			if err != nil {
				return nil, err
			}
			return &traceReadCloser{
				ReadCloser: body,
				onRead:     t.recordRequestRead,
			}, nil
		}
	}
	return req.WithContext(httptrace.WithClientTrace(req.Context(), t.clientTrace()))
}

func (t *UpstreamRequestTrace) ObserveResponse(resp *http.Response) {
	if t == nil || resp == nil {
		return
	}
	t.mu.Lock()
	t.httpProto = resp.Proto
	t.cfRay = strings.TrimSpace(resp.Header.Get("CF-Ray"))
	t.cfColo = cloudflareColo(t.cfRay)
	t.serverTiming = truncateHeader(resp.Header.Get("Server-Timing"), 256)
	t.mu.Unlock()
	if resp.Body != nil {
		resp.Body = &traceReadCloser{
			ReadCloser: resp.Body,
			onRead:     t.recordResponseRead,
			onClose:    t.recordResponseDone,
		}
	}
}

func (t *UpstreamRequestTrace) Snapshot() UpstreamTraceSnapshot {
	if t == nil {
		return UpstreamTraceSnapshot{}
	}
	t.mu.Lock()
	defer t.mu.Unlock()

	snapshot := UpstreamTraceSnapshot{
		StartedAt:               t.startedAt,
		GotConnAt:               t.gotConnAt,
		WroteRequestAt:          t.wroteRequestAt,
		FirstHeaderByteAt:       t.firstHeaderByteAt,
		FirstBodyByteAt:         t.firstBodyByteAt,
		ResponseBodyDoneAt:      t.responseBodyDoneAt,
		DNSLookup:               t.dnsLookup,
		TCPConnect:              t.tcpConnect,
		TLSHandshake:            t.tlsHandshake,
		DNSObserved:             !t.dnsStartedAt.IsZero(),
		TCPObserved:             !t.connectStartedAt.IsZero(),
		TLSObserved:             !t.tlsStartedAt.IsZero(),
		GotConnEvents:           t.gotConnEvents,
		WroteRequestEvents:      t.wroteRequestEvents,
		RequestBytes:            t.requestBytes,
		ResponseBytes:           t.responseBytes,
		RequestContentEncoding:  t.requestContentEncoding,
		RequestOriginalBytes:    t.requestOriginalBytes,
		RequestCompression:      t.requestCompression,
		RequestCompressionQueue: t.requestCompressionQueue,
		RequestCompressionLevel: t.requestCompressionLevel,
		Direct:                  t.direct,
		ProxyMode:               t.proxyMode,
		ConnReused:              t.connReused,
		ConnWasIdle:             t.connWasIdle,
		ConnIdleFor:             t.connIdleFor,
		TLSResumed:              t.tlsResumed,
		HTTPProto:               t.httpProto,
		CFRay:                   t.cfRay,
		CFColo:                  t.cfColo,
		ServerTiming:            t.serverTiming,
	}
	if !t.gotConnAt.IsZero() && !t.wroteRequestAt.IsZero() {
		snapshot.RequestWriteApprox = t.wroteRequestAt.Sub(t.gotConnAt)
	}
	if !t.wroteRequestAt.IsZero() && !t.firstHeaderByteAt.IsZero() {
		snapshot.TimeToFirstHeaderByte = t.firstHeaderByteAt.Sub(t.wroteRequestAt)
	}
	if !t.wroteRequestAt.IsZero() && !t.firstBodyByteAt.IsZero() {
		snapshot.ApplicationFirstBodyRead = t.firstBodyByteAt.Sub(t.wroteRequestAt)
	}
	if !t.firstBodyByteAt.IsZero() && !t.responseBodyDoneAt.IsZero() {
		snapshot.ApplicationBodyReadSpan = t.responseBodyDoneAt.Sub(t.firstBodyByteAt)
	}
	return snapshot
}

func (t *UpstreamRequestTrace) clientTrace() *httptrace.ClientTrace {
	return &httptrace.ClientTrace{
		DNSStart: func(httptrace.DNSStartInfo) {
			t.mu.Lock()
			if t.dnsStartedAt.IsZero() {
				t.dnsStartedAt = time.Now()
			}
			t.mu.Unlock()
		},
		DNSDone: func(httptrace.DNSDoneInfo) {
			t.mu.Lock()
			if !t.dnsStartedAt.IsZero() && t.dnsLookup == 0 {
				t.dnsLookup = time.Since(t.dnsStartedAt)
			}
			t.mu.Unlock()
		},
		ConnectStart: func(_, _ string) {
			t.mu.Lock()
			if t.connectStartedAt.IsZero() {
				t.connectStartedAt = time.Now()
			}
			t.mu.Unlock()
		},
		ConnectDone: func(_, _ string, err error) {
			t.mu.Lock()
			if !t.connectStartedAt.IsZero() && (err == nil || t.tcpConnect == 0) {
				t.tcpConnect = time.Since(t.connectStartedAt)
			}
			t.mu.Unlock()
		},
		TLSHandshakeStart: func() {
			t.mu.Lock()
			t.tlsStartedAt = time.Now()
			t.mu.Unlock()
		},
		TLSHandshakeDone: func(state tls.ConnectionState, _ error) {
			t.mu.Lock()
			if !t.tlsStartedAt.IsZero() {
				t.tlsHandshake = time.Since(t.tlsStartedAt)
			}
			t.tlsResumed = state.DidResume
			t.mu.Unlock()
		},
		GotConn: func(info httptrace.GotConnInfo) {
			t.mu.Lock()
			t.gotConnAt = time.Now()
			t.gotConnEvents++
			t.connReused = info.Reused
			t.connWasIdle = info.WasIdle
			t.connIdleFor = info.IdleTime
			t.mu.Unlock()
		},
		WroteRequest: func(httptrace.WroteRequestInfo) {
			t.mu.Lock()
			t.wroteRequestAt = time.Now()
			// A single http.Client.Do may follow redirects. Reset the response
			// header marker so all per-request durations refer to the latest hop.
			t.firstHeaderByteAt = time.Time{}
			t.wroteRequestEvents++
			t.mu.Unlock()
		},
		GotFirstResponseByte: func() {
			t.mu.Lock()
			if t.firstHeaderByteAt.IsZero() {
				t.firstHeaderByteAt = time.Now()
			}
			t.mu.Unlock()
		},
	}
}

func (t *UpstreamRequestTrace) recordRequestRead(n int, _ error) {
	if t == nil || n <= 0 {
		return
	}
	t.mu.Lock()
	t.requestBytes += int64(n)
	t.mu.Unlock()
}

func (t *UpstreamRequestTrace) recordResponseRead(n int, err error) {
	if t == nil {
		return
	}
	t.mu.Lock()
	if n > 0 {
		if t.firstBodyByteAt.IsZero() {
			t.firstBodyByteAt = time.Now()
		}
		t.responseBytes += int64(n)
	}
	if err != nil && t.responseBodyDoneAt.IsZero() {
		t.responseBodyDoneAt = time.Now()
	}
	t.mu.Unlock()
}

func (t *UpstreamRequestTrace) recordResponseDone() {
	if t == nil {
		return
	}
	t.mu.Lock()
	if t.responseBodyDoneAt.IsZero() {
		t.responseBodyDoneAt = time.Now()
	}
	t.mu.Unlock()
}

type traceReadCloser struct {
	io.ReadCloser
	onRead  func(int, error)
	onClose func()
}

func (r *traceReadCloser) Read(p []byte) (int, error) {
	n, err := r.ReadCloser.Read(p)
	if r.onRead != nil {
		r.onRead(n, err)
	}
	return n, err
}

func (r *traceReadCloser) Close() error {
	if r.onClose != nil {
		r.onClose()
	}
	return r.ReadCloser.Close()
}

func cloudflareColo(ray string) string {
	ray = strings.TrimSpace(ray)
	separator := strings.LastIndexByte(ray, '-')
	if separator < 0 || separator == len(ray)-1 {
		return ""
	}
	return strings.ToUpper(strings.TrimSpace(ray[separator+1:]))
}

func CloudflareColo(ray string) string {
	return cloudflareColo(ray)
}

func truncateHeader(value string, maxBytes int) string {
	value = strings.TrimSpace(value)
	if maxBytes <= 0 || len(value) <= maxBytes {
		return value
	}
	return value[:maxBytes]
}
