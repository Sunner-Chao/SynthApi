package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestCodexWhamURLNormalizesBackendAPIBase(t *testing.T) {
	url, err := codexWhamURL("https://chatgpt.com", "rate-limit-reset-credits")
	require.NoError(t, err)
	require.Equal(t, "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits", url)

	url, err = codexWhamURL("https://chatgpt.com/backend-api/", "usage")
	require.NoError(t, err)
	require.Equal(t, "https://chatgpt.com/backend-api/wham/usage", url)
}

func TestConsumeCodexRateLimitResetCreditContract(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "/backend-api/wham/rate-limit-reset-credits/consume", r.URL.Path)
		require.Equal(t, "Bearer test-access-token", r.Header.Get("Authorization"))
		require.Equal(t, "account-123", r.Header.Get("chatgpt-account-id"))
		require.Equal(t, "codex_cli_rs", r.Header.Get("originator"))
		require.Equal(t, "application/json", r.Header.Get("Content-Type"))

		var payload map[string]string
		require.NoError(t, common.DecodeJson(r.Body, &payload))
		require.Equal(t, map[string]string{
			"redeem_request_id": "request-123",
			"credit_id":         "credit-456",
		}, payload)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"code":"reset","windows_reset":2}`))
	}))
	defer server.Close()

	status, body, err := ConsumeCodexRateLimitResetCredit(
		context.Background(),
		server.Client(),
		server.URL,
		"test-access-token",
		"account-123",
		"request-123",
		"credit-456",
	)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, status)
	var response CodexRateLimitResetConsumeResponse
	require.NoError(t, common.Unmarshal(body, &response))
	require.Equal(t, "reset", response.Code)
	require.EqualValues(t, 2, response.WindowsReset)
}

func TestFetchCodexRateLimitResetCreditsContract(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodGet, r.Method)
		require.Equal(t, "/backend-api/wham/rate-limit-reset-credits", r.URL.Path)
		require.Equal(t, "Bearer test-access-token", r.Header.Get("Authorization"))
		require.Equal(t, "account-123", r.Header.Get("chatgpt-account-id"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"available_count":1,"credits":[]}`))
	}))
	defer server.Close()

	status, body, err := FetchCodexRateLimitResetCredits(
		context.Background(),
		server.Client(),
		strings.TrimRight(server.URL, "/"),
		"test-access-token",
		"account-123",
	)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, status)
	var response CodexRateLimitResetCredits
	require.NoError(t, common.Unmarshal(body, &response))
	require.EqualValues(t, 1, response.AvailableCount)
}
