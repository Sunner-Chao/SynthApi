package service

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestIsLargeModelRequestUsesConfiguredThreshold(t *testing.T) {
	originalThreshold := common.ModelRequestLargeBodyThresholdMB
	common.ModelRequestLargeBodyThresholdMB = 10
	t.Cleanup(func() { common.ModelRequestLargeBodyThresholdMB = originalThreshold })

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	c.Request.ContentLength = 10 << 20
	require.False(t, IsLargeModelRequest(c))
	c.Request.ContentLength++
	require.True(t, IsLargeModelRequest(c))
}

func TestChannelRequestExclusionsTrackCapacitySeparately(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)

	MarkChannelSelectionExcluded(c, 171)
	require.True(t, IsChannelSelectionExcluded(c, 171))
	require.False(t, HasChannelCapacityExclusions(c))

	MarkChannelCapacityExcluded(c, 652)
	require.True(t, IsChannelSelectionExcluded(c, 652))
	require.True(t, HasChannelCapacityExclusions(c))
}
