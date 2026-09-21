package service

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupAlipayDirectTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	originalDB := model.DB
	originalLogDB := model.LOG_DB
	originalSQLite := common.UsingSQLite
	originalMySQL := common.UsingMySQL
	originalPostgreSQL := common.UsingPostgreSQL
	db := setupWaffoPancakeTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.Log{}, &model.Option{}, &model.PaymentRefundReview{}, &model.UserSubscription{}))
	t.Cleanup(func() {
		model.DB = originalDB
		model.LOG_DB = originalLogDB
		common.UsingSQLite = originalSQLite
		common.UsingMySQL = originalMySQL
		common.UsingPostgreSQL = originalPostgreSQL
	})
	return db
}

func alipayTestKeys(t *testing.T) (string, string) {
	t.Helper()
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	privateDER, err := x509.MarshalPKCS8PrivateKey(privateKey)
	require.NoError(t, err)
	publicDER, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	require.NoError(t, err)
	return string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: privateDER})),
		string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: publicDER}))
}

func configureAlipayTest(t *testing.T) string {
	t.Helper()
	privateKey, publicKey := alipayTestKeys(t)
	originalConfig := setting.GetAlipayDirectConfig()
	t.Cleanup(func() {
		setting.StoreAlipayDirectConfig(originalConfig)
	})
	setting.StoreAlipayDirectConfig(setting.AlipayDirectConfig{
		Enabled:           originalConfig.Enabled,
		AppID:             "2026000000000001",
		SellerID:          "2088000000000001",
		PrivateKey:        privateKey,
		PlatformPublicKey: publicKey,
		Sandbox:           originalConfig.Sandbox,
		NotifyURL:         "https://pay.example.com/api/alipay/notify",
		ReturnURL:         "https://pay.example.com/api/alipay/return",
		MinTopUp:          1,
	})
	return privateKey
}

func handleAlipayTestNotification(params map[string]string, callerIP string) error {
	return HandleAlipayDirectNotification(context.Background(), params, callerIP)
}

func signedAlipayNotification(t *testing.T, privateKey string, values map[string]string) map[string]string {
	t.Helper()
	values["sign_type"] = "RSA2"
	signature, err := signAlipayContent(canonicalAlipayNotificationParams(values), privateKey)
	require.NoError(t, err)
	values["sign"] = signature
	return values
}

