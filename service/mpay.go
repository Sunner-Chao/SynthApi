package service

import (
	"bytes"
	"context"
	"crypto/md5"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type MPayCreateResult struct {
	PayURL string
	Raw    map[string]any
}

func IsMPayTopUpEnabled() bool {
	return operation_setting.IsPaymentComplianceConfirmed() &&
		setting.MPayEnabled &&
		strings.TrimSpace(setting.MPayApiBase) != "" &&
		strings.TrimSpace(setting.MPayPid) != "" &&
		strings.TrimSpace(setting.MPayKey) != ""
}

func GetMPayMinTopup() float64 {
	minTopup := setting.MPayMinTopUp
	if minTopup <= 0 {
		minTopup = 0.1
	}
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		dMinTopup := decimal.NewFromFloat(minTopup)
		dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
		minTopup, _ = dMinTopup.Mul(dQuotaPerUnit).Float64()
	}
	return minTopup
}

func GetMPayMoney(amount float64, group string) float64 {
	dAmount := decimal.NewFromFloat(operation_setting.DisplayAmountToUSD(amount))

	topupGroupRatio := common.GetTopupGroupRatio(group)
	if topupGroupRatio == 0 {
		topupGroupRatio = 1
	}
	discount := 1.0
	if ds, ok := operation_setting.GetPaymentSetting().AmountDiscount[int(amount)]; ok && ds > 0 {
		discount = ds
	}

	return dAmount.
		Mul(decimal.NewFromFloat(setting.MPayUnitPrice)).
		Mul(decimal.NewFromFloat(topupGroupRatio)).
		Mul(decimal.NewFromFloat(discount)).
		InexactFloat64()
}

