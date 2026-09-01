package controller

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

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
	nonBlocking := newRelayAttemptBudget(0)
	require.True(t, nonBlocking.acquire())
	require.Zero(t, nonBlocking.remainingRetries())
	require.True(t, nonBlocking.exhausted())
	require.False(t, nonBlocking.acquire())

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

func TestAutoRouteFailoverRecognizesWrapped429(t *testing.T) {
	err := types.NewErrorWithStatusCode(
		errors.New("exceeded retry limit, last status: 429 Too Many Requests"),
		types.ErrorCodeBadResponseStatusCode,
		http.StatusTooManyRequests,
	)
	require.True(t, shouldAutoRouteFailover(err))
}

func TestAutoRouteFailoverRecognizesUpstreamInsufficientBalance(t *testing.T) {
	err := types.NewErrorWithStatusCode(
		errors.New("unexpected status 403 Forbidden: insufficient balance"),
		types.ErrorCodeBadResponseStatusCode,
		http.StatusForbidden,
	)
	require.True(t, shouldAutoRouteFailover(err))
}

func TestAutoRouteFailoverRecognizesProviderAndStreamDecodeFailures(t *testing.T) {
	for _, message := range []string{
		"unknown provider for model gpt-5.6-sol",
		"The requested model is not supported by any currently configured upstream account.",
		"Encrypted function output content could not be decrypted or decoded",
		"stream disconnected before completion: Transport error: network error: error decoding response body",
	} {
		err := types.NewErrorWithStatusCode(
			errors.New(message),
			types.ErrorCodeBadResponse,
			http.StatusBadRequest,
		)
		require.True(t, shouldAutoRouteFailover(err), message)
	}
}

func TestAutoTaskFailoverRecognizesProviderAndStreamDecodeFailures(t *testing.T) {
	for _, message := range []string{
		"unknown provider for model gpt-5.6-sol",
		"The requested model is not supported by any currently configured upstream account.",
		"Encrypted function output content could not be decrypted or decoded",
		"stream disconnected before completion: Transport error: network error: error decoding response body",
	} {
		require.True(t, shouldAutoTaskFailover(&dto.TaskError{
			Message:    message,
			StatusCode: http.StatusBadRequest,
		}), message)
	}
}

func TestContinueAutoRouteAfterFailureExcludesFailedChannel(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	c.Set("channel_id", 739)
	common.SetContextKey(c, constant.ContextKeyTokenId, 371)

	info := &relaycommon.RelayInfo{
		TokenGroup:      "auto",
		UsingGroup:      "Plus线路一",
		OriginModelName: "gpt-5.6-sol",
	}
	retryParam := &service.RetryParam{
		Ctx:        c,
		TokenGroup: "auto",
		ModelName:  "gpt-5.6-sol",
		Retry:      common.GetPointer(0),
	}
	budget := newRelayAttemptBudget(1)
	require.True(t, budget.acquire())
	require.True(t, continueAutoRouteAfterFailure(c, info, retryParam, &budget, true))
	require.True(t, service.IsChannelSelectionExcluded(c, 739))
}

func TestAutoRouteFailoverKeepsDeterministicErrorsLocal(t *testing.T) {
	err := types.NewErrorWithStatusCode(
		errors.New("invalid request: model is required"),
		types.ErrorCodeInvalidRequest,
		http.StatusBadRequest,
	)
	require.False(t, shouldAutoRouteFailover(err))
}
