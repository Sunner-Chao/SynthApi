package model

import (
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func insertUserForPaymentGuardTest(t *testing.T, id int, quota int) {
	t.Helper()
	user := &User{
		Id:       id,
		Username: "payment_guard_user",
		Status:   common.UserStatusEnabled,
		Quota:    quota,
	}
	require.NoError(t, DB.Create(user).Error)
}

func insertSubscriptionPlanForPaymentGuardTest(t *testing.T, id int) *SubscriptionPlan {
	t.Helper()
	plan := &SubscriptionPlan{
		Id:            id,
		Title:         "Guard Plan",
		PriceAmount:   9.99,
		Currency:      "USD",
		DurationUnit:  SubscriptionDurationMonth,
		DurationValue: 1,
		Enabled:       true,
		TotalAmount:   1000,
	}
	require.NoError(t, DB.Create(plan).Error)
	return plan
}

func insertSubscriptionOrderForPaymentGuardTest(t *testing.T, tradeNo string, userID int, planID int, paymentProvider string) {
	t.Helper()
	order := &SubscriptionOrder{
		UserId:          userID,
		PlanId:          planID,
		Money:           9.99,
		TradeNo:         tradeNo,
		PaymentMethod:   paymentProvider,
		PaymentProvider: paymentProvider,
		Status:          common.TopUpStatusPending,
		CreateTime:      time.Now().Unix(),
	}
	require.NoError(t, order.Insert())
}

func insertTopUpForPaymentGuardTest(t *testing.T, tradeNo string, userID int, paymentProvider string) {
	t.Helper()
	topUp := &TopUp{
		UserId:          userID,
		Amount:          2,
		Money:           9.99,
		TradeNo:         tradeNo,
		PaymentMethod:   paymentProvider,
		PaymentProvider: paymentProvider,
		Status:          common.TopUpStatusPending,
		CreateTime:      time.Now().Unix(),
	}
	require.NoError(t, topUp.Insert())
}

func getTopUpStatusForPaymentGuardTest(t *testing.T, tradeNo string) string {
	t.Helper()
	topUp := GetTopUpByTradeNo(tradeNo)
	require.NotNil(t, topUp)
	return topUp.Status
}

func countUserSubscriptionsForPaymentGuardTest(t *testing.T, userID int) int64 {
	t.Helper()
	var count int64
	require.NoError(t, DB.Model(&UserSubscription{}).Where("user_id = ?", userID).Count(&count).Error)
	return count
}

func getUserQuotaForPaymentGuardTest(t *testing.T, userID int) int {
	t.Helper()
	var user User
	require.NoError(t, DB.Select("quota").Where("id = ?", userID).First(&user).Error)
	return user.Quota
}

func TestRechargeWaffoPancake_RejectsMismatchedPaymentMethod(t *testing.T) {
	truncateTables(t)

	insertUserForPaymentGuardTest(t, 101, 0)
	insertTopUpForPaymentGuardTest(t, "waffo-pancake-guard", 101, PaymentProviderStripe)

	err := RechargeWaffoPancake("waffo-pancake-guard")
	require.Error(t, err)

	topUp := GetTopUpByTradeNo("waffo-pancake-guard")
	require.NotNil(t, topUp)
	assert.Equal(t, common.TopUpStatusPending, topUp.Status)
	assert.Equal(t, 0, getUserQuotaForPaymentGuardTest(t, 101))
}

func TestUpdatePendingTopUpStatus_RejectsMismatchedPaymentProvider(t *testing.T) {
	testCases := []struct {
		name                    string
		tradeNo                 string
		storedPaymentProvider   string
		expectedPaymentProvider string
		targetStatus            string
	}{
		{
			name:                    "stripe expire",
			tradeNo:                 "stripe-expire-guard",
			storedPaymentProvider:   PaymentProviderCreem,
			expectedPaymentProvider: PaymentProviderStripe,
			targetStatus:            common.TopUpStatusExpired,
		},
		{
			name:                    "waffo failed",
			tradeNo:                 "waffo-failed-guard",
			storedPaymentProvider:   PaymentProviderStripe,
			expectedPaymentProvider: PaymentProviderWaffo,
			targetStatus:            common.TopUpStatusFailed,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			truncateTables(t)
			insertUserForPaymentGuardTest(t, 150, 0)
			insertTopUpForPaymentGuardTest(t, tc.tradeNo, 150, tc.storedPaymentProvider)

			err := UpdatePendingTopUpStatus(tc.tradeNo, tc.expectedPaymentProvider, tc.targetStatus)
			require.ErrorIs(t, err, ErrPaymentMethodMismatch)
			assert.Equal(t, common.TopUpStatusPending, getTopUpStatusForPaymentGuardTest(t, tc.tradeNo))
		})
	}
}

