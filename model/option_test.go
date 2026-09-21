package model

import (
	"errors"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestUpdateOptionReturnsFirstOrCreateError(t *testing.T) {
	expected := errors.New("forced option query failure")
	callbackName := "test:update_option_query_error"
	require.NoError(t, DB.Callback().Query().Before("gorm:query").Register(callbackName, func(tx *gorm.DB) {
		tx.AddError(expected)
	}))
	t.Cleanup(func() {
		_ = DB.Callback().Query().Remove(callbackName)
	})

	err := UpdateOption("AlipayAppID", "should-not-be-saved")
	require.ErrorIs(t, err, expected)
}

func TestUpdateOptionsBulkPublishesAlipaySnapshot(t *testing.T) {
	originalConfig := setting.GetAlipayDirectConfig()
	common.OptionMapRWMutex.Lock()
	originalOptionMap := common.OptionMap
	common.OptionMap = make(map[string]string)
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		setting.StoreAlipayDirectConfig(originalConfig)
		common.OptionMapRWMutex.Lock()
		common.OptionMap = originalOptionMap
		common.OptionMapRWMutex.Unlock()
		DB.Where("key LIKE ?", "Alipay%").Delete(&Option{})
	})

	want := setting.AlipayDirectConfig{
		Enabled:           true,
		AppID:             "2026000000000001",
		SellerID:          "2088000000000001",
		PrivateKey:        "private-key",
		PlatformPublicKey: "public-key",
		Sandbox:           true,
		NotifyURL:         "https://pay.example.com/api/alipay/notify",
		ReturnURL:         "https://pay.example.com/api/alipay/return",
		MinTopUp:          0.1,
	}
	require.NoError(t, UpdateOptionsBulk(setting.AlipayDirectConfigToOptions(want)))
	require.Equal(t, want, setting.GetAlipayDirectConfig())

	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()
	for key, value := range setting.AlipayDirectConfigToOptions(want) {
		require.Equal(t, value, common.OptionMap[key])
	}
}

func TestLoadOptionsPublishesAlipayConfigAsOneSnapshot(t *testing.T) {
	originalConfig := setting.GetAlipayDirectConfig()
	common.OptionMapRWMutex.Lock()
	originalOptionMap := common.OptionMap
	common.OptionMap = make(map[string]string)
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		setting.StoreAlipayDirectConfig(originalConfig)
		common.OptionMapRWMutex.Lock()
		common.OptionMap = originalOptionMap
		common.OptionMapRWMutex.Unlock()
		DB.Where("key LIKE ?", "Alipay%").Delete(&Option{})
	})

	want := setting.AlipayDirectConfig{
		Enabled:           true,
		AppID:             "2026000000000002",
		SellerID:          "2088000000000002",
		PrivateKey:        "load-private-key",
		PlatformPublicKey: "load-public-key",
		NotifyURL:         "https://sync.example.com/api/alipay/notify",
		ReturnURL:         "https://sync.example.com/api/alipay/return",
		MinTopUp:          2.5,
	}
	for key, value := range setting.AlipayDirectConfigToOptions(want) {
		require.NoError(t, DB.Save(&Option{Key: key, Value: value}).Error)
	}
	setting.StoreAlipayDirectConfig(setting.AlipayDirectConfig{MinTopUp: 1})

	loadOptionsFromDatabase()
	require.Equal(t, want, setting.GetAlipayDirectConfig())
}