func TestAlipayRequestSignatureFixedVectorIncludesSignType(t *testing.T) {
	const privateKey = `-----BEGIN PRIVATE KEY-----
MIICdgIBADANBgkqhkiG9w0BAQEFAASCAmAwggJcAgEAAoGBAMIbFcBQbW5Z3H0z
CRIt3aUtaBah9NzwE9tTP5Lflmibei3iu/S5z8q4xQODRDJWYJ7N477KmLDDYId4
lfaVtHJ7ekvoeNtU5ynl1600nV9mRf/PTWFmSsyA4F0NZyy/CpD06Qe416zIguBl
ClLwB6hK0tvy2++oeY5H3vL9LFlFAgMBAAECgYEAqS0yKAvxVNy9b+GrZkzTgcOx
lQhTgr08kUxdfIWjckkQlC2p5AKPOQERtZ4TMkxWqhKJDSFHM8kVuP1At0qDmj8J
3+J/P/1lY8xvXEC7oReXGG2aV+uxhrJbfMA3UBa5pGwa6IG6ZgakaIQQZE5PyQNN
mWmqw6XWBZ2L3MWsZYECQQDsNoaWhwgFMTLcwv8LbYR2BQXepUZOitC42eULQUCp
iQDbHt14mEoWk3ZQDPTqn0jplwAYgGeDvou+lbCTw+17AkEA0l2XOkjeXpoi/BZc
xWei62mik+zHKqOBJGBS4e7G4EEws9KtfjDdmV00QzOvWDaAkS1ja+hO2HX5joOn
32Y4PwJAcYqsGwMBOe2yMyeQDOAxwcEcVy8+olZbid9DF6vf9x4hyTIG5wbc5gkv
3766o2S5WX75zs059LvM1GmDnSOarQJAQRcAUeJ2G6Npq8JnlhUJDfozeb3Lql/I
965uNsYg9wZ0wU8wq1kHWArEvv5hBNRoV4NJvfu1Wbi3LOeDq9X/FQJAM10tl/cB
WRUhGtXDLQ85J6NSMwrJtU2pKwsnBueqY27WAJE7T+McgHsTCOjDTMKA8S1uDAiI
6HZmAtcJVbsrCg==
-----END PRIVATE KEY-----`
	params := map[string]string{
		"app_id":      "2026000000000001",
		"biz_content": `{"out_trade_no":"ALI-VECTOR-1","total_amount":"7.30"}`,
		"charset":     "utf-8",
		"format":      "JSON",
		"method":      "alipay.trade.query",
		"sign_type":   "RSA2",
		"timestamp":   "2026-07-12 19:00:00",
		"version":     "1.0",
	}
	const expectedCanonical = `app_id=2026000000000001&biz_content={"out_trade_no":"ALI-VECTOR-1","total_amount":"7.30"}&charset=utf-8&format=JSON&method=alipay.trade.query&sign_type=RSA2&timestamp=2026-07-12 19:00:00&version=1.0`
	const expectedSignature = "GTQqpu1ONvjnyh6isGerj5g1uM3LESO7Ug4/DjhrOsX7E3y572Ep7JC9wCFUoVv87wAbbbxGxRRGxH+qSOcNASuvuoQB07ngJosg9tzR7o3epTMKLhXBE5gjJ7gVITMIuYeGsIlqIPbr26/47BUgZGodMPd75zfbVxvYCFq6XBE="

	require.Equal(t, expectedCanonical, canonicalAlipayRequestParams(params))
	require.NotContains(t, canonicalAlipayNotificationParams(params), "sign_type=RSA2")
	signature, err := SignAlipayDirectParams(params, privateKey)
	require.NoError(t, err)
	require.Equal(t, expectedSignature, signature)
}

func TestAlipayRSA2SignAndVerify(t *testing.T) {
	privateKey := configureAlipayTest(t)
	params := signedAlipayNotification(t, privateKey, map[string]string{
		"app_id":       setting.GetAlipayDirectConfig().AppID,
		"out_trade_no": "ALI-test-sign",
		"total_amount": "10.00",
	})
	require.NoError(t, VerifyAlipayDirectParams(params))

	params["total_amount"] = "11.00"
	require.Error(t, VerifyAlipayDirectParams(params))
}

func TestCreateAlipayPagePayURLDoesNotSendSellerIDInBizContent(t *testing.T) {
	configureAlipayTest(t)
	config := setting.GetAlipayDirectConfig()
	paymentURL, err := createAlipayPagePayURL(
		config,
		"ALI-page-pay-no-seller",
		decimal.RequireFromString("7.30"),
		"API wallet top-up",
		config.NotifyURL,
		config.ReturnURL,
	)
	require.NoError(t, err)
	parsed, err := url.Parse(paymentURL)
	require.NoError(t, err)
	var bizContent map[string]any
	require.NoError(t, common.UnmarshalJsonStr(parsed.Query().Get("biz_content"), &bizContent))
	require.NotContains(t, bizContent, "seller_id")
}

func TestNormalizeAlipayMoneyEnforcesMaximum(t *testing.T) {
	amount, err := normalizeAlipayMoney(100000000)
	require.NoError(t, err)
	require.Equal(t, "100000000.00", amount.StringFixed(2))
	_, err = normalizeAlipayMoney(100000000.01)
	require.Error(t, err)
}

