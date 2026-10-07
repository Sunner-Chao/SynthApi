package model

import (
	"database/sql"
	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestMPaySubscriptionCompletesOnceWithoutWalletCredit(t *testing.T) {
	truncateTables(t)
	user := &User{Username: "wechat-subscription", Quota: 1234, Group: "default"}
	require.NoError(t, DB.Create(user).Error)
	plan := insertSubscriptionPlanForPaymentGuardTest(t, 803)
	order := &SubscriptionOrder{UserId: user.Id, PlanId: plan.Id, Money: 30, TradeNo: "MPSUBUSR-test",
		PaymentMethod: PaymentMethodWechat, PaymentProvider: PaymentProviderMPay, Status: common.TopUpStatusPending}
	require.NoError(t, order.Insert())
	complete := func(payload, amount, provider string) error {
		return CompleteSubscriptionOrderWithAudit(order.TradeNo, payload, provider, PaymentMethodWechat, PaymentAuditInfo{}, amount)
	}
	payload := `{"trade_no":"wechat-provider-test","trade_status":"TRADE_SUCCESS"}`
	require.ErrorIs(t, complete(payload, "29.99", PaymentProviderMPay), ErrPaymentAmountMismatch)
	require.ErrorIs(t, complete(payload, "30.00", PaymentProviderAlipayDirect), ErrPaymentMethodMismatch)
	require.Equal(t, common.TopUpStatusPending, GetSubscriptionOrderByTradeNo(order.TradeNo).Status)
	require.NoError(t, complete(payload, "30.00", PaymentProviderMPay))
	require.NoError(t, complete(payload, "30.00", PaymentProviderMPay))
	require.ErrorIs(t, complete(`{"trade_no":"wrong-provider-trade"}`, "30.00", PaymentProviderMPay), ErrProviderTradeMismatch)
	require.EqualValues(t, 1, countUserSubscriptionsForPaymentGuardTest(t, user.Id))
	require.Equal(t, 1234, getUserQuotaForPaymentGuardTest(t, user.Id))
	audit := GetTopUpByTradeNo(order.TradeNo)
	require.NotNil(t, audit)
	require.Zero(t, audit.Amount)
	require.Equal(t, "CNY", audit.Currency)
	require.Equal(t, "wechat-provider-test", audit.ProviderTradeNo)
	require.Equal(t, common.TopUpStatusSuccess, audit.Status)
	var day sql.NullString
	require.NoError(t, DB.Raw("SELECT promotion_day FROM top_ups WHERE id = ?", audit.Id).Row().Scan(&day))
	require.False(t, day.Valid)
}