func CreateMPayOrder(ctx context.Context, userID int, amount float64, paymentMethod string, notifyURL string, returnURL string) (*XPayOrder, error) {
	if !IsMPayTopUpEnabled() {
		return nil, errors.New("MPay is not configured")
	}
	if amount < GetMPayMinTopup() {
		return nil, fmt.Errorf("充值数量不能小于 %.2f", GetMPayMinTopup())
	}

	group, err := model.GetUserGroup(userID, true)
	if err != nil {
		return nil, fmt.Errorf("获取用户分组失败: %w", err)
	}
	payMoney := GetMPayMoney(amount, group)
	if payMoney < 0.01 {
		return nil, errors.New("充值金额过低")
	}
	storedAmount := int64(operation_setting.DisplayAmountToQuota(amount))
	if storedAmount <= 0 {
		return nil, errors.New("充值金额过低")
	}

	localTradeNo := fmt.Sprintf("MP%d%s%d", userID, common.GetRandomString(6), time.Now().Unix())
	paymentMethod = normalizeMPayMethod(paymentMethod)
	topUp := &model.TopUp{
		UserId:          userID,
		Amount:          storedAmount,
		DisplayAmount:   amount,
		Money:           payMoney,
		TradeNo:         localTradeNo,
		PaymentMethod:   paymentMethod,
		PaymentProvider: model.PaymentProviderMPay,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	if err := topUp.Insert(); err != nil {
		return nil, fmt.Errorf("failed to create order: %w", err)
	}

	result, err := createRemoteMPayOrder(ctx, localTradeNo, amount, payMoney, paymentMethod, notifyURL, returnURL)
	if err != nil {
		topUp.Status = common.TopUpStatusFailed
		_ = topUp.Update()
		return nil, err
	}

	logger.LogInfo(ctx, fmt.Sprintf("MPay 订单创建成功 user_id=%d trade_no=%s amount=%.2f money=%.2f method=%s pay_url=%q raw=%q",
		userID, topUp.TradeNo, amount, payMoney, paymentMethod, result.PayURL, common.GetJsonString(result.Raw)))

	return &XPayOrder{
		TradeNo:       topUp.TradeNo,
		OutTradeNo:    topUp.TradeNo,
		Amount:        amount,
		Money:         payMoney,
		PaymentMethod: paymentMethod,
		Status:        "pending",
		PayURL:        result.PayURL,
		CreatedAt:     topUp.CreateTime,
	}, nil
}

func createRemoteMPayOrder(ctx context.Context, localTradeNo string, amount float64, payMoney float64, paymentMethod string, notifyURL string, returnURL string) (*MPayCreateResult, error) {
	if notifyURL == "" {
		notifyURL = setting.MPayNotifyURL
	}
	if notifyURL == "" {
		notifyURL = defaultMPayNotifyURL()
	}
	if notifyURL == "" {
		return nil, errors.New("MPay notify URL is not configured")
	}
	if returnURL == "" {
		returnURL = setting.MPayReturnURL
	}
	if returnURL == "" {
		returnURL = defaultMPayReturnURL()
	}

	payload := map[string]string{
		"pid":          setting.MPayPid,
		"type":         normalizeMPayMethod(paymentMethod),
		"out_trade_no": localTradeNo,
		"notify_url":   notifyURL,
		"return_url":   returnURL,
		"name":         fmt.Sprintf("SynthAPI topup %.2f", amount),
		"money":        strconv.FormatFloat(payMoney, 'f', 2, 64),
		"clientip":     "",
		"device":       "pc",
		"sign_type":    "MD5",
	}
	payload["sign"] = SignMPayParams(payload, setting.MPayKey)

	form := url.Values{}
	for key, value := range payload {
		if value != "" {
			form.Set(key, value)
		}
	}

	endpoint := strings.TrimRight(setting.MPayApiBase, "/") + "/mapi"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewBufferString(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("MPay request failed: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("MPay returned HTTP %d: %s", resp.StatusCode, string(body))
	}

	var parsed map[string]any
	if err := common.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("MPay returned non-JSON response: %s", strings.TrimSpace(string(body)))
	}
	if code := mpayNumericField(parsed, "code"); code != 1 {
		return nil, fmt.Errorf("MPay returned error: %s", mpayStringField(parsed, "msg"))
	}
	payURL := findMPayPayURL(parsed)
	if payURL == "" {
		return nil, fmt.Errorf("MPay returned empty pay url: %s", strings.TrimSpace(string(body)))
	}
	return &MPayCreateResult{PayURL: payURL, Raw: parsed}, nil
}

func ConfirmMPayOrder(tradeNo string, callbackMoney float64, callerIP string) error {
	var topUp model.TopUp
	var quotaToAdd int

	refCol := "`trade_no`"
	if common.UsingPostgreSQL {
		refCol = `"trade_no"`
	}

	err := model.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", tradeNo).First(&topUp).Error; err != nil {
			return fmt.Errorf("order not found: %s", tradeNo)
		}
		if topUp.PaymentProvider != model.PaymentProviderMPay {
			return model.ErrPaymentMethodMismatch
		}
		if topUp.Status != common.TopUpStatusPending {
			return model.ErrTopUpStatusInvalid
		}
		if callbackMoney > 0 && decimal.NewFromFloat(topUp.Money).Sub(decimal.NewFromFloat(callbackMoney)).Abs().GreaterThan(decimal.NewFromFloat(0.01)) {
			return fmt.Errorf("payment amount mismatch: order=%.2f callback=%.2f", topUp.Money, callbackMoney)
		}

		topUp.Status = common.TopUpStatusSuccess
		topUp.CompleteTime = time.Now().Unix()
		if err := tx.Save(&topUp).Error; err != nil {
			return fmt.Errorf("failed to update order: %w", err)
		}

		quotaToAdd = int(topUp.Amount)
		if quotaToAdd < 0 {
			return errors.New("quota cannot be negative")
		}
		if err := tx.Model(&model.User{}).Where("id = ?", topUp.UserId).Update("quota", gorm.Expr("quota + ?", quotaToAdd)).Error; err != nil {
			return fmt.Errorf("failed to increase user quota: %w", err)
		}
		return nil
	})
	if err != nil {
		return err
	}

	logger.LogInfo(context.Background(), fmt.Sprintf("MPay 充值成功 trade_no=%s user_id=%d quota_to_add=%d money=%.2f",
		tradeNo, topUp.UserId, quotaToAdd, topUp.Money))
	model.RecordTopupLog(topUp.UserId, fmt.Sprintf("使用 MPay 在线充值成功，充值金额: %v，支付金额：%f", logger.LogQuota(quotaToAdd), topUp.Money), callerIP, topUp.PaymentMethod, model.PaymentProviderMPay)
	return nil
}

