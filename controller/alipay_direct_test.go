package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestAlipayDirectNotifyRejectsOversizedFormBody(t *testing.T) {
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	body := "out_trade_no=ALI-oversized&payload=" + strings.Repeat("x", 65<<10)
	context.Request = httptest.NewRequest(http.MethodPost, "/api/alipay/notify", strings.NewReader(body))
	context.Request.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	AlipayDirectNotify(context)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, "fail", recorder.Body.String())
}

func TestUpdateOptionRejectsAlipayDirectKeys(t *testing.T) {
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodPut,
		"/api/option/",
		strings.NewReader(`{"key":"AlipayPrivateKey","value":"replacement"}`),
	)
	context.Request.Header.Set("Content-Type", "application/json")

	UpdateOption(context)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Contains(t, recorder.Body.String(), "专用保存接口")
}

func TestGetOptionsHidesAlipayKeyMaterial(t *testing.T) {
	common.OptionMapRWMutex.Lock()
	originalOptionMap := common.OptionMap
	common.OptionMap = map[string]string{
		"AlipayAppID":             "2026000000000001",
		"AlipayPrivateKey":        "application-private-key-secret",
		"AlipayPlatformPublicKey": "platform-public-key-secret",
	}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = originalOptionMap
		common.OptionMapRWMutex.Unlock()
	})

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/option/", nil)

	GetOptions(context)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Contains(t, recorder.Body.String(), "2026000000000001")
	require.NotContains(t, recorder.Body.String(), "application-private-key-secret")
	require.NotContains(t, recorder.Body.String(), "platform-public-key-secret")
	require.NotContains(t, recorder.Body.String(), "AlipayPrivateKey")
	require.NotContains(t, recorder.Body.String(), "AlipayPlatformPublicKey")
}
