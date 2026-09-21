package controller

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestClientCancellationStopsRetryAndGroupFailover(t *testing.T) {
	t.Parallel()

	requestContext, cancel := context.WithCancel(context.Background())
	cancel()
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil).WithContext(requestContext)

	relayErr := &types.NewAPIError{
		Err:        errors.New("upstream request canceled"),
		StatusCode: http.StatusInternalServerError,
	}
	require.False(t, shouldSmartGroupFailover(c, &relaycommon.RelayInfo{}, "super", relayErr))
}
