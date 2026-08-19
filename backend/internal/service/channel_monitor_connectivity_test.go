//go:build unit

package service

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

func TestConnectivityOnlyUsesSingleCredentialFreeHeadRequest(t *testing.T) {
	originalClient := monitorPingHTTPClient
	monitorPingHTTPClient = &http.Client{Timeout: 5 * time.Second}
	t.Cleanup(func() { monitorPingHTTPClient = originalClient })

	var mu sync.Mutex
	requests := make([]*http.Request, 0, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		_ = r.Body.Close()
		copy := *r
		copy.Body = io.NopCloser(bytes.NewReader(body))
		mu.Lock()
		requests = append(requests, &copy)
		mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(server.Close)

	svc := &ChannelMonitorService{}
	results := svc.runChecksConcurrent(context.Background(), &ChannelMonitor{
		ProbeMode:    MonitorProbeModeConnectivityOnly,
		Endpoint:     server.URL,
		APIKey:       "must-not-be-sent",
		PrimaryModel: "gpt-image-2",
		ExtraModels:  []string{"another-label"},
	})

	if len(results) != 2 {
		t.Fatalf("expected one result per model label, got %d", len(results))
	}
	for _, result := range results {
		if result.Status != MonitorStatusOperational {
			t.Fatalf("expected operational connectivity result, got %s: %s", result.Status, result.Message)
		}
		if result.LatencyMs == nil || result.PingLatencyMs == nil {
			t.Fatalf("expected connectivity latency fields, got %#v", result)
		}
	}

	mu.Lock()
	defer mu.Unlock()
	if len(requests) != 1 {
		t.Fatalf("expected exactly one network request, got %d", len(requests))
	}
	req := requests[0]
	if req.Method != http.MethodHead || req.URL.Path != "/" {
		t.Fatalf("expected HEAD /, got %s %s", req.Method, req.URL.Path)
	}
	if req.Header.Get("Authorization") != "" || req.Header.Get("x-api-key") != "" {
		t.Fatalf("connectivity probe must not send credentials: %#v", req.Header)
	}
	body, _ := io.ReadAll(req.Body)
	if len(body) != 0 {
		t.Fatalf("connectivity probe must not send a body, got %d bytes", len(body))
	}
}
