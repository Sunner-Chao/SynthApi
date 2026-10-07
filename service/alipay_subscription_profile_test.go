package service

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/stretchr/testify/require"
)

func TestAlipaySubscriptionRetainsProfileAfterSwitch(t *testing.T) {
	originalProfiles, originalActive := setting.GetAlipayProfiles()
	t.Cleanup(func() { setting.StoreAlipayProfiles(originalProfiles, originalActive) })
	for _, source := range []string{"legacy", "secondary"} {
		t.Run(source, func(t *testing.T) {
			db := setupAlipayDirectTestDB(t)
			require.NoError(t, db.AutoMigrate(&model.SubscriptionPlan{}))
			privateKey, publicKey := alipayTestKeys(t)
			otherPrivate, otherPublic := alipayTestKeys(t)
			old := setting.AlipayProfile{ID: source, Name: source, Config: setting.AlipayDirectConfig{
				Enabled: true, AppID: "2026000000000001", SellerID: "2088000000000001",
				PrivateKey: privateKey, PlatformPublicKey: publicKey,
				NotifyURL: "https://pay.example.com/api/alipay/notify",
				ReturnURL: "https://pay.example.com/api/alipay/return", MinTopUp: 0.1,
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
			user := &model.User{Username: "subscription-switch-" + source, Quota: 1234, Group: "default"}
			require.NoError(t, db.Create(user).Error)
			plan := &model.SubscriptionPlan{
				Title: "Weekly plan", PriceAmount: 30, Currency: "CNY",
				DurationUnit: model.SubscriptionDurationDay, DurationValue: 7, Enabled: true, TotalAmount: 2000,
			}
			require.NoError(t, db.Create(plan).Error)
			order := &model.SubscriptionOrder{
				UserId: user.Id, PlanId: plan.Id, Money: 30, TradeNo: "subscription-switch-" + source,
				PaymentMethod: model.PaymentMethodAlipay, PaymentProvider: model.PaymentProviderAlipayDirect,
				PaymentProfile: setting.AlipayProfileVersionID(old), Status: common.TopUpStatusPending,
				CreateTime: time.Now().Unix(),
			}
			require.NoError(t, order.Insert())
			values := map[string]string{
				"app_id": old.Config.AppID, "seller_id": old.Config.SellerID, "out_trade_no": order.TradeNo,
				"trade_no": "2026000000000000000001", "trade_status": "TRADE_SUCCESS", "total_amount": "30.00",
			}
			require.Error(t, handleAlipayTestNotification(signedAlipayNotification(t, otherPrivate, values), "127.0.0.1"))
			correct := signedAlipayNotification(t, privateKey, values)
			require.NoError(t, handleAlipayTestNotification(correct, "127.0.0.1"))
			require.NoError(t, handleAlipayTestNotification(correct, "127.0.0.1"))
			var count int64
			require.NoError(t, db.Model(&model.UserSubscription{}).Where("user_id = ?", user.Id).Count(&count).Error)
			require.EqualValues(t, 1, count)
			var updated model.User
			require.NoError(t, db.First(&updated, user.Id).Error)
			require.Equal(t, 1234, updated.Quota)
			audit := model.GetTopUpByTradeNo(order.TradeNo)
			require.NotNil(t, audit)
			require.Equal(t, order.PaymentProfile, audit.PaymentProfile)
			require.Equal(t, values["trade_no"], audit.ProviderTradeNo)
		})
	}
}
