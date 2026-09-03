package relay

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestShouldUseRawResponsesBodyRebuildsMutatedRequest(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(nil)
	require.True(t, shouldUseRawResponsesBody(c, true))
	require.False(t, shouldUseRawResponsesBody(c, false))

	common.SetContextKey(c, constant.ContextKeyLongContextOptimization, &service.LongContextOptimizationAudit{
		RequestMutated: true,
	})
	require.False(t, shouldUseRawResponsesBody(c, true))
}

func TestValidateResponsesContinuationRequiresStorage(t *testing.T) {
	t.Parallel()

	request := &dto.OpenAIResponsesRequest{PreviousResponseID: "resp_123", Store: []byte("false")}
	require.ErrorContains(t, validateResponsesContinuation(request, nil), "previous_response_id requires response storage")

	request.Store = []byte("true")
	require.NoError(t, validateResponsesContinuation(request, nil))

	request.Store = nil
	require.NoError(t, validateResponsesContinuation(request, nil))

	info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{}}
	info.ChannelOtherSettings.DisableStore = true
	require.ErrorContains(t, validateResponsesContinuation(request, info), "previous_response_id requires response storage")
}