func TestCompleteSubscriptionOrder_RejectsMismatchedPaymentProvider(t *testing.T) {
	truncateTables(t)

	insertUserForPaymentGuardTest(t, 202, 0)
	plan := insertSubscriptionPlanForPaymentGuardTest(t, 301)
	insertSubscriptionOrderForPaymentGuardTest(t, "sub-guard-order", 202, plan.Id, PaymentProviderStripe)

	err := CompleteSubscriptionOrder("sub-guard-order", `{"provider":"epay"}`, PaymentProviderEpay, "alipay")
	require.ErrorIs(t, err, ErrPaymentMethodMismatch)

	order := GetSubscriptionOrderByTradeNo("sub-guard-order")
	require.NotNil(t, order)
	assert.Equal(t, common.TopUpStatusPending, order.Status)
	assert.Zero(t, countUserSubscriptionsForPaymentGuardTest(t, 202))

	topUp := GetTopUpByTradeNo("sub-guard-order")
	assert.Nil(t, topUp)
}

func TestExpireSubscriptionOrder_RejectsMismatchedPaymentProvider(t *testing.T) {
	truncateTables(t)

	insertUserForPaymentGuardTest(t, 303, 0)
	plan := insertSubscriptionPlanForPaymentGuardTest(t, 401)
	insertSubscriptionOrderForPaymentGuardTest(t, "sub-expire-guard", 303, plan.Id, PaymentProviderStripe)

	err := ExpireSubscriptionOrder("sub-expire-guard", PaymentProviderCreem)
	require.ErrorIs(t, err, ErrPaymentMethodMismatch)

	order := GetSubscriptionOrderByTradeNo("sub-expire-guard")
	require.NotNil(t, order)
	assert.Equal(t, common.TopUpStatusPending, order.Status)
}

func TestCompleteSubscriptionOrder_AlipayDirectIsIdempotent(t *testing.T) {
	truncateTables(t)

	insertUserForPaymentGuardTest(t, 404, 0)
	plan := insertSubscriptionPlanForPaymentGuardTest(t, 501)
	insertSubscriptionOrderForPaymentGuardTest(t, "alipay-sub-idempotent", 404, plan.Id, PaymentProviderAlipayDirect)

	require.NoError(t, CompleteAlipayDirectSubscriptionOrder("alipay-sub-idempotent", `{"trade_no":"provider-1"}`, "9.99"))
	require.NoError(t, CompleteAlipayDirectSubscriptionOrder("alipay-sub-idempotent", `{"trade_no":"provider-1"}`, "9.99"))
	require.ErrorIs(t,
		CompleteAlipayDirectSubscriptionOrder("alipay-sub-idempotent", `{"trade_no":"provider-conflict"}`, "9.99"),
		ErrProviderTradeMismatch,
	)
	require.Equal(t, int64(1), countUserSubscriptionsForPaymentGuardTest(t, 404))

	order := GetSubscriptionOrderByTradeNo("alipay-sub-idempotent")
	require.NotNil(t, order)
	require.Equal(t, common.TopUpStatusSuccess, order.Status)
	topUp := GetTopUpByTradeNo("alipay-sub-idempotent")
	require.NotNil(t, topUp)
	require.Equal(t, PaymentProviderAlipayDirect, topUp.PaymentProvider)
}

func TestCompleteAlipayDirectSubscriptionConcurrentTradeNumbersAcceptsOne(t *testing.T) {
	truncateTables(t)

	insertUserForPaymentGuardTest(t, 405, 0)
	plan := insertSubscriptionPlanForPaymentGuardTest(t, 502)
	insertSubscriptionOrderForPaymentGuardTest(t, "alipay-sub-concurrent", 405, plan.Id, PaymentProviderAlipayDirect)

	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for _, providerTradeNo := range []string{"provider-concurrent-a", "provider-concurrent-b"} {
		wg.Add(1)
		go func(providerTradeNo string) {
			defer wg.Done()
			<-start
			payload := fmt.Sprintf(`{"trade_no":%q}`, providerTradeNo)
			errs <- CompleteAlipayDirectSubscriptionOrder("alipay-sub-concurrent", payload, "9.99")
		}(providerTradeNo)
	}
	close(start)
	wg.Wait()
	close(errs)

	var successCount int
	var mismatchCount int
	for err := range errs {
		switch {
		case err == nil:
			successCount++
		case errors.Is(err, ErrProviderTradeMismatch):
			mismatchCount++
		default:
			require.NoError(t, err)
		}
	}
	require.Equal(t, 1, successCount)
	require.Equal(t, 1, mismatchCount)
	require.Equal(t, int64(1), countUserSubscriptionsForPaymentGuardTest(t, 405))

	order := GetSubscriptionOrderByTradeNo("alipay-sub-concurrent")
	require.NotNil(t, order)
	require.Equal(t, common.TopUpStatusSuccess, order.Status)
	storedProviderTradeNo, err := subscriptionProviderTradeNo(PaymentProviderAlipayDirect, order.ProviderPayload)
	require.NoError(t, err)
	require.Contains(t, []string{"provider-concurrent-a", "provider-concurrent-b"}, storedProviderTradeNo)
}

