package middleware

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

const (
	turnstileTokenHeader    = "X-Turnstile-Token"
	turnstileVerifyEndpoint = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
)

var turnstileHTTPClient = newTurnstileHTTPClient()

type turnstileCheckResponse struct {
	Success bool `json:"success"`
}

func newTurnstileHTTPClient() *http.Client {
	directTransport := http.DefaultTransport.(*http.Transport).Clone()
	// Direct fallback must not inherit the same broken HTTP(S)_PROXY.
	directTransport.Proxy = nil
	var transport http.RoundTripper = directTransport
	if rawProxy := common.GetEnvOrDefaultString("TURNSTILE_VERIFY_PROXY", ""); rawProxy != "" {
		proxyURL, err := url.Parse(rawProxy)
		if err != nil {
			common.SysError(fmt.Sprintf("invalid TURNSTILE_VERIFY_PROXY: %v", err))
		} else {
			proxyTransport := directTransport.Clone()
			proxyTransport.Proxy = http.ProxyURL(proxyURL)
			transport = &turnstileFallbackTransport{primary: proxyTransport, fallback: directTransport, primaryTimeout: 3 * time.Second}
		}
	}

	timeoutSeconds := common.GetEnvOrDefault("TURNSTILE_VERIFY_TIMEOUT_SECONDS", 6)
	if timeoutSeconds < 1 {
		timeoutSeconds = 6
	}
	return &http.Client{
		Transport: transport,
		Timeout:   time.Duration(timeoutSeconds) * time.Second,
	}
}

type turnstileFallbackTransport struct {
	primary, fallback http.RoundTripper
	primaryTimeout    time.Duration
}

func (t *turnstileFallbackTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	timeout := t.primaryTimeout
	if timeout <= 0 {
		timeout = 3 * time.Second
	}
	ctx, cancel := context.WithTimeout(req.Context(), timeout)
	primary := req.Clone(ctx)
	res, err := t.primary.RoundTrip(primary)
	if err == nil && res.StatusCode >= 200 && res.StatusCode < 500 {
		res.Body = &turnstileResponseBody{ReadCloser: res.Body, cancel: cancel}
		return res, nil
	}
	if res != nil {
		res.Body.Close()
	}
	cancel()
	if req.Context().Err() != nil {
		return nil, req.Context().Err()
	}
	fallback := req.Clone(req.Context())
	if req.Body != nil {
		if req.GetBody == nil {
			return nil, fmt.Errorf("verification request cannot be replayed")
		}
		fallback.Body, err = req.GetBody()
		if err != nil {
			return nil, err
		}
	}
	return t.fallback.RoundTrip(fallback)
}

type turnstileResponseBody struct {
	io.ReadCloser
	cancel context.CancelFunc
}

func (b *turnstileResponseBody) Close() error {
	defer b.cancel()
	return b.ReadCloser.Close()
}

func turnstileToken(c *gin.Context) string {
	if token := strings.TrimSpace(c.GetHeader(turnstileTokenHeader)); token != "" {
		return token
	}
	// Query compatibility is retained for older clients. New clients use the
	// header so ephemeral Turnstile tokens are not written to access logs.
	return strings.TrimSpace(c.Query("turnstile"))
}

func abortTurnstileUnavailable(c *gin.Context, err error) {
	common.SysLog(fmt.Sprintf("Turnstile verification unavailable: %v", err))
	c.Header("Retry-After", "2")
	c.JSON(http.StatusServiceUnavailable, gin.H{
		"success": false,
		"message": "人机验证服务暂时不可用，请稍后重试",
	})
	c.Abort()
}

func TurnstileCheck() gin.HandlerFunc {
	return func(c *gin.Context) {
		if common.TurnstileCheckEnabled {
			session := sessions.Default(c)
			turnstileChecked := session.Get("turnstile")
			if turnstileChecked != nil {
				c.Next()
				return
			}
			response := turnstileToken(c)
			if response == "" {
				c.JSON(http.StatusOK, gin.H{
					"success": false,
					"message": "Turnstile token 为空",
				})
				c.Abort()
				return
			}
			form := url.Values{
				"secret":   {common.TurnstileSecretKey},
				"response": {response},
				"remoteip": {c.ClientIP()},
			}
			request, err := http.NewRequestWithContext(
				c.Request.Context(),
				http.MethodPost,
				turnstileVerifyEndpoint,
				strings.NewReader(form.Encode()),
			)
			if err != nil {
				abortTurnstileUnavailable(c, err)
				return
			}
			request.Header.Set("Content-Type", "application/x-www-form-urlencoded")

			rawRes, err := turnstileHTTPClient.Do(request)
			if err != nil {
				abortTurnstileUnavailable(c, err)
				return
			}
			defer rawRes.Body.Close()
			if rawRes.StatusCode < http.StatusOK || rawRes.StatusCode >= http.StatusMultipleChoices {
				abortTurnstileUnavailable(c, fmt.Errorf("unexpected HTTP status %d", rawRes.StatusCode))
				return
			}
			var res turnstileCheckResponse
			err = common.DecodeJson(rawRes.Body, &res)
			if err != nil {
				abortTurnstileUnavailable(c, err)
				return
			}
			if !res.Success {
				c.JSON(http.StatusOK, gin.H{
					"success": false,
					"message": "Turnstile 校验失败，请刷新重试！",
				})
				c.Abort()
				return
			}
			session.Set("turnstile", true)
			err = session.Save()
			if err != nil {
				c.JSON(http.StatusOK, gin.H{
					"message": "无法保存会话信息，请重试",
					"success": false,
				})
				return
			}
		}
		c.Next()
	}
}