func TestHandleAlipayDirectNotificationIsIdempotent(t *testing.T) {
	db := setupAlipayDirectTestDB(t)
	privateKey := configureAlipayTest(t)
	user := &model.User{Username: "alipay-user", Quota: 100}
	require.NoError(t, db.Create(user).Error)
	topUp := &model.TopUp{
		UserId:          user.Id,
		Amount:          500,
		DisplayAmount:   1,
		Money:           7.30,
		TradeNo:         "ALI-idempotent",
		Currency:        "CNY",
		PaymentMethod:   model.PaymentMethodAlipay,
		PaymentProvider: model.PaymentProviderAlipayDirect,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	require.NoError(t, db.Create(topUp).Error)
	params := signedAlipayNotification(t, privateKey, map[string]string{
		"app_id":       setting.GetAlipayDirectConfig().AppID,
		"auth_app_id":  setting.GetAlipayDirectConfig().AppID,
		"seller_id":    setting.GetAlipayDirectConfig().SellerID,
		"out_trade_no": topUp.TradeNo,
		"trade_no":     "2026071222000000000001",
		"trade_status": "TRADE_SUCCESS",
		"total_amount": "7.30",
	})

	require.NoError(t, handleAlipayTestNotification(params, "127.0.0.1"))
	require.NoError(t, handleAlipayTestNotification(params, "127.0.0.1"))

	var updatedUser model.User
	require.NoError(t, db.First(&updatedUser, user.Id).Error)
	require.Equal(t, 600, updatedUser.Quota)
	var updatedTopUp model.TopUp
	require.NoError(t, db.First(&updatedTopUp, topUp.Id).Error)
	require.Equal(t, common.TopUpStatusSuccess, updatedTopUp.Status)
	require.Equal(t, "2026071222000000000001", updatedTopUp.ProviderTradeNo)
}

func TestHandleAlipayDirectNotificationRejectsAmountMismatch(t *testing.T) {
	db := setupAlipayDirectTestDB(t)
	privateKey := configureAlipayTest(t)
	user := &model.User{Username: "alipay-amount-user", Quota: 100}
	require.NoError(t, db.Create(user).Error)
	topUp := &model.TopUp{
		UserId:          user.Id,
		Amount:          500,
		DisplayAmount:   1,
		Money:           7.30,
		TradeNo:         "ALI-amount-mismatch",
		Currency:        "CNY",
		PaymentMethod:   model.PaymentMethodAlipay,
		PaymentProvider: model.PaymentProviderAlipayDirect,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	require.NoError(t, db.Create(topUp).Error)
	params := signedAlipayNotification(t, privateKey, map[string]string{
		"app_id":       setting.GetAlipayDirectConfig().AppID,
		"seller_id":    setting.GetAlipayDirectConfig().SellerID,
		"out_trade_no": topUp.TradeNo,
		"trade_no":     "2026071222000000000002",
		"trade_status": "TRADE_SUCCESS",
		"total_amount": "7.31",
	})

	require.Error(t, handleAlipayTestNotification(params, "127.0.0.1"))
	var updatedUser model.User
	require.NoError(t, db.First(&updatedUser, user.Id).Error)
	require.Equal(t, 100, updatedUser.Quota)
	var updatedTopUp model.TopUp
	require.NoError(t, db.First(&updatedTopUp, topUp.Id).Error)
	require.Equal(t, common.TopUpStatusPending, updatedTopUp.Status)
}

func TestHandleAlipayDirectNotificationWithoutSellerRequiresQuery(t *testing.T) {
	db := setupAlipayDirectTestDB(t)
	privateKey := configureAlipayTest(t)
	user := &model.User{Username: "alipay-query-user", Quota: 100}
	require.NoError(t, db.Create(user).Error)
	topUp := &model.TopUp{
		UserId: user.Id, Amount: 500, DisplayAmount: 1, Money: 7.30,
		TradeNo: "ALI-missing-seller", Currency: "CNY",
		PaymentMethod: model.PaymentMethodAlipay, PaymentProvider: model.PaymentProviderAlipayDirect,
		CreateTime: time.Now().Unix(), Status: common.TopUpStatusPending,
	}
	require.NoError(t, db.Create(topUp).Error)
	params := signedAlipayNotification(t, privateKey, map[string]string{
		"app_id": setting.GetAlipayDirectConfig().AppID, "out_trade_no": topUp.TradeNo,
		"trade_no": "2026071222000000000003", "trade_status": "TRADE_SUCCESS", "total_amount": "7.30",
	})

	queryCtx, cancel := context.WithCancel(context.Background())
	cancel()
	err := HandleAlipayDirectNotification(queryCtx, params, "")
	require.Error(t, err)
	var current model.TopUp
	require.NoError(t, db.First(&current, topUp.Id).Error)
	require.Equal(t, common.TopUpStatusPending, current.Status)
	var currentUser model.User
	require.NoError(t, db.First(&currentUser, user.Id).Error)
	require.Equal(t, 100, currentUser.Quota)
}

func TestHandleAlipayRefundEvidenceWithoutSellerDoesNotAckFailedQuery(t *testing.T) {
	db := setupAlipayDirectTestDB(t)
	privateKey := configureAlipayTest(t)
	user := &model.User{Username: "alipay-refund-query-user", Quota: 600}
	require.NoError(t, db.Create(user).Error)
	topUp := &model.TopUp{
		UserId: user.Id, Amount: 500, DisplayAmount: 1, Money: 7.30,
		TradeNo: "ALI-refund-missing-seller", ProviderTradeNo: "provider-refund-query", Currency: "CNY",
		PaymentMethod: model.PaymentMethodAlipay, PaymentProvider: model.PaymentProviderAlipayDirect,
		CreateTime: time.Now().Unix(), CompleteTime: time.Now().Unix(), Status: common.TopUpStatusSuccess,
	}
	require.NoError(t, db.Create(topUp).Error)
	params := signedAlipayNotification(t, privateKey, map[string]string{
		"app_id": setting.GetAlipayDirectConfig().AppID, "out_trade_no": topUp.TradeNo,
		"trade_no": topUp.ProviderTradeNo, "trade_status": "TRADE_SUCCESS",
		"total_amount": "7.30", "refund_fee": "1.00",
	})

	queryCtx, cancel := context.WithCancel(context.Background())
	cancel()
	require.Error(t, HandleAlipayDirectNotification(queryCtx, params, ""))
	var reviewCount int64
	require.NoError(t, db.Model(&model.PaymentRefundReview{}).Where("local_trade_no = ?", topUp.TradeNo).Count(&reviewCount).Error)
	require.Zero(t, reviewCount)
}

func TestHandleAlipayTradeClosedAfterSuccessCreatesRefundReview(t *testing.T) {
	db := setupAlipayDirectTestDB(t)
	privateKey := configureAlipayTest(t)
	user := &model.User{Username: "alipay-refund-user", Quota: 600}
	require.NoError(t, db.Create(user).Error)
	topUp := &model.TopUp{
		UserId: user.Id, Amount: 500, DisplayAmount: 1, Money: 7.30,
		TradeNo: "ALI-paid-then-closed", ProviderTradeNo: "2026071222000000000004", Currency: "CNY",
		PaymentMethod: model.PaymentMethodAlipay, PaymentProvider: model.PaymentProviderAlipayDirect,
		CreateTime: time.Now().Unix(), CompleteTime: time.Now().Unix(), Status: common.TopUpStatusSuccess,
	}
	require.NoError(t, db.Create(topUp).Error)
	params := signedAlipayNotification(t, privateKey, map[string]string{
		"app_id": setting.GetAlipayDirectConfig().AppID, "seller_id": setting.GetAlipayDirectConfig().SellerID,
		"out_trade_no": topUp.TradeNo, "trade_no": topUp.ProviderTradeNo,
		"trade_status": "TRADE_CLOSED", "total_amount": "7.30",
	})

	err := handleAlipayTestNotification(params, "")
	require.NoError(t, err)
	require.NoError(t, handleAlipayTestNotification(params, ""))
	var current model.TopUp
	require.NoError(t, db.First(&current, topUp.Id).Error)
	require.Equal(t, common.TopUpStatusSuccess, current.Status)
	var currentUser model.User
	require.NoError(t, db.First(&currentUser, user.Id).Error)
	require.Equal(t, 600, currentUser.Quota)
	var review model.PaymentRefundReview
	require.NoError(t, db.Where("payment_provider = ? AND local_trade_no = ?", model.PaymentProviderAlipayDirect, topUp.TradeNo).First(&review).Error)
	require.Equal(t, model.PaymentRefundReviewStatusPending, review.Status)
	require.Equal(t, topUp.ProviderTradeNo, review.ProviderTradeNo)
	require.Equal(t, int64(2), review.NotificationCount)
}

func TestHandleAlipayTradeClosedRejectsProviderTradeMismatch(t *testing.T) {
	db := setupAlipayDirectTestDB(t)
	privateKey := configureAlipayTest(t)
	user := &model.User{Username: "alipay-refund-mismatch-user", Quota: 600}
	require.NoError(t, db.Create(user).Error)
	topUp := &model.TopUp{
		UserId: user.Id, Amount: 500, DisplayAmount: 1, Money: 7.30,
		TradeNo: "ALI-paid-closed-mismatch", ProviderTradeNo: "provider-original", Currency: "CNY",
		PaymentMethod: model.PaymentMethodAlipay, PaymentProvider: model.PaymentProviderAlipayDirect,
		CreateTime: time.Now().Unix(), CompleteTime: time.Now().Unix(), Status: common.TopUpStatusSuccess,
	}
	require.NoError(t, db.Create(topUp).Error)
	params := signedAlipayNotification(t, privateKey, map[string]string{
		"app_id": setting.GetAlipayDirectConfig().AppID, "seller_id": setting.GetAlipayDirectConfig().SellerID,
		"out_trade_no": topUp.TradeNo, "trade_no": "provider-different",
		"trade_status": "TRADE_CLOSED", "total_amount": "7.30",
	})

	require.ErrorIs(t, handleAlipayTestNotification(params, ""), model.ErrProviderTradeMismatch)
	var count int64
	require.NoError(t, db.Model(&model.PaymentRefundReview{}).Count(&count).Error)
	require.Zero(t, count)
}

func TestHandleAlipayRefundEvidenceCreatesReviewWithoutReversingLocalBenefits(t *testing.T) {
	db := setupAlipayDirectTestDB(t)
	privateKey := configureAlipayTest(t)
	user := &model.User{Username: "alipay-partial-refund-user", Quota: 600}
	require.NoError(t, db.Create(user).Error)

	testCases := []struct {
		name               string
		tradeNo            string
		providerTradeNo    string
		refundParams       map[string]string
		wantRefundAmount   float64
		wantProviderRefund string
	}{
		{
			name:             "positive refund fee",
			tradeNo:          "ALI-refund-fee-evidence",
			providerTradeNo:  "provider-refund-fee",
			refundParams:     map[string]string{"refund_fee": "2.00"},
			wantRefundAmount: 2,
		},
		{
			name:               "refund business number and timestamp",
			tradeNo:            "ALI-refund-business-evidence",
			providerTradeNo:    "provider-refund-business",
			refundParams:       map[string]string{"out_biz_no": "refund-request-2", "gmt_refund": "2026-07-12 20:00:00"},
			wantProviderRefund: "refund-request-2",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			topUp := &model.TopUp{
				UserId: user.Id, Amount: 500, DisplayAmount: 1, Money: 7.30,
				TradeNo: testCase.tradeNo, ProviderTradeNo: testCase.providerTradeNo, Currency: "CNY",
				PaymentMethod: model.PaymentMethodAlipay, PaymentProvider: model.PaymentProviderAlipayDirect,
				CreateTime: time.Now().Unix(), CompleteTime: time.Now().Unix(), Status: common.TopUpStatusSuccess,
			}
			require.NoError(t, db.Create(topUp).Error)
			params := map[string]string{
				"app_id": setting.GetAlipayDirectConfig().AppID, "seller_id": setting.GetAlipayDirectConfig().SellerID,
				"out_trade_no": topUp.TradeNo, "trade_no": topUp.ProviderTradeNo,
				"trade_status": "TRADE_SUCCESS", "total_amount": "7.30",
			}
			for key, value := range testCase.refundParams {
				params[key] = value
			}

			require.NoError(t, handleAlipayTestNotification(signedAlipayNotification(t, privateKey, params), ""))
			var review model.PaymentRefundReview
			require.NoError(t, db.Where("local_trade_no = ?", topUp.TradeNo).First(&review).Error)
			require.Equal(t, model.PaymentRefundReviewStatusPending, review.Status)
			require.Equal(t, testCase.wantRefundAmount, review.RefundAmount)
			require.Equal(t, testCase.wantProviderRefund, review.ProviderRefundNo)
			var current model.TopUp
			require.NoError(t, db.First(&current, topUp.Id).Error)
			require.Equal(t, common.TopUpStatusSuccess, current.Status)
		})
	}

	mismatch := &model.TopUp{
		UserId: user.Id, Amount: 500, DisplayAmount: 1, Money: 7.30,
		TradeNo: "ALI-refund-provider-mismatch", ProviderTradeNo: "provider-refund-original", Currency: "CNY",
		PaymentMethod: model.PaymentMethodAlipay, PaymentProvider: model.PaymentProviderAlipayDirect,
		CreateTime: time.Now().Unix(), CompleteTime: time.Now().Unix(), Status: common.TopUpStatusSuccess,
	}
	require.NoError(t, db.Create(mismatch).Error)
	mismatchParams := signedAlipayNotification(t, privateKey, map[string]string{
		"app_id": setting.GetAlipayDirectConfig().AppID, "seller_id": setting.GetAlipayDirectConfig().SellerID,
		"out_trade_no": mismatch.TradeNo, "trade_no": "provider-refund-different",
		"trade_status": "TRADE_SUCCESS", "total_amount": "7.30", "refund_fee": "1.00",
	})
	require.ErrorIs(t, handleAlipayTestNotification(mismatchParams, ""), model.ErrProviderTradeMismatch)
	var mismatchReviewCount int64
	require.NoError(t, db.Model(&model.PaymentRefundReview{}).Where("local_trade_no = ?", mismatch.TradeNo).Count(&mismatchReviewCount).Error)
	require.Zero(t, mismatchReviewCount)

	var currentUser model.User
	require.NoError(t, db.First(&currentUser, user.Id).Error)
	require.Equal(t, 600, currentUser.Quota)
}

func TestHandleAlipayTradeClosedPendingOrderExpiresWithoutRefundReview(t *testing.T) {
	db := setupAlipayDirectTestDB(t)
	privateKey := configureAlipayTest(t)
	user := &model.User{Username: "alipay-closed-pending-user", Quota: 100}
	require.NoError(t, db.Create(user).Error)
	topUp := &model.TopUp{
		UserId: user.Id, Amount: 500, DisplayAmount: 1, Money: 7.30,
		TradeNo: "ALI-pending-closed", Currency: "CNY",
		PaymentMethod: model.PaymentMethodAlipay, PaymentProvider: model.PaymentProviderAlipayDirect,
		CreateTime: time.Now().Unix(), Status: common.TopUpStatusPending,
	}
	require.NoError(t, db.Create(topUp).Error)
	params := signedAlipayNotification(t, privateKey, map[string]string{
		"app_id": setting.GetAlipayDirectConfig().AppID, "seller_id": setting.GetAlipayDirectConfig().SellerID,
		"out_trade_no": topUp.TradeNo, "trade_no": "provider-pending-closed",
		"trade_status": "TRADE_CLOSED", "total_amount": "7.30",
	})

	require.NoError(t, handleAlipayTestNotification(params, ""))
	var current model.TopUp
	require.NoError(t, db.First(&current, topUp.Id).Error)
	require.Equal(t, common.TopUpStatusExpired, current.Status)
	var reviewCount int64
	require.NoError(t, db.Model(&model.PaymentRefundReview{}).Count(&reviewCount).Error)
	require.Zero(t, reviewCount)
}

func TestHandleAlipayTradeClosedSuccessfulSubscriptionKeepsSubscriptionActive(t *testing.T) {
	db := setupAlipayDirectTestDB(t)
	privateKey := configureAlipayTest(t)
	user := &model.User{Username: "alipay-sub-refund-user", Quota: 100}
	require.NoError(t, db.Create(user).Error)
	order := &model.SubscriptionOrder{
		UserId: user.Id, PlanId: 77, Money: 19.99, TradeNo: "ALI-sub-paid-closed",
		PaymentMethod: model.PaymentMethodAlipay, PaymentProvider: model.PaymentProviderAlipayDirect,
		Status: common.TopUpStatusSuccess, CreateTime: time.Now().Unix(), CompleteTime: time.Now().Unix(),
		ProviderPayload: `{"trade_no":"provider-sub-paid-closed","trade_status":"TRADE_SUCCESS"}`,
	}
	require.NoError(t, db.Create(order).Error)
	subscription := &model.UserSubscription{
		UserId: user.Id, PlanId: order.PlanId, AmountTotal: 1000,
		StartTime: time.Now().Add(-time.Hour).Unix(), EndTime: time.Now().Add(24 * time.Hour).Unix(),
		Status: "active", Source: "order",
	}
	require.NoError(t, db.Create(subscription).Error)
	params := signedAlipayNotification(t, privateKey, map[string]string{
		"app_id": setting.GetAlipayDirectConfig().AppID, "seller_id": setting.GetAlipayDirectConfig().SellerID,
		"out_trade_no": order.TradeNo, "trade_no": "provider-sub-paid-closed",
		"trade_status": "TRADE_CLOSED", "total_amount": "19.99",
	})

	require.NoError(t, handleAlipayTestNotification(params, ""))
	var currentSubscription model.UserSubscription
	require.NoError(t, db.First(&currentSubscription, subscription.Id).Error)
	require.Equal(t, "active", currentSubscription.Status)
	var review model.PaymentRefundReview
	require.NoError(t, db.Where("local_trade_no = ?", order.TradeNo).First(&review).Error)
	require.Equal(t, alipayOrderKindSub, review.OrderKind)
	require.Equal(t, model.PaymentRefundReviewStatusPending, review.Status)
}

func TestAlipayAvailabilityValidatesCredentialsAndURLs(t *testing.T) {
	configureAlipayTest(t)
	paymentSetting := operation_setting.GetPaymentSetting()
	originalConfirmed := paymentSetting.ComplianceConfirmed
	originalVersion := paymentSetting.ComplianceTermsVersion
	t.Cleanup(func() {
		paymentSetting.ComplianceConfirmed = originalConfirmed
		paymentSetting.ComplianceTermsVersion = originalVersion
	})
	config := setting.GetAlipayDirectConfig()
	config.Enabled = true
	setting.StoreAlipayDirectConfig(config)
	paymentSetting.ComplianceConfirmed = true
	paymentSetting.ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion
	require.True(t, IsAlipayDirectTopUpEnabled())

	config.NotifyURL = "/relative/notify"
	setting.StoreAlipayDirectConfig(config)
	require.False(t, IsAlipayDirectTopUpEnabled())
	config.NotifyURL = "https://pay.example.com/api/alipay/notify"
	config.AppID = "not-an-app-id"
	setting.StoreAlipayDirectConfig(config)
	require.False(t, IsAlipayDirectTopUpEnabled())
}

func TestSaveAlipayDirectConfigIsAtomicAndKeepsBlankKeys(t *testing.T) {
	db := setupAlipayDirectTestDB(t)
	privateKey := configureAlipayTest(t)
	currentConfig := setting.GetAlipayDirectConfig()
	originalPublicKey := currentConfig.PlatformPublicKey
	common.OptionMapRWMutex.Lock()
	originalOptionMap := common.OptionMap
	common.OptionMap = make(map[string]string)
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = originalOptionMap
		common.OptionMapRWMutex.Unlock()
	})
	paymentSetting := operation_setting.GetPaymentSetting()
	originalConfirmed := paymentSetting.ComplianceConfirmed
	originalVersion := paymentSetting.ComplianceTermsVersion
	paymentSetting.ComplianceConfirmed = true
	paymentSetting.ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion
	t.Cleanup(func() {
		paymentSetting.ComplianceConfirmed = originalConfirmed
		paymentSetting.ComplianceTermsVersion = originalVersion
	})

	err := SaveAlipayDirectConfig(AlipayDirectConfig{
		Enabled: true, AppID: currentConfig.AppID, SellerID: currentConfig.SellerID,
		PrivateKey: "", PlatformPublicKey: "", Sandbox: true,
		NotifyURL: currentConfig.NotifyURL, ReturnURL: currentConfig.ReturnURL, MinTopUp: 0.1,
	})
	require.NoError(t, err)
	savedConfig := setting.GetAlipayDirectConfig()
	require.Equal(t, strings.TrimSpace(privateKey), savedConfig.PrivateKey)
	require.Equal(t, strings.TrimSpace(originalPublicKey), savedConfig.PlatformPublicKey)
	require.True(t, savedConfig.Enabled)
	require.True(t, savedConfig.Sandbox)
	require.Equal(t, 0.1, savedConfig.MinTopUp)

	var count int64
	require.NoError(t, db.Model(&model.Option{}).Where("key LIKE ?", "Alipay%").Count(&count).Error)
	require.Equal(t, int64(9), count)

	err = SaveAlipayDirectConfig(AlipayDirectConfig{
		Enabled: true, AppID: "invalid", SellerID: savedConfig.SellerID,
		NotifyURL: savedConfig.NotifyURL, ReturnURL: savedConfig.ReturnURL, MinTopUp: 0.1,
	})
	require.Error(t, err)
	require.Equal(t, "2026000000000001", setting.GetAlipayDirectConfig().AppID)
}

