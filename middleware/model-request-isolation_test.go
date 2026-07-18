package middleware

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestPromptCacheKeyLimiterSerializesSameKey(t *testing.T) {
	limiter := promptCacheKeyLimiter{}
	firstRelease, err := limiter.acquire(context.Background(), "same-key", 1)
	require.NoError(t, err)

	secondAcquired := make(chan func(), 1)
	go func() {
		release, acquireErr := limiter.acquire(context.Background(), "same-key", 1)
		if acquireErr == nil {
			secondAcquired <- release
		}
	}()

	select {
	case <-secondAcquired:
		t.Fatal("same prompt cache key must wait for the active request")
	case <-time.After(50 * time.Millisecond):
	}

	differentRelease, err := limiter.acquire(context.Background(), "different-key", 1)
	require.NoError(t, err)
	differentRelease()

	firstRelease()
	select {
	case secondRelease := <-secondAcquired:
		secondRelease()
	case <-time.After(time.Second):
		t.Fatal("queued prompt cache key request was not released")
	}

	limiter.mu.Lock()
	require.Empty(t, limiter.entries)
	limiter.mu.Unlock()
}

func TestPromptCacheKeyLimiterCleansCanceledWaiter(t *testing.T) {
	limiter := promptCacheKeyLimiter{}
	firstRelease, err := limiter.acquire(context.Background(), "same-key", 1)
	require.NoError(t, err)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	release, err := limiter.acquire(ctx, "same-key", 1)
	require.Nil(t, release)
	require.ErrorIs(t, err, context.Canceled)

	firstRelease()
	limiter.mu.Lock()
	require.Empty(t, limiter.entries)
	limiter.mu.Unlock()
}

func TestPromptCacheConcurrencyKeyIsolatesUsers(t *testing.T) {
	require.Equal(t,
		promptCacheConcurrencyKey(20, "session-1"),
		promptCacheConcurrencyKey(20, "session-1"),
	)
	require.NotEqual(t,
		promptCacheConcurrencyKey(20, "session-1"),
		promptCacheConcurrencyKey(21, "session-1"),
	)
}

func TestPromptCacheKeyConcurrencyScope(t *testing.T) {
	compactRequest := httptest.NewRequest(http.MethodPost, "/v1/responses/compact", nil)
	compactRequest.Header.Set("Content-Type", "application/json")
	require.True(t, isPromptCacheKeyRequest(&gin.Context{Request: compactRequest}))

	responseRequest := httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	responseRequest.Header.Set("Content-Type", "application/json")
	require.False(t, isPromptCacheKeyRequest(&gin.Context{Request: responseRequest}))
}

func TestPromptCacheKeyConcurrencyMiddlewareQueuesWithout429(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldLimit := common.ModelRequestMaxConcurrencyPerPromptCacheKey
	oldExemptUserIDs := common.ModelRequestConcurrencyExemptUserIDs
	common.ModelRequestMaxConcurrencyPerPromptCacheKey = 1
	common.ModelRequestConcurrencyExemptUserIDs = nil
	promptCacheActiveLimiter = promptCacheKeyLimiter{}
	t.Cleanup(func() {
		common.ModelRequestMaxConcurrencyPerPromptCacheKey = oldLimit
		common.ModelRequestConcurrencyExemptUserIDs = oldExemptUserIDs
		promptCacheActiveLimiter = promptCacheKeyLimiter{}
	})

	entered := make(chan struct{}, 2)
	releaseHandlers := make(chan struct{})
	router := gin.New()
	router.Use(BodyStorageCleanup())
	router.Use(func(c *gin.Context) {
		c.Set("id", 20)
		c.Next()
	})
	router.Use(ModelTextRequestBodyGuard())
	router.Use(PromptCacheKeyConcurrencyLimit())
	router.POST("/v1/responses/compact", func(c *gin.Context) {
		entered <- struct{}{}
		<-releaseHandlers
		c.Status(http.StatusOK)
	})

	requestBody := `{"model":"gpt-5.6-sol","prompt_cache_key":"session-1","input":"hello"}`
	responses := make(chan int, 2)
	sendRequest := func() {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodPost, "/v1/responses/compact", strings.NewReader(requestBody))
		request.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(recorder, request)
		responses <- recorder.Code
	}

	go sendRequest()
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("first request did not enter handler")
	}

	go sendRequest()
	select {
	case <-entered:
		t.Fatal("second request with the same key bypassed the queue")
	case <-time.After(50 * time.Millisecond):
	}

	close(releaseHandlers)
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("second request did not enter after the first completed")
	}

	for i := 0; i < 2; i++ {
		select {
		case status := <-responses:
			require.Equal(t, http.StatusOK, status)
		case <-time.After(time.Second):
			t.Fatal("request did not complete")
		}
	}
}

