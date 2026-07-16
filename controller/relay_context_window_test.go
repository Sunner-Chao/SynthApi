package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestContextWindowErrorStopsRetryFailoverAndCooldown(t *testing.T) {
	originalRetryTimes := common.RetryTimes
	common.RetryTimes = 1
	t.Cleanup(func() { common.RetryTimes = originalRetryTimes })

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/messages", nil)
	common.SetContextKey(c, constant.ContextKeyTokenCrossGroupRetry, true)
	relayErr := types.WithOpenAIError(types.OpenAIError{
		Message: "Your input exceeds the context window of this model. Please adjust your input and try again.",
		Code:    "unknown_error",
	}, http.StatusBadGateway)

	require.False(t, shouldRetry(c, relayErr, 3))
	require.False(t, shouldSmartGroupFailover(c, &relaycommon.RelayInfo{}, "primary", relayErr))
	cooldown, class := channelCooldownDecision(relayErr)
	require.Zero(t, cooldown)
	require.Empty(t, class)
}
