package model

import (
	"database/sql"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/require"
)

func TestManualCompleteTopUpUsesStoredQuotaForMPay(t *testing.T) {
	truncateTables(t)

	originalQuotaPerUnit := common.QuotaPerUnit
	originalDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
	originalExchangeRate := operation_setting.USDExchangeRate
	t.Cleanup(func() {
		common.QuotaPerUnit = originalQuotaPerUnit
		operation_setting.GetGeneralSetting().QuotaDisplayType = originalDisplayType
		operation_setting.USDExchangeRate = originalExchangeRate
	})

	common.QuotaPerUnit = 500000
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeCNY
	operation_setting.USDExchangeRate = 7.3

	user := &User{Username: "mpay-user", Quota: 1000}
	require.NoError(t, DB.Create(user).Error)

	topUp := &TopUp{
		UserId:          user.Id,
		Amount:          6849,
		DisplayAmount:   0.1,
		Money:           0.1,
		TradeNo:         "MP-test-manual-complete",
		PaymentMethod:   "alipay",
		PaymentProvider: PaymentProviderMPay,
		CreateTime:      1000,
		Status:          common.TopUpStatusPending,
	}
	require.NoError(t, DB.Create(topUp).Error)

	require.NoError(t, ManualCompleteTopUp(topUp.TradeNo, "127.0.0.1"))

	var updated User
	require.NoError(t, DB.Where("id = ?", user.Id).First(&updated).Error)
	require.Equal(t, 7849, updated.Quota)

	var completed TopUp
	require.NoError(t, DB.Where("trade_no = ?", topUp.TradeNo).First(&completed).Error)
	require.Equal(t, common.TopUpStatusSuccess, completed.Status)
	require.NotZero(t, completed.CompleteTime)
}

// Ordinary top-ups have no promotion date. PostgreSQL DATE columns cannot
// accept the empty string that SQLite would otherwise silently store.
func TestTopUpInsertNullablePromotionDay(t *testing.T) {
	truncateTables(t)
	for _, day := range []string{"", "2026-10-06"} {
		order := &TopUp{TradeNo: "nullable-day-" + day, PromotionDay: day, PaymentProvider: PaymentProviderAlipayDirect, PaymentProfile: "secondary#test"}
		require.NoError(t, order.Insert())
		var stored sql.NullString
		require.NoError(t, DB.Raw("SELECT promotion_day FROM top_ups WHERE id = ?", order.Id).Row().Scan(&stored))
		require.Equal(t, day != "", stored.Valid)
		if day != "" {
			require.Contains(t, stored.String, day)
		}
		var loaded TopUp
		require.NoError(t, DB.First(&loaded, order.Id).Error)
		require.Equal(t, "secondary#test", loaded.PaymentProfile)
	}
}
