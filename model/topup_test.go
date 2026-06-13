package model

import (
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
