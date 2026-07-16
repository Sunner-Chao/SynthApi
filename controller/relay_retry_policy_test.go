package controller

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestRetryLimitAppliesToChannelErrors(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	err := types.NewError(errors.New("channel runtime failure"), types.ErrorCodeChannelAwsClientError)

	require.False(t, shouldRetry(c, err, 0))
	require.True(t, shouldRetry(c, err, 1))
}

func TestSmartGroupFailoverRequiresGlobalAndTokenOptIn(t *testing.T) {
	originalRetryTimes := common.RetryTimes
	t.Cleanup(func() { common.RetryTimes = originalRetryTimes })

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	err := types.NewErrorWithStatusCode(errors.New("bad gateway"), types.ErrorCodeBadResponseStatusCode, http.StatusBadGateway)
	info := &relaycommon.RelayInfo{}

	common.RetryTimes = 0
	common.SetContextKey(c, constant.ContextKeyTokenCrossGroupRetry, true)
	require.False(t, shouldSmartGroupFailover(c, info, "primary", err))

	common.RetryTimes = 1
	common.SetContextKey(c, constant.ContextKeyTokenCrossGroupRetry, false)
	require.False(t, shouldSmartGroupFailover(c, info, "primary", err))

	common.SetContextKey(c, constant.ContextKeyTokenCrossGroupRetry, true)
	require.True(t, shouldSmartGroupFailover(c, info, "primary", err))
}

func TestRelayAttemptBudgetCannotBeResetOrMadeUnbounded(t *testing.T) {
	budget := newRelayAttemptBudget(2)
	require.Equal(t, 2, budget.retryLimit())
	require.True(t, budget.acquire())
	require.Equal(t, 2, budget.remainingRetries())
	require.True(t, budget.acquire())
	require.True(t, budget.acquire())
	require.False(t, budget.acquire())
	require.True(t, budget.exhausted())

	budget = newRelayAttemptBudget(1000)
	require.Equal(t, maxRelayRetryTimes+1, budget.max)
	budget = newRelayAttemptBudget(-1)
	require.Equal(t, 1, budget.max)
}

func TestTaskRetryOnlyUsesConfiguredTransientErrors(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/videos", nil)

	require.True(t, shouldRetryTaskRelay(c, 1, &dto.TaskError{StatusCode: http.StatusTooManyRequests}, 1))
	require.True(t, shouldRetryTaskRelay(c, 1, &dto.TaskError{StatusCode: http.StatusBadGateway}, 1))
	require.False(t, shouldRetryTaskRelay(c, 1, &dto.TaskError{StatusCode: http.StatusUnprocessableEntity}, 1))
	require.False(t, shouldRetryTaskRelay(c, 1, &dto.TaskError{StatusCode: http.StatusGatewayTimeout}, 1))
	require.False(t, shouldRetryTaskRelay(c, 1, &dto.TaskError{StatusCode: http.StatusBadGateway}, 0))

	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	c.Request = c.Request.WithContext(cancelled)
	require.False(t, shouldRetryTaskRelay(c, 1, &dto.TaskError{StatusCode: http.StatusBadGateway}, 1))
}

func TestRelayFailoverPolicyOnlyRetriesSmallPreResponseTransportFailureOnce(t *testing.T) {
	originalBodyMB := common.ModelRequestSmallFailoverBodyMB
	originalTimeout := common.ModelRequestSmallFailoverTimeoutSeconds
	common.ModelRequestSmallFailoverBodyMB = 1
	common.ModelRequestSmallFailoverTimeoutSeconds = 8
	t.Cleanup(func() {
		common.ModelRequestSmallFailoverBodyMB = originalBodyMB
		common.ModelRequestSmallFailoverTimeoutSeconds = originalTimeout
	})

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	started := time.Now()
	info := &relaycommon.RelayInfo{StartTime: started, FirstResponseTime: started.Add(-time.Second)}
	transportErr := types.NewError(errors.New("dial tcp: connection reset by peer"), types.ErrorCodeDoRequestFailed)

	policy := newRelayFailoverPolicy()
	policy.setBodySize(1 << 20)
	require.True(t, policy.allowRetry(c, info, transportErr, 1))
	require.False(t, policy.allowRetry(c, info, transportErr, 1))
	require.False(t, policy.deadline.IsZero())
}

func TestRelayFailoverPolicyRejectsLargeAndHTTPStatusFailures(t *testing.T) {
	originalBodyMB := common.ModelRequestSmallFailoverBodyMB
	originalTimeout := common.ModelRequestSmallFailoverTimeoutSeconds
	common.ModelRequestSmallFailoverBodyMB = 1
	common.ModelRequestSmallFailoverTimeoutSeconds = 8
	t.Cleanup(func() {
		common.ModelRequestSmallFailoverBodyMB = originalBodyMB
		common.ModelRequestSmallFailoverTimeoutSeconds = originalTimeout
	})

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	started := time.Now()
	info := &relaycommon.RelayInfo{StartTime: started, FirstResponseTime: started.Add(-time.Second)}
	transportErr := types.NewError(errors.New("dial tcp: connection refused"), types.ErrorCodeDoRequestFailed)
	statusErr := types.NewErrorWithStatusCode(errors.New("bad gateway"), types.ErrorCodeBadResponseStatusCode, http.StatusBadGateway)

	largePolicy := newRelayFailoverPolicy()
	largePolicy.setBodySize((1 << 20) + 1)
	require.False(t, largePolicy.allowRetry(c, info, transportErr, 1))

	statusPolicy := newRelayFailoverPolicy()
	statusPolicy.setBodySize(1024)
	require.False(t, statusPolicy.allowRetry(c, info, statusErr, 1))
}
