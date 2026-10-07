package model

import (
	"database/sql"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

// These SQLite constraints reproduce PostgreSQL's empty DATE rejection.
func TestAlipaySubscriptionAuditNullablePromotionDay(t *testing.T) {
	for _, tc := range []struct {
		name     string
		existing bool
		day      string
	}{
		{name: "new audit"},
		{name: "existing nullable audit", existing: true},
		{name: "preserve existing date", existing: true, day: "2026-10-07"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			truncateTables(t)
			require.NoError(t, DB.Exec(`CREATE TRIGGER subscription_audit_insert_date
BEFORE INSERT ON top_ups WHEN NEW.promotion_day = ''
BEGIN SELECT RAISE(ABORT, 'empty DATE is invalid'); END`).Error)
			require.NoError(t, DB.Exec(`CREATE TRIGGER subscription_audit_update_date
BEFORE UPDATE ON top_ups WHEN NEW.promotion_day = ''
BEGIN SELECT RAISE(ABORT, 'empty DATE is invalid'); END`).Error)
			t.Cleanup(func() {
				DB.Exec("DROP TRIGGER IF EXISTS subscription_audit_insert_date")
				DB.Exec("DROP TRIGGER IF EXISTS subscription_audit_update_date")
			})
			user := &User{Username: "subscription-nullable-day", Quota: 1234, Group: "default"}
			require.NoError(t, DB.Create(user).Error)
			plan := insertSubscriptionPlanForPaymentGuardTest(t, 801)
			order := &SubscriptionOrder{
				UserId: user.Id, PlanId: plan.Id, Money: 30, TradeNo: "alipay-subscription-null-date",
				PaymentMethod: PaymentMethodAlipay, PaymentProvider: PaymentProviderAlipayDirect,
				PaymentProfile: "secondary#subscription-test", Status: common.TopUpStatusPending,
				CreateTime: time.Now().Unix(),
			}
			require.NoError(t, order.Insert())
			if tc.existing {
				audit := &TopUp{
					UserId: user.Id, Money: order.Money, TradeNo: order.TradeNo,
					PaymentMethod: PaymentMethodAlipay, PaymentProvider: PaymentProviderAlipayDirect,
					Status: common.TopUpStatusPending, PromotionDay: tc.day,
				}
				require.NoError(t, audit.Insert())
			}
			payload := `{"trade_no":"provider-subscription-30","trade_status":"TRADE_SUCCESS"}`
			require.NoError(t, CompleteAlipayDirectSubscriptionOrder(order.TradeNo, payload, "30.00", "127.0.0.1"))
			require.NoError(t, CompleteAlipayDirectSubscriptionOrder(order.TradeNo, payload, "30.00", "127.0.0.1"))
			require.ErrorIs(t, CompleteAlipayDirectSubscriptionOrder(order.TradeNo, `{"trade_no":"another-trade"}`, "30.00"), ErrProviderTradeMismatch)
			require.EqualValues(t, 1, countUserSubscriptionsForPaymentGuardTest(t, user.Id))
			require.Equal(t, 1234, getUserQuotaForPaymentGuardTest(t, user.Id))
			require.Equal(t, common.TopUpStatusSuccess, GetSubscriptionOrderByTradeNo(order.TradeNo).Status)
			audit := GetTopUpByTradeNo(order.TradeNo)
			require.NotNil(t, audit)
			require.Equal(t, common.TopUpStatusSuccess, audit.Status)
			require.Equal(t, order.PaymentProfile, audit.PaymentProfile)
			require.Equal(t, "provider-subscription-30", audit.ProviderTradeNo)
			require.Zero(t, audit.Amount)
			var day sql.NullString
			require.NoError(t, DB.Raw("SELECT promotion_day FROM top_ups WHERE id = ?", audit.Id).Row().Scan(&day))
			require.Equal(t, tc.day != "", day.Valid)
			if day.Valid {
				require.Contains(t, day.String, tc.day)
			}
		})
	}
}

func TestAlipaySubscriptionAuditFailureRollsBackCompletion(t *testing.T) {
	truncateTables(t)
	user := &User{Username: "subscription-audit-rollback", Quota: 456, Group: "default"}
	require.NoError(t, DB.Create(user).Error)
	plan := insertSubscriptionPlanForPaymentGuardTest(t, 802)
	order := &SubscriptionOrder{
		UserId: user.Id, PlanId: plan.Id, Money: 30, TradeNo: "subscription-rollback",
		PaymentMethod: PaymentMethodAlipay, PaymentProvider: PaymentProviderAlipayDirect,
		PaymentProfile: "legacy#rollback", Status: common.TopUpStatusPending,
	}
	require.NoError(t, order.Insert())
	require.NoError(t, DB.Exec(`CREATE TRIGGER subscription_audit_failure BEFORE INSERT ON top_ups
BEGIN SELECT RAISE(ABORT, 'audit write failed'); END`).Error)
	t.Cleanup(func() { DB.Exec("DROP TRIGGER IF EXISTS subscription_audit_failure") })
	require.Error(t, CompleteAlipayDirectSubscriptionOrder(order.TradeNo, `{"trade_no":"provider-rollback"}`, "30.00"))
	require.Equal(t, common.TopUpStatusPending, GetSubscriptionOrderByTradeNo(order.TradeNo).Status)
	require.Zero(t, countUserSubscriptionsForPaymentGuardTest(t, user.Id))
	require.Equal(t, 456, getUserQuotaForPaymentGuardTest(t, user.Id))
	require.Nil(t, GetTopUpByTradeNo(order.TradeNo))
}
