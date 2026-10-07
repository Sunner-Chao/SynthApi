package service

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestAlipayNotificationRetainsOrderProfileAfterSwitch(t *testing.T) {
	originalProfiles, originalActive := setting.GetAlipayProfiles()
	t.Cleanup(func() { setting.StoreAlipayProfiles(originalProfiles, originalActive) })
	for _, source := range []string{"legacy", "secondary"} {
		t.Run(source, func(t *testing.T) {
			db := setupAlipayDirectTestDB(t)
			privateKey, publicKey := alipayTestKeys(t)
			otherPrivate, otherPublic := alipayTestKeys(t)
			old := setting.AlipayProfile{ID: source, Name: source, Config: setting.AlipayDirectConfig{
				Enabled: true, AppID: "2026000000000001", SellerID: "2088000000000001", PrivateKey: privateKey, PlatformPublicKey: publicKey, NotifyURL: "https://pay.example.com/api/alipay/notify", ReturnURL: "https://pay.example.com/api/alipay/return", MinTopUp: 1,
			}}
			otherID := "legacy"
			if source == "legacy" {
				otherID = "secondary"
			}
			other := old
			other.ID = otherID
			other.Config.AppID = "2026000000000002"
			other.Config.SellerID = "2088000000000002"
			other.Config.PrivateKey = otherPrivate
			other.Config.PlatformPublicKey = otherPublic
			setting.StoreAlipayProfiles([]setting.AlipayProfile{old, other}, otherID)
			old, _ = setting.GetAlipayProfile(source)
			user := &model.User{Username: "switch-" + source, Quota: 100}
			require.NoError(t, db.Create(user).Error)
			order := &model.TopUp{UserId: user.Id, Amount: 500, Money: 1, Currency: "CNY", TradeNo: "profile-switch-" + source, PaymentMethod: model.PaymentMethodAlipay, PaymentProvider: model.PaymentProviderAlipayDirect, PaymentProfile: setting.AlipayProfileVersionID(old), Status: common.TopUpStatusPending}
			require.NoError(t, order.Insert())
			values := map[string]string{"app_id": old.Config.AppID, "seller_id": old.Config.SellerID, "out_trade_no": order.TradeNo, "trade_no": "2026000000000000000001", "trade_status": "TRADE_SUCCESS", "total_amount": "1.00"}
			wrong := signedAlipayNotification(t, otherPrivate, values)
			require.Error(t, handleAlipayTestNotification(wrong, "127.0.0.1"))
			correct := signedAlipayNotification(t, privateKey, values)
			require.NoError(t, handleAlipayTestNotification(correct, "127.0.0.1"))
			require.NoError(t, handleAlipayTestNotification(correct, "127.0.0.1"))
			var updated model.User
			require.NoError(t, db.First(&updated, user.Id).Error)
			require.Equal(t, 600, updated.Quota)
		})
	}
}
