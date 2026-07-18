package middleware

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
)

type activeModelRequestLimiter struct {
	mu         sync.Mutex
	users      map[int]int
	tokens     map[int]int
	largeUsers map[int]int
}

var modelRequestActiveLimiter activeModelRequestLimiter

type promptCacheKeyEntry struct {
	slots chan struct{}
	refs  int
}

type promptCacheKeyLimiter struct {
	mu      sync.Mutex
	entries map[string]*promptCacheKeyEntry
}

var promptCacheActiveLimiter promptCacheKeyLimiter

func (l *promptCacheKeyLimiter) acquire(ctx context.Context, key string, limit int) (func(), error) {
	if key == "" || limit <= 0 {
		return func() {}, nil
	}
	if ctx == nil {
		ctx = context.Background()
	}

	l.mu.Lock()
	if l.entries == nil {
		l.entries = make(map[string]*promptCacheKeyEntry)
	}
	entry := l.entries[key]
	if entry == nil {
		entry = &promptCacheKeyEntry{slots: make(chan struct{}, limit)}
		l.entries[key] = entry
	}
	entry.refs++
	l.mu.Unlock()

	dropRef := func() {
		l.mu.Lock()
		defer l.mu.Unlock()
		entry.refs--
		if entry.refs == 0 && l.entries[key] == entry {
			delete(l.entries, key)
		}
	}

	select {
	case entry.slots <- struct{}{}:
		if err := ctx.Err(); err != nil {
			<-entry.slots
			dropRef()
			return nil, err
		}
	case <-ctx.Done():
		dropRef()
		return nil, ctx.Err()
	}

	var once sync.Once
	return func() {
		once.Do(func() {
			<-entry.slots
			dropRef()
		})
	}, nil
}

func isPromptCacheKeyRequest(c *gin.Context) bool {
	if c == nil || c.Request == nil || c.Request.Method != http.MethodPost {
		return false
	}
	switch c.Request.URL.Path {
	case "/v1/responses/compact":
		return strings.HasPrefix(c.Request.Header.Get("Content-Type"), "application/json")
	default:
		return false
	}
}

func promptCacheConcurrencyKey(userID int, promptCacheKey string) string {
	payload := fmt.Sprintf("%d\x00%s", userID, promptCacheKey)
	return common.Sha1([]byte(payload))
}

// PromptCacheKeyConcurrencyLimit serializes compact requests that mutate the
// same Codex context before they consume broader concurrency budgets.
func PromptCacheKeyConcurrencyLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		limit := common.ModelRequestMaxConcurrencyPerPromptCacheKey
		if limit <= 0 || !isPromptCacheKeyRequest(c) {
			c.Next()
			return
		}

		userID := c.GetInt("id")
		if userID <= 0 {
			c.Next()
			return
		}
		if _, exempt := common.ModelRequestConcurrencyExemptUserIDs[userID]; exempt {
			c.Next()
			return
		}
		if common.GetContextKeyTime(c, constant.ContextKeyRequestStartTime).IsZero() {
			common.SetContextKey(c, constant.ContextKeyRequestStartTime, time.Now())
		}

		promptCacheKey := strings.TrimSpace(c.Request.Header.Get("session_id"))
		if promptCacheKey == "" {
			storage, err := common.GetBodyStorage(c)
			if err != nil {
				status := http.StatusBadRequest
				if common.IsRequestBodyTooLargeError(err) {
					status = http.StatusRequestEntityTooLarge
				}
				abortWithOpenAiMessage(c, status, fmt.Sprintf("读取请求体失败：%v", err))
				return
			}
			body, err := storage.Bytes()
			if err != nil {
				abortWithOpenAiMessage(c, http.StatusBadRequest, fmt.Sprintf("读取请求体失败：%v", err))
				return
			}
			if _, err = storage.Seek(0, io.SeekStart); err != nil {
				abortWithOpenAiMessage(c, http.StatusBadRequest, fmt.Sprintf("重置请求体失败：%v", err))
				return
			}
			c.Request.Body = io.NopCloser(storage)

			if !gjson.ValidBytes(body) {
				c.Next()
				return
			}
			values := gjson.GetManyBytes(body, "model", "prompt_cache_key")
			promptCacheKey = strings.TrimSpace(values[1].String())
		}
		if promptCacheKey == "" {
			c.Next()
			return
		}

		queueStarted := time.Now()
		release, err := promptCacheActiveLimiter.acquire(
			c.Request.Context(),
			promptCacheConcurrencyKey(userID, promptCacheKey),
			limit,
		)
		common.SetContextKey(c, constant.ContextKeyPromptCacheQueue, time.Since(queueStarted))
		if err != nil {
			c.Abort()
			return
		}
		defer release()
		c.Next()
	}
}

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
