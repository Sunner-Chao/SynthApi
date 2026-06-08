package service

import "testing"

func TestSignMPayParams(t *testing.T) {
	params := map[string]string{
		"pid":          "1001",
		"type":         "alipay",
		"out_trade_no": "MP123",
		"notify_url":   "https://example.com/api/mpay/notify",
		"name":         "SynthAPI topup",
		"money":        "0.10",
		"sign_type":    "MD5",
		"sign":         "ignored",
	}

	sign := SignMPayParams(params, "secret")
	want := "a06b8499985dd900ed4ebea978bf21a1"
	if sign != want {
		t.Fatalf("unexpected sign: got %s want %s", sign, want)
	}
}

func TestExtractMPayCallbackFields(t *testing.T) {
	params := map[string]string{
		"trade_no":     "H202606080001",
		"out_trade_no": "MP123",
		"money":        "0.10",
		"trade_status": "TRADE_SUCCESS",
	}

	if got := ExtractMPayTradeNo(params); got != "MP123" {
		t.Fatalf("unexpected trade no: %s", got)
	}
	if got := ExtractMPayMoney(params); got != 0.10 {
		t.Fatalf("unexpected money: %f", got)
	}
	if !IsMPayPaidStatus(params["trade_status"]) {
		t.Fatal("expected TRADE_SUCCESS to be paid")
	}
	if IsMPayPaidStatus("WAIT_BUYER_PAY") {
		t.Fatal("WAIT_BUYER_PAY should not be paid")
	}
}