func TestAlipayPollingBatchIncludesOldOrdersAndWrapsFairly(t *testing.T) {
	db := setupAlipayDirectTestDB(t)
	for index, createdAt := range []int64{1, 2, 3} {
		topUp := &model.TopUp{
			UserId: 1, Amount: 1, Money: 1, TradeNo: fmt.Sprintf("ALI-poll-%d", index+1),
			Currency: "CNY", PaymentMethod: model.PaymentMethodAlipay,
			PaymentProvider: model.PaymentProviderAlipayDirect, CreateTime: createdAt,
			Status: common.TopUpStatusPending,
		}
		require.NoError(t, db.Create(topUp).Error)
	}

	first, cursor, err := loadAlipayTopUpPollingBatch(100, 2, alipayPollingCursor{})
	require.NoError(t, err)
	require.Equal(t, []string{"ALI-poll-1", "ALI-poll-2"}, []string{first[0].TradeNo, first[1].TradeNo})
	second, cursor, err := loadAlipayTopUpPollingBatch(100, 2, cursor)
	require.NoError(t, err)
	require.Equal(t, []string{"ALI-poll-3"}, []string{second[0].TradeNo})
	wrapped, _, err := loadAlipayTopUpPollingBatch(100, 2, cursor)
	require.NoError(t, err)
	require.Equal(t, []string{"ALI-poll-1", "ALI-poll-2"}, []string{wrapped[0].TradeNo, wrapped[1].TradeNo})
}
