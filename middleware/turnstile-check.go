package middleware

import (
	"fmt"
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
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if rawProxy := common.GetEnvOrDefaultString("TURNSTILE_VERIFY_PROXY", ""); rawProxy != "" {
		proxyURL, err := url.Parse(rawProxy)
		if err != nil {
			common.SysError(fmt.Sprintf("invalid TURNSTILE_VERIFY_PROXY: %v", err))
		} else {
			transport.Proxy = http.ProxyURL(proxyURL)
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
