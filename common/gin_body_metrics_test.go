package common

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestGetRequestBodyRecordsReadMetrics(t *testing.T) {
	gin.SetMode(gin.TestMode)
	body := "request body metrics"
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", strings.NewReader(body))

	storage, err := GetBodyStorage(c)
	require.NoError(t, err)
	t.Cleanup(func() {
		require.NoError(t, storage.Close())
	})

	metrics, ok := GetRequestBodyMetrics(c)
	require.True(t, ok)
	require.EqualValues(t, len(body), metrics.Bytes)
	require.GreaterOrEqual(t, metrics.ReadTime.Nanoseconds(), int64(0))
	require.False(t, metrics.Disk)
}
