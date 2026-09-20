package middleware

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/tidwall/gjson"
)

const distributedConcurrencyKeyPrefix = "synthapi:concurrency:v1"

var distributedConcurrencyAcquireScript = redis.NewScript(`
local user_limit = tonumber(ARGV[1]) or 0
local token_limit = tonumber(ARGV[2]) or 0
local large_limit = tonumber(ARGV[3]) or 0
local lease_seconds = tonumber(ARGV[4]) or 7200

local user_count = tonumber(redis.call('GET', KEYS[1]) or '0')
local token_count = tonumber(redis.call('GET', KEYS[2]) or '0')
local large_count = tonumber(redis.call('GET', KEYS[3]) or '0')

if user_limit > 0 and user_count >= user_limit then
  return {0, 'user'}
end
if token_limit > 0 and token_count >= token_limit then
  return {0, 'token'}
end
if large_limit > 0 and large_count >= large_limit then
  return {0, 'large_user'}
end

local function increment(key, limit)
  if limit > 0 then
    redis.call('INCR', key)
    redis.call('EXPIRE', key, lease_seconds)
  end
end

increment(KEYS[1], user_limit)
increment(KEYS[2], token_limit)
increment(KEYS[3], large_limit)
return {1, ''}
`)

var distributedConcurrencyReleaseScript = redis.NewScript(`
local function decrement(key, enabled)
  if enabled > 0 then
    local value = redis.call('GET', key)
    if value then
      value = redis.call('DECR', key)
      if value <= 0 then
        redis.call('DEL', key)
      end
    end
  end
end

decrement(KEYS[1], tonumber(ARGV[1]) or 0)
decrement(KEYS[2], tonumber(ARGV[2]) or 0)
decrement(KEYS[3], tonumber(ARGV[3]) or 0)
return 1
`)

var lastDistributedConcurrencyError atomic.Int64

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

func distributedConcurrencyKeys(userID, tokenID int) []string {
	return []string{
		fmt.Sprintf("%s:user:%d", distributedConcurrencyKeyPrefix, userID),
		fmt.Sprintf("%s:token:%d", distributedConcurrencyKeyPrefix, tokenID),
		fmt.Sprintf("%s:large-user:%d", distributedConcurrencyKeyPrefix, userID),
	}
}

func distributedConcurrencyError(err error) {
	if err == nil {
		return
	}
	now := time.Now().UnixNano()
	last := lastDistributedConcurrencyError.Load()
	if last != 0 && now-last < int64(30*time.Second) {
		return
	}
	if lastDistributedConcurrencyError.CompareAndSwap(last, now) {
		common.SysError(fmt.Sprintf("distributed model concurrency unavailable; using local fallback: %v", err))
	}
}

func redisScriptString(value interface{}) string {
	switch typed := value.(type) {
	case string:
		return typed
	case []byte:
		return string(typed)
	default:
		return fmt.Sprint(typed)
	}
}

// acquireDistributedModelRequest reserves user/token slots atomically across
// all Go instances. A false distributed flag means Redis is unavailable and
// the caller should use the existing process-local limiter instead.
func acquireDistributedModelRequest(ctx context.Context, userID, tokenID, userLimit, tokenLimit int, largeRequest bool, largeUserLimit int) (release func(), limitedBy string, distributed bool) {
	if !common.RedisEnabled || common.RDB == nil {
		return nil, "", false
	}
	if ctx == nil {
		ctx = context.Background()
	}
	checkCtx, cancel := context.WithTimeout(ctx, 250*time.Millisecond)
	defer cancel()
	keys := distributedConcurrencyKeys(userID, tokenID)
	largeLimit := 0
	if largeRequest {
		largeLimit = largeUserLimit
	}
	leaseSeconds := common.ModelRequestConcurrencyLeaseSeconds
	if leaseSeconds <= 0 {
		leaseSeconds = 7200
	}
	result, err := distributedConcurrencyAcquireScript.Run(
		checkCtx,
		common.RDB,
		keys,
		userLimit,
		tokenLimit,
		largeLimit,
		leaseSeconds,
	).Result()
	if err != nil {
		distributedConcurrencyError(err)
		return nil, "", false
	}
	values, ok := result.([]interface{})
	if !ok || len(values) < 2 {
		distributedConcurrencyError(fmt.Errorf("unexpected concurrency script result %T", result))
		return nil, "", false
	}
	allowed, ok := values[0].(int64)
	if !ok {
		distributedConcurrencyError(fmt.Errorf("unexpected concurrency decision %T", values[0]))
		return nil, "", false
	}
	if allowed == 0 {
		return nil, redisScriptString(values[1]), true
	}

	var once sync.Once
	return func() {
		once.Do(func() {
			releaseCtx, releaseCancel := context.WithTimeout(context.Background(), time.Second)
			defer releaseCancel()
			if _, err := distributedConcurrencyReleaseScript.Run(
				releaseCtx,
				common.RDB,
				keys,
				userLimit,
				tokenLimit,
				largeLimit,
			).Result(); err != nil {
				distributedConcurrencyError(err)
			}
		})
	}, "", true
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
			}
			if largeRequest && largeUserLimit > 0 {
				if l.largeUsers[userID] <= 1 {
					delete(l.largeUsers, userID)
				} else {
					l.largeUsers[userID]--
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
		release, limitedBy, distributed := acquireDistributedModelRequest(
			c.Request.Context(), userID, tokenID, userLimit, tokenLimit, largeRequest, largeUserLimit,
		)
		if !distributed {
			release, limitedBy = modelRequestActiveLimiter.acquireRequest(
				userID, tokenID, userLimit, tokenLimit, largeRequest, largeUserLimit,
			)
		}
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