func VerifyMPayCallback(params map[string]string) bool {
	sign := params["sign"]
	if sign == "" || setting.MPayKey == "" {
		return false
	}
	return strings.EqualFold(sign, SignMPayParams(params, setting.MPayKey))
}

func SignMPayParams(params map[string]string, key string) string {
	keys := make([]string, 0, len(params))
	for paramKey, value := range params {
		if paramKey == "sign" || paramKey == "sign_type" || value == "" {
			continue
		}
		keys = append(keys, paramKey)
	}
	sort.Strings(keys)

	parts := make([]string, 0, len(keys))
	for _, paramKey := range keys {
		parts = append(parts, paramKey+"="+params[paramKey])
	}
	signText := strings.Join(parts, "&") + key
	sum := md5.Sum([]byte(signText))
	return fmt.Sprintf("%x", sum)
}

func ExtractMPayTradeNo(params map[string]string) string {
	for _, key := range []string{"out_trade_no", "trade_no", "order_id"} {
		if value := strings.TrimSpace(params[key]); value != "" {
			return value
		}
	}
	return ""
}

func ExtractMPayMoney(params map[string]string) float64 {
	for _, key := range []string{"money", "amount", "total_amount"} {
		if value := strings.TrimSpace(params[key]); value != "" {
			if parsed, err := strconv.ParseFloat(value, 64); err == nil {
				return parsed
			}
		}
	}
	return 0
}

func IsMPayPaidStatus(status string) bool {
	return strings.EqualFold(strings.TrimSpace(status), "TRADE_SUCCESS")
}

func normalizeMPayMethod(method string) string {
	switch strings.ToLower(strings.TrimSpace(method)) {
	case "wechat", "weixin", "wx", "wxpay":
		return "wxpay"
	case "alipay", "mpay", "xpay", "":
		return "alipay"
	default:
		return method
	}
}

func defaultMPayNotifyURL() string {
	base := strings.TrimRight(system_setting.ServerAddress, "/")
	if base == "" {
		return ""
	}
	return base + "/api/mpay/notify"
}

func defaultMPayReturnURL() string {
	base := strings.TrimRight(system_setting.ServerAddress, "/")
	if base == "" {
		return ""
	}
	return base + "/wallet"
}

func findMPayPayURL(data map[string]any) string {
	for _, key := range []string{"payurl", "pay_url", "payUrl", "url", "qrcode"} {
		if value := mpayStringField(data, key); value != "" {
			return value
		}
	}
	if nested, ok := data["data"].(map[string]any); ok {
		return findMPayPayURL(nested)
	}
	return ""
}

func mpayStringField(data map[string]any, key string) string {
	value, ok := data[key]
	if !ok {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	default:
		return strings.TrimSpace(fmt.Sprint(typed))
	}
}

func mpayNumericField(data map[string]any, key string) float64 {
	value, ok := data[key]
	if !ok {
		return 0
	}
	switch typed := value.(type) {
	case float64:
		return typed
	case int:
		return float64(typed)
	case string:
		parsed, _ := strconv.ParseFloat(strings.TrimSpace(typed), 64)
		return parsed
	default:
		parsed, _ := strconv.ParseFloat(strings.TrimSpace(fmt.Sprint(typed)), 64)
		return parsed
	}
}
