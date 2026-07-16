package setting

import (
	"strconv"
	"strings"
	"sync/atomic"
)

const (
	AlipayEnabledOptionKey           = "AlipayEnabled"
	AlipayAppIDOptionKey             = "AlipayAppID"
	AlipaySellerIDOptionKey          = "AlipaySellerID"
	AlipayPrivateKeyOptionKey        = "AlipayPrivateKey"
	AlipayPlatformPublicKeyOptionKey = "AlipayPlatformPublicKey"
	AlipaySandboxOptionKey           = "AlipaySandbox"
	AlipayNotifyURLOptionKey         = "AlipayNotifyURL"
	AlipayReturnURLOptionKey         = "AlipayReturnURL"
	AlipayMinTopUpOptionKey          = "AlipayMinTopUp"
)

var alipayDirectOptionKeys = [...]string{
	AlipayEnabledOptionKey,
	AlipayAppIDOptionKey,
	AlipaySellerIDOptionKey,
	AlipayPrivateKeyOptionKey,
	AlipayPlatformPublicKeyOptionKey,
	AlipaySandboxOptionKey,
	AlipayNotifyURLOptionKey,
	AlipayReturnURLOptionKey,
	AlipayMinTopUpOptionKey,
}

// AlipayDirectConfig is immutable after publication. Keep this struct limited
// to value types so callers can safely retain a request-scoped copy.
type AlipayDirectConfig struct {
	Enabled           bool
	AppID             string
	SellerID          string
	PrivateKey        string
	PlatformPublicKey string
	Sandbox           bool
	NotifyURL         string
	ReturnURL         string
	MinTopUp          float64
}

var alipayDirectConfig atomic.Value

func init() {
	alipayDirectConfig.Store(AlipayDirectConfig{MinTopUp: 1})
}

func GetAlipayDirectConfig() AlipayDirectConfig {
	return alipayDirectConfig.Load().(AlipayDirectConfig)
}

func StoreAlipayDirectConfig(config AlipayDirectConfig) {
	config.AppID = strings.TrimSpace(config.AppID)
	config.SellerID = strings.TrimSpace(config.SellerID)
	config.PrivateKey = strings.TrimSpace(config.PrivateKey)
	config.PlatformPublicKey = strings.TrimSpace(config.PlatformPublicKey)
	config.NotifyURL = strings.TrimSpace(config.NotifyURL)
	config.ReturnURL = strings.TrimSpace(config.ReturnURL)
	alipayDirectConfig.Store(config)
}

func IsAlipayDirectOptionKey(key string) bool {
	for _, optionKey := range alipayDirectOptionKeys {
		if key == optionKey {
			return true
		}
	}
	return false
}

func AlipayDirectConfigFromOptions(base AlipayDirectConfig, values map[string]string) AlipayDirectConfig {
	if value, ok := values[AlipayEnabledOptionKey]; ok {
		base.Enabled = value == "true"
	}
	if value, ok := values[AlipayAppIDOptionKey]; ok {
		base.AppID = strings.TrimSpace(value)
	}
	if value, ok := values[AlipaySellerIDOptionKey]; ok {
		base.SellerID = strings.TrimSpace(value)
	}
	if value, ok := values[AlipayPrivateKeyOptionKey]; ok {
		base.PrivateKey = strings.TrimSpace(value)
	}
	if value, ok := values[AlipayPlatformPublicKeyOptionKey]; ok {
		base.PlatformPublicKey = strings.TrimSpace(value)
	}
	if value, ok := values[AlipaySandboxOptionKey]; ok {
		base.Sandbox = value == "true"
	}
	if value, ok := values[AlipayNotifyURLOptionKey]; ok {
		base.NotifyURL = strings.TrimSpace(value)
	}
	if value, ok := values[AlipayReturnURLOptionKey]; ok {
		base.ReturnURL = strings.TrimSpace(value)
	}
	if value, ok := values[AlipayMinTopUpOptionKey]; ok {
		base.MinTopUp, _ = strconv.ParseFloat(value, 64)
	}
	return base
}

func AlipayDirectConfigToOptions(config AlipayDirectConfig) map[string]string {
	return map[string]string{
		AlipayEnabledOptionKey:           strconv.FormatBool(config.Enabled),
		AlipayAppIDOptionKey:             strings.TrimSpace(config.AppID),
		AlipaySellerIDOptionKey:          strings.TrimSpace(config.SellerID),
		AlipayPrivateKeyOptionKey:        strings.TrimSpace(config.PrivateKey),
		AlipayPlatformPublicKeyOptionKey: strings.TrimSpace(config.PlatformPublicKey),
		AlipaySandboxOptionKey:           strconv.FormatBool(config.Sandbox),
		AlipayNotifyURLOptionKey:         strings.TrimSpace(config.NotifyURL),
		AlipayReturnURLOptionKey:         strings.TrimSpace(config.ReturnURL),
		AlipayMinTopUpOptionKey:          strconv.FormatFloat(config.MinTopUp, 'f', -1, 64),
	}
}
