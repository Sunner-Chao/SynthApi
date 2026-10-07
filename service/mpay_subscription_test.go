package service

import (
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestMPaySubscriptionCallbackValidation(t *testing.T) {
	old := setting.MPayPid
	setting.MPayPid = "subscription-test-merchant"
	t.Cleanup(func() { setting.MPayPid = old })
	order := &model.SubscriptionOrder{TradeNo: "MPSUBUSR-test", Money: 30, PaymentProvider: model.PaymentProviderMPay, PaymentMethod: model.PaymentMethodWechat}
	valid := map[string]string{"pid": setting.MPayPid, "out_trade_no": order.TradeNo, "trade_no": "provider-test", "type": "wxpay", "trade_status": "TRADE_SUCCESS", "money": "30.00"}
	require.NoError(t, validateMPaySubscriptionCallback(order, valid))
	for _, tc := range []struct{ field, value string }{
		{"pid", "another-merchant"}, {"out_trade_no", "another-order"}, {"trade_no", ""},
		{"type", "alipay"}, {"type", ""}, {"money", ""}, {"money", "29.99"},
		{"money", "30.01"}, {"money", "NaN"}, {"money", "0"}, {"trade_status", "WAIT_BUYER_PAY"},
	} {
		t.Run(tc.field+"="+tc.value, func(t *testing.T) {
			params := make(map[string]string)
			for k, v := range valid {
				params[k] = v
			}
			params[tc.field] = tc.value
			require.Error(t, validateMPaySubscriptionCallback(order, params))
		})
	}
	wrong := *order
	wrong.PaymentProvider = model.PaymentProviderAlipayDirect
	require.ErrorIs(t, validateMPaySubscriptionCallback(&wrong, valid), model.ErrPaymentMethodMismatch)
	require.ErrorIs(t, validateMPaySubscriptionCallback(nil, valid), model.ErrSubscriptionOrderNotFound)
}
