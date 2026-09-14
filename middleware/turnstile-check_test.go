package middleware

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}

func withTurnstileTestState(t *testing.T, client *http.Client) {
	t.Helper()
	previousEnabled := common.TurnstileCheckEnabled
	previousSecret := common.TurnstileSecretKey
	previousClient := turnstileHTTPClient
	common.TurnstileCheckEnabled = true
	common.TurnstileSecretKey = "test-secret"
	turnstileHTTPClient = client
	t.Cleanup(func() {
		common.TurnstileCheckEnabled = previousEnabled
		common.TurnstileSecretKey = previousSecret
		turnstileHTTPClient = previousClient
	})
}

func performTurnstileRequest(tokenHeader string, queryToken string) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(sessions.Sessions("session", cookie.NewStore([]byte("turnstile-test"))))
	router.POST("/login", TurnstileCheck(), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"success": true})
	})

	path := "/login"
	if queryToken != "" {
		path += "?turnstile=" + url.QueryEscape(queryToken)
	}
	request := httptest.NewRequest(http.MethodPost, path, nil)
	if tokenHeader != "" {
		request.Header.Set(turnstileTokenHeader, tokenHeader)
	}
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	return recorder
}

func TestTurnstileCheckPrefersHeaderAndAcceptsQueryFallback(t *testing.T) {
	var receivedTokens []string
	client := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		body, err := io.ReadAll(request.Body)
		require.NoError(t, err)
		values, err := url.ParseQuery(string(body))
		require.NoError(t, err)
		receivedTokens = append(receivedTokens, values.Get("response"))
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(`{"success":true}`)),
			Header:     make(http.Header),
		}, nil
	})}
	withTurnstileTestState(t, client)

	require.Equal(t, http.StatusOK, performTurnstileRequest("header-token", "query-token").Code)
	require.Equal(t, http.StatusOK, performTurnstileRequest("", "query-token").Code)
	require.Equal(t, []string{"header-token", "query-token"}, receivedTokens)
}

func TestTurnstileCheckTimesOutWithRetryableResponse(t *testing.T) {
	client := &http.Client{
		Timeout: 30 * time.Millisecond,
		Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
			<-request.Context().Done()
			return nil, request.Context().Err()
		}),
	}
	withTurnstileTestState(t, client)

	startedAt := time.Now()
	recorder := performTurnstileRequest("header-token", "")
	require.Equal(t, http.StatusServiceUnavailable, recorder.Code)
	require.Less(t, time.Since(startedAt), time.Second)
	require.Equal(t, "2", recorder.Header().Get("Retry-After"))
	require.Contains(t, recorder.Body.String(), "人机验证服务暂时不可用")
}

func TestTurnstileCheckUsesRequestContext(t *testing.T) {
	requestCancelled := make(chan struct{})
	client := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		<-request.Context().Done()
		close(requestCancelled)
		return nil, request.Context().Err()
	})}
	withTurnstileTestState(t, client)

	ctx, cancel := context.WithCancel(context.Background())
	request := httptest.NewRequest(http.MethodPost, "/login", nil).WithContext(ctx)
	request.Header.Set(turnstileTokenHeader, "header-token")
	recorder := httptest.NewRecorder()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(sessions.Sessions("session", cookie.NewStore([]byte("turnstile-test"))))
	router.POST("/login", TurnstileCheck())
	done := make(chan struct{})
	go func() {
		router.ServeHTTP(recorder, request)
		close(done)
	}()
	cancel()

	select {
	case <-requestCancelled:
	case <-time.After(time.Second):
		t.Fatal("Turnstile request was not cancelled with the incoming request")
	}
	<-done
}

func TestTurnstileFallbackReplaysBodyAfterPrimaryTimeout(t *testing.T) {
	payload := "secret=test&response=token"
	fallbackCalled := false
	transport := &turnstileFallbackTransport{
		primaryTimeout: 20 * time.Millisecond,
		primary: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			_, _ = io.ReadAll(r.Body)
			<-r.Context().Done()
			return nil, r.Context().Err()
		}),
		fallback: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			fallbackCalled = true
			require.NoError(t, r.Context().Err())
			body, err := io.ReadAll(r.Body)
			require.NoError(t, err)
			require.Equal(t, payload, string(body))
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"success":true}`)), Header: make(http.Header)}, nil
		}),
	}
	client := &http.Client{Transport: transport, Timeout: time.Second}
	response, err := client.Post("https://verify.example/", "application/x-www-form-urlencoded", strings.NewReader(payload))
	require.NoError(t, err)
	defer response.Body.Close()
	require.True(t, fallbackCalled)
}

func TestTurnstileFallbackIsActuallyDirect(t *testing.T) {
	t.Setenv("HTTP_PROXY", "http://127.0.0.1:1")
	t.Setenv("HTTPS_PROXY", "http://127.0.0.1:1")
	t.Setenv("TURNSTILE_VERIFY_PROXY", "http://127.0.0.1:2")
	client := newTurnstileHTTPClient()
	transport := client.Transport.(*turnstileFallbackTransport)
	require.Nil(t, transport.fallback.(*http.Transport).Proxy)
	require.NotNil(t, transport.primary.(*http.Transport).Proxy)
}