func TestPromptCacheKeyConcurrencyMiddlewareUsesSessionHeaderWithoutReadingBody(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldLimit := common.ModelRequestMaxConcurrencyPerPromptCacheKey
	oldExemptUserIDs := common.ModelRequestConcurrencyExemptUserIDs
	common.ModelRequestMaxConcurrencyPerPromptCacheKey = 1
	common.ModelRequestConcurrencyExemptUserIDs = nil
	promptCacheActiveLimiter = promptCacheKeyLimiter{}
	t.Cleanup(func() {
		common.ModelRequestMaxConcurrencyPerPromptCacheKey = oldLimit
		common.ModelRequestConcurrencyExemptUserIDs = oldExemptUserIDs
		promptCacheActiveLimiter = promptCacheKeyLimiter{}
	})

	bodyRead := false
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("id", 20)
		c.Next()
	})
	router.Use(PromptCacheKeyConcurrencyLimit())
	router.POST("/v1/responses/compact", func(c *gin.Context) {
		require.False(t, bodyRead)
		_, _ = io.ReadAll(c.Request.Body)
		bodyRead = true
		c.Status(http.StatusOK)
	})

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/v1/responses/compact", strings.NewReader(`{"model":"gpt-5.6-sol","input":"hello"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Session_id", "session-from-header")
	router.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.True(t, bodyRead)
}

func TestActiveModelRequestLimiterEnforcesUserAndTokenLimits(t *testing.T) {
	limiter := activeModelRequestLimiter{}
	releases := make([]func(), 0, 5)
	for i := 0; i < 5; i++ {
		release, limitedBy := limiter.acquire(10, 20, 5, 5)
		require.NotNil(t, release)
		require.Empty(t, limitedBy)
		releases = append(releases, release)
	}

	release, limitedBy := limiter.acquire(10, 21, 5, 5)
	require.Nil(t, release)
	require.Equal(t, "user", limitedBy)

	releases[0]()
	release, limitedBy = limiter.acquire(10, 20, 5, 5)
	require.NotNil(t, release)
	require.Empty(t, limitedBy)
	release()
	for _, release := range releases[1:] {
		release()
	}

	tokenReleases := make([]func(), 0, 5)
	for i := 0; i < 5; i++ {
		release, limitedBy = limiter.acquire(100+i, 30, 10, 5)
		require.NotNil(t, release)
		require.Empty(t, limitedBy)
		tokenReleases = append(tokenReleases, release)
	}
	release, limitedBy = limiter.acquire(200, 30, 10, 5)
	require.Nil(t, release)
	require.Equal(t, "token", limitedBy)
	for _, release := range tokenReleases {
		release()
	}
}

func TestActiveModelRequestLimiterIsolatesLargeRequestsPerUser(t *testing.T) {
	limiter := activeModelRequestLimiter{}
	first, limitedBy := limiter.acquireRequest(20, 30, 10, 5, true, 2)
	require.NotNil(t, first)
	require.Empty(t, limitedBy)
	second, limitedBy := limiter.acquireRequest(20, 31, 10, 5, true, 2)
	require.NotNil(t, second)
	require.Empty(t, limitedBy)

	third, limitedBy := limiter.acquireRequest(20, 32, 10, 5, true, 2)
	require.Nil(t, third)
	require.Equal(t, "large_user", limitedBy)

	small, limitedBy := limiter.acquireRequest(20, 33, 10, 5, false, 2)
	require.NotNil(t, small)
	require.Empty(t, limitedBy)
	small()
	first()
	second()
}

func TestModelRequestConcurrencyLimitRejectsSixthActiveRequest(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldUserLimit := common.ModelRequestMaxConcurrencyPerUser
	oldTokenLimit := common.ModelRequestMaxConcurrencyPerToken
	oldExemptUserIDs := common.ModelRequestConcurrencyExemptUserIDs
	common.ModelRequestMaxConcurrencyPerUser = 5
	common.ModelRequestMaxConcurrencyPerToken = 5
	common.ModelRequestConcurrencyExemptUserIDs = nil
	modelRequestActiveLimiter = activeModelRequestLimiter{}
	t.Cleanup(func() {
		common.ModelRequestMaxConcurrencyPerUser = oldUserLimit
		common.ModelRequestMaxConcurrencyPerToken = oldTokenLimit
		common.ModelRequestConcurrencyExemptUserIDs = oldExemptUserIDs
		modelRequestActiveLimiter = activeModelRequestLimiter{}
	})

	releaseHandlers := make(chan struct{})
	entered := make(chan struct{}, 5)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("id", 10)
		c.Set("token_id", 20)
		c.Next()
	})
	router.Use(ModelRequestConcurrencyLimit())
	router.POST("/v1/responses", func(c *gin.Context) {
		entered <- struct{}{}
		<-releaseHandlers
		c.Status(http.StatusOK)
	})

	var wg sync.WaitGroup
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
			router.ServeHTTP(recorder, request)
			require.Equal(t, http.StatusOK, recorder.Code)
		}()
	}
	for i := 0; i < 5; i++ {
		<-entered
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	router.ServeHTTP(recorder, request)
	require.Equal(t, http.StatusTooManyRequests, recorder.Code)
	require.Equal(t, "1", recorder.Header().Get("Retry-After"))

	close(releaseHandlers)
	wg.Wait()
}

