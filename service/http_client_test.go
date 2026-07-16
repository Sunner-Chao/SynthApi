package service

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestNewRelayTransportHonorsHTTP2Setting(t *testing.T) {
	old := common.RelayForceHTTP2
	t.Cleanup(func() { common.RelayForceHTTP2 = old })

	common.RelayForceHTTP2 = false
	transport := newRelayTransport(nil, nil)
	require.False(t, transport.ForceAttemptHTTP2)

	common.RelayForceHTTP2 = true
	transport = newRelayTransport(nil, nil)
	require.True(t, transport.ForceAttemptHTTP2)
}

func TestRelayRequestDoesNotFollowRedirects(t *testing.T) {
	finalRequests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/final" {
			finalRequests++
			w.WriteHeader(http.StatusOK)
			return
		}
		http.Redirect(w, r, "/final", http.StatusTemporaryRedirect)
	}))
	defer server.Close()

	req, err := http.NewRequest(http.MethodPost, server.URL+"/start", nil)
	require.NoError(t, err)
	req = MarkRelayRequestSingleHop(req)
	client := &http.Client{CheckRedirect: checkRedirect}
	resp, err := client.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusTemporaryRedirect, resp.StatusCode)
	require.Zero(t, finalRequests)
}

func TestNewProxyHTTPClientIntegration(t *testing.T) {
	proxyURL := os.Getenv("SOCKS5_INTEGRATION_PROXY")
	targetURL := os.Getenv("SOCKS5_INTEGRATION_URL")
	if proxyURL == "" || targetURL == "" {
		t.Skip("SOCKS5 integration endpoint is not configured")
	}

	client, err := NewProxyHttpClient(proxyURL)
	require.NoError(t, err)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	require.NoError(t, err)
	resp, err := client.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	if expected := os.Getenv("SOCKS5_INTEGRATION_STATUS"); expected != "" {
		status, err := strconv.Atoi(expected)
		require.NoError(t, err)
		require.Equal(t, status, resp.StatusCode)
	}
}

func TestResolveSOCKS5TargetsResolvesAndDeduplicates(t *testing.T) {
	lookup := func(_ context.Context, host string) ([]net.IPAddr, error) {
		require.Equal(t, "api.example.test", host)
		return []net.IPAddr{
			{IP: net.ParseIP("104.26.10.94")},
			{IP: net.ParseIP("104.26.10.94")},
			{IP: net.ParseIP("2606:4700:20::681a:a5e")},
		}, nil
	}

	targets, err := resolveSOCKS5Targets(
		context.Background(),
		"tcp",
		"api.example.test:443",
		lookup,
	)
	require.NoError(t, err)
	require.Equal(t, []string{
		"104.26.10.94:443",
		"[2606:4700:20::681a:a5e]:443",
	}, targets)
}

func TestResolveSOCKS5TargetsKeepsLiteralIP(t *testing.T) {
	lookupCalled := false
	lookup := func(_ context.Context, _ string) ([]net.IPAddr, error) {
		lookupCalled = true
		return nil, nil
	}

	targets, err := resolveSOCKS5Targets(
		context.Background(),
		"tcp",
		"104.26.10.94:443",
		lookup,
	)
	require.NoError(t, err)
	require.False(t, lookupCalled)
	require.Equal(t, []string{"104.26.10.94:443"}, targets)
}

func TestResolveSOCKS5TargetsFiltersNetworkFamily(t *testing.T) {
	lookup := func(_ context.Context, _ string) ([]net.IPAddr, error) {
		return []net.IPAddr{
			{IP: net.ParseIP("104.26.10.94")},
			{IP: net.ParseIP("2606:4700:20::681a:a5e")},
		}, nil
	}

	targets, err := resolveSOCKS5Targets(
		context.Background(),
		"tcp4",
		"api.example.test:443",
		lookup,
	)
	require.NoError(t, err)
	require.Equal(t, []string{"104.26.10.94:443"}, targets)
}
