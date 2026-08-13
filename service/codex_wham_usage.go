package service

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

// CodexRateLimitResetCredits is the reset-credit inventory returned by the
// official Codex backend. The credit IDs are opaque and must only be passed
// back to that backend; they are never logged or shown in error messages.
type CodexRateLimitResetCredits struct {
	Credits       []CodexRateLimitResetCredit `json:"credits,omitempty"`
	AvailableCount int64                      `json:"available_count"`
}

type CodexRateLimitResetCredit struct {
	ID          string  `json:"id"`
	ResetType   string  `json:"reset_type"`
	Status      string  `json:"status"`
	GrantedAt   string  `json:"granted_at"`
	ExpiresAt   *string `json:"expires_at"`
	Title       *string `json:"title"`
	Description *string `json:"description"`
}

type CodexRateLimitResetConsumeResponse struct {
	Code        string `json:"code"`
	WindowsReset int64  `json:"windows_reset"`
}

func codexWhamURL(baseURL string, suffix string) (string, error) {
	bu := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if bu == "" {
		return "", fmt.Errorf("empty baseURL")
	}
	cleanSuffix := strings.TrimLeft(strings.TrimSpace(suffix), "/")
	if strings.HasSuffix(strings.ToLower(bu), "/backend-api") {
		return bu + "/wham/" + cleanSuffix, nil
	}
	return bu + "/backend-api/wham/" + cleanSuffix, nil
}

func newCodexWhamRequest(
	ctx context.Context,
	method string,
	url string,
	accessToken string,
	accountID string,
	body io.Reader,
) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(accessToken))
	req.Header.Set("chatgpt-account-id", strings.TrimSpace(accountID))
	req.Header.Set("Accept", "application/json")
	req.Header.Set("originator", "codex_cli_rs")
	return req, nil
}

func doCodexWhamRequest(
	client *http.Client,
	req *http.Request,
) (statusCode int, body []byte, err error) {
	resp, err := client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	body, err = io.ReadAll(resp.Body)
	if err != nil {
		return resp.StatusCode, nil, err
	}
	return resp.StatusCode, body, nil
}

func FetchCodexWhamUsage(
	ctx context.Context,
	client *http.Client,
	baseURL string,
	accessToken string,
	accountID string,
) (statusCode int, body []byte, err error) {
	if client == nil {
		return 0, nil, fmt.Errorf("nil http client")
	}
	at := strings.TrimSpace(accessToken)
	aid := strings.TrimSpace(accountID)
	if at == "" {
		return 0, nil, fmt.Errorf("empty accessToken")
	}
	if aid == "" {
		return 0, nil, fmt.Errorf("empty accountID")
	}

	url, err := codexWhamURL(baseURL, "usage")
	if err != nil {
		return 0, nil, err
	}
	req, err := newCodexWhamRequest(ctx, http.MethodGet, url, at, aid, nil)
	if err != nil {
		return 0, nil, err
	}
	return doCodexWhamRequest(client, req)
}

// FetchCodexRateLimitResetCredits lists reset credits granted by OpenAI. It
// returns the upstream status and raw JSON so callers can handle auth refresh
// without ever exposing the bearer token or credit identifiers in logs.
func FetchCodexRateLimitResetCredits(
	ctx context.Context,
	client *http.Client,
	baseURL string,
	accessToken string,
	accountID string,
) (statusCode int, body []byte, err error) {
	if client == nil {
		return 0, nil, fmt.Errorf("nil http client")
	}
	if strings.TrimSpace(accessToken) == "" || strings.TrimSpace(accountID) == "" {
		return 0, nil, fmt.Errorf("access token and account ID are required")
	}
	url, err := codexWhamURL(baseURL, "rate-limit-reset-credits")
	if err != nil {
		return 0, nil, err
	}
	req, err := newCodexWhamRequest(ctx, http.MethodGet, url, accessToken, accountID, nil)
	if err != nil {
		return 0, nil, err
	}
	return doCodexWhamRequest(client, req)
}

// ConsumeCodexRateLimitResetCredit consumes one official reset credit. The
// idempotency key must be reused for retries of the same logical click.
func ConsumeCodexRateLimitResetCredit(
	ctx context.Context,
	client *http.Client,
	baseURL string,
	accessToken string,
	accountID string,
	idempotencyKey string,
	creditID string,
) (statusCode int, body []byte, err error) {
	if client == nil {
		return 0, nil, fmt.Errorf("nil http client")
	}
	if strings.TrimSpace(accessToken) == "" || strings.TrimSpace(accountID) == "" {
		return 0, nil, fmt.Errorf("access token and account ID are required")
	}
	key := strings.TrimSpace(idempotencyKey)
	if key == "" {
		return 0, nil, fmt.Errorf("idempotency key is required")
	}
	url, err := codexWhamURL(baseURL, "rate-limit-reset-credits/consume")
	if err != nil {
		return 0, nil, err
	}
	payload := map[string]string{"redeem_request_id": key}
	if value := strings.TrimSpace(creditID); value != "" {
		payload["credit_id"] = value
	}
	encoded, err := common.Marshal(payload)
	if err != nil {
		return 0, nil, err
	}
	req, err := newCodexWhamRequest(ctx, http.MethodPost, url, accessToken, accountID, strings.NewReader(string(encoded)))
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	return doCodexWhamRequest(client, req)
}