func TestModelRequestConcurrencyLimitExemptsConfiguredUser(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldUserLimit := common.ModelRequestMaxConcurrencyPerUser
	oldTokenLimit := common.ModelRequestMaxConcurrencyPerToken
	oldExemptUserIDs := common.ModelRequestConcurrencyExemptUserIDs
	common.ModelRequestMaxConcurrencyPerUser = 1
	common.ModelRequestMaxConcurrencyPerToken = 1
	common.ModelRequestConcurrencyExemptUserIDs = map[int]struct{}{20: {}}
	modelRequestActiveLimiter = activeModelRequestLimiter{}
	t.Cleanup(func() {
		common.ModelRequestMaxConcurrencyPerUser = oldUserLimit
		common.ModelRequestMaxConcurrencyPerToken = oldTokenLimit
		common.ModelRequestConcurrencyExemptUserIDs = oldExemptUserIDs
		modelRequestActiveLimiter = activeModelRequestLimiter{}
	})

	releaseHandlers := make(chan struct{})
	entered := make(chan struct{}, 2)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("id", 20)
		c.Set("token_id", 30)
		c.Next()
	})
	router.Use(ModelRequestConcurrencyLimit())
	router.POST("/v1/responses", func(c *gin.Context) {
		entered <- struct{}{}
		<-releaseHandlers
		c.Status(http.StatusOK)
	})

	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
			router.ServeHTTP(recorder, request)
			require.Equal(t, http.StatusOK, recorder.Code)
		}()
	}
	for i := 0; i < 2; i++ {
		<-entered
	}

	close(releaseHandlers)
	wg.Wait()
}

func TestModelRequestConcurrencyLimitUsesUserOverride(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldUserLimit := common.ModelRequestMaxConcurrencyPerUser
	oldTokenLimit := common.ModelRequestMaxConcurrencyPerToken
	oldExemptUserIDs := common.ModelRequestConcurrencyExemptUserIDs
	common.ModelRequestMaxConcurrencyPerUser = 1
	common.ModelRequestMaxConcurrencyPerToken = 0
	common.ModelRequestConcurrencyExemptUserIDs = nil
	modelRequestActiveLimiter = activeModelRequestLimiter{}
	t.Cleanup(func() {
		common.ModelRequestMaxConcurrencyPerUser = oldUserLimit
		common.ModelRequestMaxConcurrencyPerToken = oldTokenLimit
		common.ModelRequestConcurrencyExemptUserIDs = oldExemptUserIDs
		modelRequestActiveLimiter = activeModelRequestLimiter{}
	})

	releaseHandlers := make(chan struct{})
	entered := make(chan struct{}, 2)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("id", 20)
		c.Set("token_id", 30)
		common.SetContextKey(c, constant.ContextKeyUserSetting, dto.UserSetting{ModelRequestMaxConcurrency: 2})
		c.Next()
	})
	router.Use(ModelRequestConcurrencyLimit())
	router.POST("/v1/responses", func(c *gin.Context) {
		entered <- struct{}{}
		<-releaseHandlers
		c.Status(http.StatusOK)
	})

	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
			router.ServeHTTP(recorder, request)
			require.Equal(t, http.StatusOK, recorder.Code)
		}()
	}
	for i := 0; i < 2; i++ {
		<-entered
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	router.ServeHTTP(recorder, request)
	require.Equal(t, http.StatusTooManyRequests, recorder.Code)

	close(releaseHandlers)
	wg.Wait()
}

func TestModelTextRequestBodyGuardRejectsOversizedBody(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldLimit := common.ModelTextRequestBodyMB
	oldTimeout := common.ModelTextRequestBodyReadTimeout
	common.ModelTextRequestBodyMB = 1
	common.ModelTextRequestBodyReadTimeout = 0
	t.Cleanup(func() {
		common.ModelTextRequestBodyMB = oldLimit
		common.ModelTextRequestBodyReadTimeout = oldTimeout
	})

	router := gin.New()
	router.Use(ModelTextRequestBodyGuard())
	router.POST("/v1/responses", func(c *gin.Context) {
		_, _ = io.ReadAll(c.Request.Body)
		c.Status(http.StatusOK)
	})

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/v1/responses", strings.NewReader(strings.Repeat("x", (1<<20)+1)))
	router.ServeHTTP(recorder, request)
	require.Equal(t, http.StatusRequestEntityTooLarge, recorder.Code)
}
