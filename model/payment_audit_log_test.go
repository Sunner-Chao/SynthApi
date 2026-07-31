package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestBuildPaymentAuditAdminInfoIncludesStructuredFields(t *testing.T) {
	oldVersion := common.Version
	oldNodeName := common.NodeName
	t.Cleanup(func() {
		common.Version = oldVersion
		common.NodeName = oldNodeName
	})
	t.Setenv("AUDIT_SERVER_IP", "116.62.113.242")
	common.Version = "git-test123"
	common.NodeName = "aliyun-prod"

	adminInfo := buildPaymentAuditAdminInfo(PaymentAuditInfo{
		Event:                 "topup_completed",
		Source:                "webhook",
		TradeNo:               "local-order",
		ProviderTradeNo:       "provider-order",
		PaymentMethod:         PaymentMethodAlipay,
		PaymentProvider:       PaymentProviderAlipayDirect,
		CallbackPaymentMethod: PaymentMethodAlipay,
		CallerIp:              "203.0.113.20",
	})

	require.Equal(t, paymentAuditSchemaVersion, adminInfo["audit_schema_version"])
	require.Equal(t, "116.62.113.242", adminInfo["server_ip"])
	require.Equal(t, "203.0.113.20", adminInfo["caller_ip"])
	require.Equal(t, "aliyun-prod", adminInfo["node_name"])
	require.Equal(t, "git-test123", adminInfo["version"])
	require.Equal(t, "local-order", adminInfo["trade_no"])
	require.Equal(t, "provider-order", adminInfo["provider_trade_no"])
	require.Equal(t, PaymentProviderAlipayDirect, adminInfo["payment_provider"])
}

func TestBuildPaymentAuditAdminInfoTreatsPollingMarkerAsSource(t *testing.T) {
	adminInfo := buildPaymentAuditAdminInfo(PaymentAuditInfo{
		Event:    "topup_completed",
		Source:   "callback",
		CallerIp: "alipay-polling",
	})

	require.Equal(t, "alipay-polling", adminInfo["source"])
	require.NotContains(t, adminInfo, "caller_ip")
}