func TestCompleteAlipayDirectTopUpConcurrentNotificationsCreditOnce(t *testing.T) {
	truncateTables(t)
	insertUserForPaymentGuardTest(t, 505, 100)
	topUp := &TopUp{
		UserId:          505,
		Amount:          500,
		DisplayAmount:   1,
		Money:           7.30,
		TradeNo:         "alipay-concurrent-topup",
		Currency:        "CNY",
		PaymentMethod:   PaymentMethodAlipay,
		PaymentProvider: PaymentProviderAlipayDirect,
		Status:          common.TopUpStatusPending,
		CreateTime:      time.Now().Unix(),
	}
	require.NoError(t, topUp.Insert())

	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			errs <- CompleteAlipayDirectTopUp(topUp.TradeNo, "provider-concurrent-1", "7.30", "127.0.0.1")
		}()
	}
	close(start)
	wg.Wait()
	close(errs)
	for err := range errs {
		require.NoError(t, err)
	}

	require.Equal(t, 600, getUserQuotaForPaymentGuardTest(t, 505))
	completed := GetTopUpByTradeNo(topUp.TradeNo)
	require.NotNil(t, completed)
	require.Equal(t, common.TopUpStatusSuccess, completed.Status)
	require.Equal(t, "provider-concurrent-1", completed.ProviderTradeNo)
	require.ErrorIs(t,
		CompleteAlipayDirectTopUp(topUp.TradeNo, "provider-conflict", "7.30", "127.0.0.1"),
		ErrProviderTradeMismatch,
	)
}

func TestExpireAlipayTopUpCASDoesNotOverwriteSuccess(t *testing.T) {
	truncateTables(t)
	insertUserForPaymentGuardTest(t, 606, 600)
	topUp := &TopUp{
		UserId: 606, Amount: 500, DisplayAmount: 1, Money: 7.30,
		TradeNo: "alipay-success-not-expired", ProviderTradeNo: "provider-success-1", Currency: "CNY",
		PaymentMethod: PaymentMethodAlipay, PaymentProvider: PaymentProviderAlipayDirect,
		Status: common.TopUpStatusSuccess, CreateTime: time.Now().Unix(), CompleteTime: time.Now().Unix(),
	}
	require.NoError(t, topUp.Insert())

	err := UpdatePendingTopUpStatus(topUp.TradeNo, PaymentProviderAlipayDirect, common.TopUpStatusExpired)
	require.ErrorIs(t, err, ErrTopUpStatusInvalid)
	current := GetTopUpByTradeNo(topUp.TradeNo)
	require.NotNil(t, current)
	require.Equal(t, common.TopUpStatusSuccess, current.Status)
	require.Equal(t, 600, getUserQuotaForPaymentGuardTest(t, 606))
}

func TestExpireAlipaySubscriptionCASDoesNotOverwriteSuccess(t *testing.T) {
	truncateTables(t)
	insertUserForPaymentGuardTest(t, 707, 0)
	plan := insertSubscriptionPlanForPaymentGuardTest(t, 601)
	insertSubscriptionOrderForPaymentGuardTest(t, "alipay-sub-success-not-expired", 707, plan.Id, PaymentProviderAlipayDirect)
	require.NoError(t, CompleteAlipayDirectSubscriptionOrder("alipay-sub-success-not-expired", `{"trade_no":"provider-sub-1"}`, "9.99"))

	err := ExpireSubscriptionOrder("alipay-sub-success-not-expired", PaymentProviderAlipayDirect)
	require.ErrorIs(t, err, ErrSubscriptionOrderStatusInvalid)
	order := GetSubscriptionOrderByTradeNo("alipay-sub-success-not-expired")
	require.NotNil(t, order)
	require.Equal(t, common.TopUpStatusSuccess, order.Status)
	require.Equal(t, int64(1), countUserSubscriptionsForPaymentGuardTest(t, 707))
}
