package middleware

import (
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/gin-gonic/gin"
)

type activeModelRequestLimiter struct {
	mu         sync.Mutex
	users      map[int]int
	tokens     map[int]int
	largeUsers map[int]int
}

var modelRequestActiveLimiter activeModelRequestLimiter

func (l *activeModelRequestLimiter) acquire(userID, tokenID, userLimit, tokenLimit int) (func(), string) {
	return l.acquireRequest(userID, tokenID, userLimit, tokenLimit, false, 0)
}

func (l *activeModelRequestLimiter) acquireRequest(userID, tokenID, userLimit, tokenLimit int, largeRequest bool, largeUserLimit int) (func(), string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if userLimit > 0 && l.users[userID] >= userLimit {
		return nil, "user"
	}
	if tokenLimit > 0 && tokenID > 0 && l.tokens[tokenID] >= tokenLimit {
		return nil, "token"
	}
	if largeRequest && largeUserLimit > 0 && l.largeUsers[userID] >= largeUserLimit {
		return nil, "large_user"
	}
	if l.users == nil {
		l.users = make(map[int]int)
	}
	if l.tokens == nil {
		l.tokens = make(map[int]int)
	}
	if l.largeUsers == nil {
		l.largeUsers = make(map[int]int)
	}
	if userLimit > 0 {
		l.users[userID]++
	}
	if tokenLimit > 0 && tokenID > 0 {
		l.tokens[tokenID]++
	}
	if largeRequest && largeUserLimit > 0 {
		l.largeUsers[userID]++
	}

	var once sync.Once
	return func() {
		once.Do(func() {
			l.mu.Lock()
			defer l.mu.Unlock()
			if userLimit > 0 {
				if l.users[userID] <= 1 {
					delete(l.users, userID)
				} else {
					l.users[userID]--
				}
			}
			if tokenLimit > 0 && tokenID > 0 {
				if l.tokens[tokenID] <= 1 {
					delete(l.tokens, tokenID)
				} else {
					l.tokens[tokenID]--
				}
				if largeRequest && largeUserLimit > 0 {
					if l.largeUsers[userID] <= 1 {
						delete(l.largeUsers, userID)
					} else {
						l.largeUsers[userID]--
					}
				}
			}
		})
	}, ""
}

func ModelRequestConcurrencyLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		userLimit := common.ModelRequestMaxConcurrencyPerUser
		tokenLimit := common.ModelRequestMaxConcurrencyPerToken
		largeUserLimit := common.ModelRequestMaxLargeConcurrencyPerUser
		if userSetting, ok := common.GetContextKeyType[dto.UserSetting](c, constant.ContextKeyUserSetting); ok && userSetting.ModelRequestMaxConcurrency > 0 {
			userLimit = userSetting.ModelRequestMaxConcurrency
		}
		largeRequest := false
		if thresholdMB := common.ModelRequestLargeBodyThresholdMB; thresholdMB > 0 && c.Request.ContentLength > int64(thresholdMB)<<20 {
			largeRequest = true
		}
		if userLimit <= 0 && tokenLimit <= 0 && (!largeRequest || largeUserLimit <= 0) {
			c.Next()
			return
		}

		userID := c.GetInt("id")
		if _, exempt := common.ModelRequestConcurrencyExemptUserIDs[userID]; exempt {
			c.Next()
			return
		}
		tokenID := c.GetInt("token_id")
		release, limitedBy := modelRequestActiveLimiter.acquireRequest(userID, tokenID, userLimit, tokenLimit, largeRequest, largeUserLimit)
		if release == nil {
			c.Header("Retry-After", "1")
			limit := userLimit
			label := "用户"
			if limitedBy == "token" {
				limit = tokenLimit
				label = "令牌"
			} else if limitedBy == "large_user" {
				limit = largeUserLimit
				label = "用户大请求"
			}
			abortWithOpenAiMessage(c, http.StatusTooManyRequests,
				fmt.Sprintf("当前并发请求过多：每个%s最多同时处理 %d 个模型请求", label, limit))
			return
		}
		defer release()
		c.Next()
	}
}

type deadlineReadCloser struct {
	io.ReadCloser
	clear func()
	once  sync.Once
}

func (b *deadlineReadCloser) clearDeadline() {
	b.once.Do(b.clear)
}

func (b *deadlineReadCloser) Read(p []byte) (int, error) {
	n, err := b.ReadCloser.Read(p)
	if err != nil {
		b.clearDeadline()
	}
	return n, err
}

func (b *deadlineReadCloser) Close() error {
	b.clearDeadline()
	return b.ReadCloser.Close()
}

func isTextModelRequestPath(path string) bool {
	switch path {
	case "/v1/responses", "/v1/responses/compact", "/v1/chat/completions", "/v1/completions",
		"/v1/messages", "/anthropic/v1/messages", "/anthroic/v1/messages":
		return true
	default:
		return false
	}
}

func ModelTextRequestBodyGuard() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method != http.MethodPost || !isTextModelRequestPath(c.Request.URL.Path) {
			c.Next()
			return
		}

		maxMB := common.ModelTextRequestBodyMB
		if maxMB > 0 {
			maxBytes := int64(maxMB) << 20
			if c.Request.ContentLength > maxBytes {
				abortWithOpenAiMessage(c, http.StatusRequestEntityTooLarge,
					fmt.Sprintf("文本模型请求体不能超过 %d MB", maxMB))
				return
			}
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		}

		timeoutSeconds := common.ModelTextRequestBodyReadTimeout
		if timeoutSeconds > 0 && c.Request.Body != nil {
			controller := http.NewResponseController(c.Writer)
			if err := controller.SetReadDeadline(time.Now().Add(time.Duration(timeoutSeconds) * time.Second)); err == nil {
				c.Request.Body = &deadlineReadCloser{
					ReadCloser: c.Request.Body,
					clear: func() {
						_ = controller.SetReadDeadline(time.Time{})
					},
				}
			}
		}

		c.Next()
	}
}
