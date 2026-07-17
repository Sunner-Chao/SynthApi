package relay

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
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
