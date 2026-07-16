package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestPublicBusinessPreviewDisabled(t *testing.T) {
	original := setting.IsPublicBusinessPreviewEnabled()
	setting.SetPublicBusinessPreviewEnabled(false)
	t.Cleanup(func() { setting.SetPublicBusinessPreviewEnabled(original) })

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/business-preview", nil)

	GetPublicBusinessPreview(context)

	require.Equal(t, http.StatusNotFound, recorder.Code)
	require.NotContains(t, recorder.Body.String(), "payment_methods")
}

func TestPublicBusinessPreviewReturnsOnlySanitizedBusinessData(t *testing.T) {
	confirmPaymentComplianceForTest(t)
	originalDB := model.DB
	db, err := gorm.Open(sqlite.Open("file:business-preview?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.SubscriptionPlan{}))
	model.DB = db
	t.Cleanup(func() { model.DB = originalDB })

	require.NoError(t, db.Create(&model.SubscriptionPlan{
		Title:                   "Monthly API plan",
		Subtitle:                "For production workloads",
		PriceAmount:             29.9,
		Currency:                "CNY",
		BillingDiscount:         0.8,
		DurationUnit:            model.SubscriptionDurationMonth,
		DurationValue:           1,
		Enabled:                 true,
		SortOrder:               10,
		StripePriceId:           "secret-provider-product",
		CreemProductId:          "secret-creem-product",
		WaffoPancakeProductId:   "secret-waffo-product",
		UpgradeGroup:            "unlimited_month",
		TotalAmount:             0,
		QuotaResetPeriod:        model.SubscriptionResetMonthly,
		MaxPurchasePerUser:      2,
		QuotaResetCustomSeconds: 0,
	}).Error)
	disabledPlan := model.SubscriptionPlan{
		Title:       "Disabled plan",
		PriceAmount: 1,
		Currency:    "CNY",
		Enabled:     false,
	}
	require.NoError(t, db.Create(&disabledPlan).Error)
	require.NoError(t, db.Model(&disabledPlan).Update("enabled", false).Error)

	originalPreview := setting.IsPublicBusinessPreviewEnabled()
	originalMPayEnabled := setting.MPayEnabled
	originalMPayAPIBase := setting.MPayApiBase
	originalMPayPID := setting.MPayPid
	originalMPayKey := setting.MPayKey
	originalMinTopUp := setting.MPayMinTopUp
	setting.SetPublicBusinessPreviewEnabled(true)
	setting.MPayEnabled = true
	setting.MPayApiBase = "https://pay.example.com"
	setting.MPayPid = "merchant"
	setting.MPayKey = "private-secret"
	setting.MPayMinTopUp = 0.1
	t.Cleanup(func() {
		setting.SetPublicBusinessPreviewEnabled(originalPreview)
		setting.MPayEnabled = originalMPayEnabled
		setting.MPayApiBase = originalMPayAPIBase
		setting.MPayPid = originalMPayPID
		setting.MPayKey = originalMPayKey
		setting.MPayMinTopUp = originalMinTopUp
	})

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/business-preview", nil)

	GetPublicBusinessPreview(context)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			PaymentMethods []publicBusinessPaymentMethod    `json:"payment_methods"`
			Plans          []publicBusinessSubscriptionPlan `json:"plans"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	require.Len(t, response.Data.Plans, 1)
	require.Equal(t, "Monthly API plan", response.Data.Plans[0].Title)
	require.True(t, response.Data.Plans[0].Unlimited)
	require.True(t, response.Data.Plans[0].NonRefundable)

	methodTypes := make([]string, 0, len(response.Data.PaymentMethods))
	for _, method := range response.Data.PaymentMethods {
		methodTypes = append(methodTypes, method.Type)
	}
	require.Contains(t, methodTypes, model.PaymentMethodAlipay)
	require.Contains(t, methodTypes, model.PaymentMethodWechat)

	body := recorder.Body.String()
	for _, forbidden := range []string{
		"private-secret",
		"secret-provider-product",
		"secret-creem-product",
		"secret-waffo-product",
		"stripe_price_id",
		"upgrade_group",
		"created_at",
		"updated_at",
		"user_id",
		"payment_provider",
		"mpay",
	} {
		require.False(t, strings.Contains(strings.ToLower(body), strings.ToLower(forbidden)), forbidden)
	}

	var rawResponse map[string]any
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &rawResponse))
	requireExactJSONKeys(t, rawResponse, "success", "message", "data")
	rawData, ok := rawResponse["data"].(map[string]any)
	require.True(t, ok)
	requireExactJSONKeys(t, rawData,
		"payment_methods",
		"amount_options",
		"plans",
		"quota_display_type",
		"currency_symbol",
		"purchase_requires_login",
	)
	rawMethods, ok := rawData["payment_methods"].([]any)
	require.True(t, ok)
	require.NotEmpty(t, rawMethods)
	rawMethod, ok := rawMethods[0].(map[string]any)
	require.True(t, ok)
	requireExactJSONKeys(t, rawMethod, "type", "name", "min_topup", "recommended")
	rawPlans, ok := rawData["plans"].([]any)
	require.True(t, ok)
	require.Len(t, rawPlans, 1)
	rawPlan, ok := rawPlans[0].(map[string]any)
	require.True(t, ok)
	requireExactJSONKeys(t, rawPlan,
		"id",
		"title",
		"subtitle",
		"price_amount",
		"currency",
		"billing_discount",
		"duration_unit",
		"duration_value",
		"custom_seconds",
		"total_amount",
		"quota_reset_period",
		"quota_reset_custom_seconds",
		"max_purchase_per_user",
		"unlimited",
		"non_refundable",
	)
}

func TestPublicBusinessPreviewDoesNotExposeDatabaseErrors(t *testing.T) {
	confirmPaymentComplianceForTest(t)
	originalDB := model.DB
	db, err := gorm.Open(sqlite.Open("file:business-preview-error?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	require.NoError(t, sqlDB.Close())
	model.DB = db
	t.Cleanup(func() { model.DB = originalDB })

	originalPreview := setting.IsPublicBusinessPreviewEnabled()
	setting.SetPublicBusinessPreviewEnabled(true)
	t.Cleanup(func() { setting.SetPublicBusinessPreviewEnabled(originalPreview) })

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/business-preview", nil)

	GetPublicBusinessPreview(context)

	require.Equal(t, http.StatusInternalServerError, recorder.Code)
	require.JSONEq(t, `{
		"success": false,
		"message": "public business preview is temporarily unavailable"
	}`, recorder.Body.String())
	require.NotContains(t, strings.ToLower(recorder.Body.String()), "database")
}

func TestGetTopUpInfoIncludesMPayAlipayAndWechat(t *testing.T) {
	confirmPaymentComplianceForTest(t)
	originalMPayEnabled := setting.MPayEnabled
	originalMPayAPIBase := setting.MPayApiBase
	originalMPayPID := setting.MPayPid
	originalMPayKey := setting.MPayKey
	originalAlipayConfig := setting.GetAlipayDirectConfig()
	setting.MPayEnabled = true
	setting.MPayApiBase = "https://pay.example.com"
	setting.MPayPid = "merchant"
	setting.MPayKey = "secret"
	setting.StoreAlipayDirectConfig(setting.AlipayDirectConfig{})
	t.Cleanup(func() {
		setting.MPayEnabled = originalMPayEnabled
		setting.MPayApiBase = originalMPayAPIBase
		setting.MPayPid = originalMPayPID
		setting.MPayKey = originalMPayKey
		setting.StoreAlipayDirectConfig(originalAlipayConfig)
	})

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/user/topup/info", nil)
	GetTopUpInfo(context)

	var response struct {
		Data struct {
			PayMethods []map[string]string `json:"pay_methods"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	found := map[string]bool{}
	for _, method := range response.Data.PayMethods {
		if method["provider"] == model.PaymentProviderMPay {
			found[method["type"]] = true
		}
	}
	require.True(t, found[model.PaymentMethodAlipay])
	require.True(t, found[model.PaymentMethodWechat])
}

func requireExactJSONKeys(t *testing.T, value map[string]any, expected ...string) {
	t.Helper()
	actual := make([]string, 0, len(value))
	for key := range value {
		actual = append(actual, key)
	}
	require.ElementsMatch(t, expected, actual)
}
