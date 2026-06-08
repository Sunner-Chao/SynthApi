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
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/bytedance/gopkg/util/gopool"
	"github.com/shopspring/decimal"
)

const (
	xpayPollTickInterval = 30 * time.Second
	xpayPollBatchSize    = 100
	xpayOrderExpireAfter = 30 * time.Minute
)

var (
	xpayPollOnce    sync.Once
	xpayPollRunning atomic.Bool
)

type XPayOrder struct {
	TradeNo       string  `json:"trade_no"`
	OutTradeNo    string  `json:"out_trade_no"`
	Amount        float64 `json:"amount"`
	Money         float64 `json:"money"`
	PaymentMethod string  `json:"payment_method"`
	Status        string  `json:"status"`
	PayURL        string  `json:"pay_url,omitempty"`
	CreatedAt     int64   `json:"created_at"`
	PaidAt        int64   `json:"paid_at,omitempty"`
}

type XPayCreateResult struct {
	PayURL string
	Raw    map[string]any
}

func IsXPayTopUpEnabled() bool {
	return operation_setting.IsPaymentComplianceConfirmed() &&
		setting.XPayEnabled &&
		strings.TrimSpace(setting.XPayApiBase) != ""
}

func GetXPayMinTopup() float64 {
	minTopup := setting.XPayMinTopUp
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

func GetXPayMoney(amount float64, group string) float64 {
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
		Mul(decimal.NewFromFloat(setting.XPayUnitPrice)).
		Mul(decimal.NewFromFloat(topupGroupRatio)).
		Mul(decimal.NewFromFloat(discount)).
		InexactFloat64()
}

func CreateXPayOrder(ctx context.Context, userID int, amount float64, paymentMethod string, notifyURL string, returnURL string) (*XPayOrder, error) {
	if !IsXPayTopUpEnabled() {
		return nil, errors.New("XPay is not configured")
	}
	if amount < GetXPayMinTopup() {
		return nil, fmt.Errorf("充值数量不能小于 %.2f", GetXPayMinTopup())
	}

	group, err := model.GetUserGroup(userID, true)
	if err != nil {
		return nil, fmt.Errorf("获取用户分组失败: %w", err)
	}
	payMoney := GetXPayMoney(amount, group)
	if payMoney < 0.01 {
		return nil, errors.New("充值金额过低")
	}
	storedAmount := int64(operation_setting.DisplayAmountToQuota(amount))
	if storedAmount <= 0 {
		return nil, errors.New("充值金额过低")
	}

	localTradeNo := fmt.Sprintf("XP%d%s%d", userID, common.GetRandomString(6), time.Now().Unix())
	topUp := &model.TopUp{
		UserId:          userID,
		Amount:          storedAmount,
		DisplayAmount:   amount,
		Money:           payMoney,
		TradeNo:         localTradeNo,
		PaymentMethod:   paymentMethod,
		PaymentProvider: model.PaymentProviderXPay,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	if err := topUp.Insert(); err != nil {
		return nil, fmt.Errorf("failed to create order: %w", err)
	}

	result, err := createRemoteXPayOrder(ctx, userID, localTradeNo, amount, payMoney, paymentMethod, notifyURL, returnURL)
	if err != nil {
		topUp.Status = common.TopUpStatusFailed
		_ = topUp.Update()
		return nil, err
	}
	remoteTradeNo := extractXPayCreateOrderID(result.Raw)
	if remoteTradeNo != "" && remoteTradeNo != localTradeNo {
		topUp.TradeNo = remoteTradeNo
		if err := topUp.Update(); err != nil {
			return nil, fmt.Errorf("failed to update XPay order id: %w", err)
		}
	}

	logger.LogInfo(ctx, fmt.Sprintf("XPay 订单创建成功 user_id=%d trade_no=%s amount=%.2f money=%.2f method=%s pay_url=%q raw=%q",
		userID, topUp.TradeNo, amount, payMoney, paymentMethod, result.PayURL, common.GetJsonString(result.Raw)))

	return &XPayOrder{
		TradeNo:       topUp.TradeNo,
		OutTradeNo:    topUp.TradeNo,
		Amount:        float64(amount),
		Money:         payMoney,
		PaymentMethod: paymentMethod,
		Status:        "pending",
		PayURL:        result.PayURL,
		CreatedAt:     topUp.CreateTime,
	}, nil
}

func createRemoteXPayOrder(ctx context.Context, userID int, localTradeNo string, amount float64, payMoney float64, paymentMethod string, notifyURL string, returnURL string) (*XPayCreateResult, error) {
	normalizedMethod := normalizeXPayMethod(paymentMethod)
	endpointPath := normalizedXPayGatewayPath(normalizedMethod)
	email := xpayNotificationEmail(userID)
	payload := map[string]string{
		"nickName": "SynthApi",
		"money":    strconv.FormatFloat(payMoney, 'f', 2, 64),
		"email":    email,
		"payType":  normalizedMethod,
		"info":     fmt.Sprintf("SynthApi topup %.2f %s", amount, localTradeNo),
		"custom":   "true",
		"mobile":   "false",
		"device":   "SynthApi",
	}

	form := url.Values{}
	for key, value := range payload {
		if value != "" {
			form.Set(key, value)
		}
	}
	endpoint := strings.TrimRight(setting.XPayApiBase, "/") + endpointPath
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewBufferString(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("XPay request failed: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("XPay returned HTTP %d: %s", resp.StatusCode, string(body))
	}

	var parsed map[string]any
	if err := common.Unmarshal(body, &parsed); err != nil {
		text := strings.TrimSpace(string(body))
		if strings.HasPrefix(text, "http://") || strings.HasPrefix(text, "https://") {
			return &XPayCreateResult{PayURL: text, Raw: map[string]any{"raw": text}}, nil
		}
		return nil, fmt.Errorf("XPay returned non-JSON response: %s", text)
	}
	if success, ok := parsed["success"].(bool); ok && !success {
		return nil, fmt.Errorf("XPay returned error: %s", xpayStringField(parsed, "message"))
	}
	payURL := findXPayPayURL(parsed)
	if payURL == "" {
		if isLegacyXPayPayAddPath(endpointPath) {
			payURL = legacyXPayPayURL(parsed, normalizedMethod, payMoney)
		} else {
			payURL = defaultXPayPayURL(normalizedMethod)
		}
	}
	return &XPayCreateResult{PayURL: payURL, Raw: parsed}, nil
}

func ConfirmPaidXPayOrderFromRemote(ctx context.Context, tradeNo string, callerIP string) (bool, error) {
	topUp := model.GetTopUpByTradeNo(tradeNo)
	if topUp == nil {
		return false, fmt.Errorf("order not found: %s", tradeNo)
	}
	if topUp.PaymentProvider != model.PaymentProviderXPay {
		return false, model.ErrPaymentMethodMismatch
	}
	if topUp.Status != common.TopUpStatusPending {
		return false, nil
	}

	paid, err := QueryRemoteXPayPaid(ctx, tradeNo)
	if err != nil {
		return false, err
	}
	if !paid {
		return false, nil
	}
	if err := ConfirmXPayOrder(tradeNo, topUp.Money, callerIP); err != nil {
		if err == model.ErrTopUpStatusInvalid {
			return true, nil
		}
		return false, err
	}
	return true, nil
}

func QueryRemoteXPayPaid(ctx context.Context, tradeNo string) (bool, error) {
	endpoint := strings.TrimRight(setting.XPayApiBase, "/") + "/pay/state/" + url.PathEscape(tradeNo)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return false, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false, fmt.Errorf("XPay status request failed: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return false, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return false, fmt.Errorf("XPay status returned HTTP %d: %s", resp.StatusCode, string(body))
	}
	var parsed map[string]any
	if err := common.Unmarshal(body, &parsed); err != nil {
		return false, fmt.Errorf("XPay status returned non-JSON response: %s", strings.TrimSpace(string(body)))
	}
	if success, ok := parsed["success"].(bool); ok && !success {
		return false, fmt.Errorf("XPay status returned error: %s", xpayStringField(parsed, "message"))
	}
	return xpayNumericField(parsed, "result") == 1, nil
}

func StartXPayOrderPollingTask() {
	xpayPollOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		gopool.Go(func() {
			logger.LogInfo(context.Background(), fmt.Sprintf("XPay order polling task started: tick=%s", xpayPollTickInterval))
			ticker := time.NewTicker(xpayPollTickInterval)
			defer ticker.Stop()

			runXPayOrderPollingOnce()
			for range ticker.C {
				runXPayOrderPollingOnce()
			}
		})
	})
}

func runXPayOrderPollingOnce() {
	if !IsXPayTopUpEnabled() {
		return
	}
	if !xpayPollRunning.CompareAndSwap(false, true) {
		return
	}
	defer xpayPollRunning.Store(false)

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	var topUps []*model.TopUp
	err := model.DB.
		Where("status = ? AND payment_provider = ?", common.TopUpStatusPending, model.PaymentProviderXPay).
		Order("id asc").
		Limit(xpayPollBatchSize).
		Find(&topUps).Error
	if err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("XPay polling load orders failed: %v", err))
		return
	}

	now := time.Now().Unix()
	for _, topUp := range topUps {
		if topUp.CreateTime > 0 && now-topUp.CreateTime > int64(xpayOrderExpireAfter.Seconds()) {
			topUp.Status = common.TopUpStatusExpired
			_ = topUp.Update()
			continue
		}

		paid, err := ConfirmPaidXPayOrderFromRemote(ctx, topUp.TradeNo, "xpay-polling")
		if err != nil {
			logger.LogWarn(ctx, fmt.Sprintf("XPay polling order failed trade_no=%s error=%v", topUp.TradeNo, err))
			continue
		}
		if paid {
			logger.LogInfo(ctx, fmt.Sprintf("XPay polling confirmed paid trade_no=%s", topUp.TradeNo))
		}
	}
}

func ConfirmXPayOrder(tradeNo string, callbackMoney float64, callerIP string) error {
	topUp := model.GetTopUpByTradeNo(tradeNo)
	if topUp == nil {
		return fmt.Errorf("order not found: %s", tradeNo)
	}
	if topUp.PaymentProvider != model.PaymentProviderXPay {
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
	if err := topUp.Update(); err != nil {
		return fmt.Errorf("failed to update order: %w", err)
	}

	quotaToAdd := int(topUp.Amount)
	if topUp.DisplayAmount > 0 {
		quotaToAdd = operation_setting.DisplayAmountToQuota(topUp.DisplayAmount)
	}
	if err := model.IncreaseUserQuota(topUp.UserId, quotaToAdd, true); err != nil {
		return fmt.Errorf("failed to increase user quota: %w", err)
	}

	logger.LogInfo(context.Background(), fmt.Sprintf("XPay 充值成功 trade_no=%s user_id=%d quota_to_add=%d money=%.2f",
		tradeNo, topUp.UserId, quotaToAdd, topUp.Money))
	model.RecordTopupLog(topUp.UserId, fmt.Sprintf("使用 XPay 在线充值成功，充值金额: %v，支付金额：%f", logger.LogQuota(quotaToAdd), topUp.Money), callerIP, topUp.PaymentMethod, model.PaymentProviderXPay)
	return nil
}

func GetXPayOrderStatus(tradeNo string) (*XPayOrder, error) {
	topUp := model.GetTopUpByTradeNo(tradeNo)
	if topUp == nil {
		return nil, fmt.Errorf("order not found: %s", tradeNo)
	}
	return topUpToXPayOrder(topUp), nil
}

func GetUserXPayOrders(userID int, page int, pageSize int) ([]XPayOrder, int, error) {
	topUps, total, err := model.GetUserTopUps(userID, &common.PageInfo{Page: page, PageSize: pageSize})
	if err != nil {
		return nil, 0, err
	}

	orders := make([]XPayOrder, 0, len(topUps))
	for _, topUp := range topUps {
		if topUp.PaymentProvider == model.PaymentProviderXPay {
			orders = append(orders, *topUpToXPayOrder(topUp))
		}
	}
	return orders, int(total), nil
}

func VerifyXPayCallback(params map[string]string) bool {
	sign := params["sign"]
	if sign == "" {
		sign = params["signature"]
	}
	if sign == "" || setting.XPayAppSecret == "" {
		return false
	}
	return strings.EqualFold(sign, SignXPayParams(params, setting.XPayAppSecret))
}

func SignXPayParams(params map[string]string, secret string) string {
	keys := make([]string, 0, len(params))
	for key, value := range params {
		if key == "sign" || key == "signature" || value == "" {
			continue
		}
		keys = append(keys, key)
	}
	sort.Strings(keys)

	parts := make([]string, 0, len(keys)+1)
	for _, key := range keys {
		parts = append(parts, key+"="+params[key])
	}
	parts = append(parts, "key="+secret)
	sum := md5.Sum([]byte(strings.Join(parts, "&")))
	return strings.ToUpper(fmt.Sprintf("%x", sum))
}

func ExtractXPayTradeNo(params map[string]string) string {
	for _, key := range []string{"outTradeNo", "out_trade_no", "orderNo", "order_no", "merchantOrderNo", "merchant_order_no", "tradeNo", "trade_no"} {
		if value := strings.TrimSpace(params[key]); value != "" {
			return value
		}
	}
	return ""
}

func ExtractXPayMoney(params map[string]string) float64 {
	for _, key := range []string{"amount", "money", "totalAmount", "total_amount", "payAmount", "pay_amount"} {
		if value := strings.TrimSpace(params[key]); value != "" {
			if parsed, err := strconv.ParseFloat(value, 64); err == nil {
				return parsed
			}
		}
	}
	return 0
}

func IsXPayPaidStatus(status string) bool {
	switch strings.ToUpper(strings.TrimSpace(status)) {
	case "", "SUCCESS", "PAID", "COMPLETED", "TRADE_SUCCESS", "TRADE_FINISHED", "PAY_SUCCESS":
		return true
	default:
		return false
	}
}

func normalizedXPayGatewayPath(paymentMethod string) string {
	path := strings.TrimSpace(setting.XPayGatewayPath)
	if path == "" {
		switch paymentMethod {
		case "Wechat(Official)":
			return "/wechat/precreate"
		default:
			return "/alipay/precreate"
		}
	}
	if !strings.HasPrefix(path, "/") {
		return "/" + path
	}
	return path
}

func normalizeXPayMethod(method string) string {
	if isLegacyXPayPayAddPath(setting.XPayGatewayPath) {
		switch strings.ToLower(strings.TrimSpace(method)) {
		case "wechat", "wxpay", "weixin", "wx", "wechat(official)":
			return "Wechat"
		case "dmf", "alipay", "xpay", "":
			return "Alipay"
		default:
			return method
		}
	}
	switch strings.ToLower(strings.TrimSpace(method)) {
	case "wechat", "wxpay", "weixin", "wx":
		return "Wechat(Official)"
	case "dmf", "alipay", "xpay", "":
		return "DMF"
	default:
		return method
	}
}

func isLegacyXPayPayAddPath(path string) bool {
	path = strings.TrimSpace(path)
	if path == "" {
		return false
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return strings.EqualFold(path, "/pay/add")
}

func topUpToXPayOrder(topUp *model.TopUp) *XPayOrder {
	status := "pending"
	if topUp.Status == common.TopUpStatusSuccess {
		status = "paid"
	} else if topUp.Status == common.TopUpStatusExpired {
		status = "expired"
	} else if topUp.Status == common.TopUpStatusFailed {
		status = "failed"
	}
	displayAmount := topUp.DisplayAmount
	if displayAmount <= 0 {
		displayAmount = float64(topUp.Amount)
	}
	return &XPayOrder{
		TradeNo:       topUp.TradeNo,
		OutTradeNo:    topUp.TradeNo,
		Amount:        displayAmount,
		Money:         topUp.Money,
		PaymentMethod: topUp.PaymentMethod,
		Status:        status,
		CreatedAt:     topUp.CreateTime,
		PaidAt:        topUp.CompleteTime,
	}
}

func findXPayPayURL(data map[string]any) string {
	for _, key := range []string{"payUrl", "pay_url", "paymentUrl", "payment_url", "url", "codeUrl", "code_url", "qrCode", "qr_code"} {
		if value, ok := data[key].(string); ok && value != "" {
			return value
		}
	}
	if nested, ok := data["data"].(map[string]any); ok {
		return findXPayPayURL(nested)
	}
	return ""
}

func defaultXPayPayURL(paymentMethod string) string {
	base := strings.TrimRight(setting.XPayApiBase, "/")
	switch paymentMethod {
	case "Wechat(Official)":
		return base + "/wx"
	default:
		return base + "/dmf"
	}
}

func legacyXPayPayURL(data map[string]any, paymentMethod string, payMoney float64) string {
	base := strings.TrimRight(setting.XPayApiBase, "/")
	remoteID := extractXPayCreateOrderID(data)
	payNum := xpayStringField(data, "payNum")
	if nested, ok := data["result"].(map[string]any); ok {
		if remoteID == "" {
			remoteID = extractXPayCreateOrderID(nested)
		}
		if payNum == "" {
			payNum = xpayStringField(nested, "payNum")
		}
	}
	if nested, ok := data["data"].(map[string]any); ok {
		if remoteID == "" {
			remoteID = extractXPayCreateOrderID(nested)
		}
		if payNum == "" {
			payNum = xpayStringField(nested, "payNum")
		}
	}

	page := "alipay"
	switch strings.ToLower(strings.TrimSpace(paymentMethod)) {
	case "wechat", "wechat(official)", "wxpay", "weixin", "wx":
		page = "wechat"
	case "qq":
		page = "qqpay"
	case "unionpay":
		page = "unipay"
	case "diandan":
		page = "diandan"
	}

	values := url.Values{}
	values.Set("money", strconv.FormatFloat(payMoney, 'f', 2, 64))
	values.Set("picName", "custom")
	values.Set("time", strconv.Itoa(int(xpayOrderExpireAfter.Seconds())))
	if remoteID != "" {
		values.Set("payId", remoteID)
	}
	if payNum != "" {
		values.Set("payNum", payNum)
	}
	return base + "/" + page + "?" + values.Encode()
}

func extractXPayCreateOrderID(data map[string]any) string {
	for _, key := range []string{"id", "tradeNo", "trade_no", "outTradeNo", "out_trade_no", "orderNo", "order_no"} {
		if value := xpayStringField(data, key); value != "" {
			return value
		}
	}
	if nested, ok := data["result"].(map[string]any); ok {
		return extractXPayCreateOrderID(nested)
	}
	if nested, ok := data["data"].(map[string]any); ok {
		return extractXPayCreateOrderID(nested)
	}
	return ""
}

func xpayStringField(data map[string]any, key string) string {
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

func xpayNumericField(data map[string]any, key string) float64 {
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

func xpayNotificationEmail(userID int) string {
	if email, err := model.GetUserEmail(userID); err == nil && isXPayValidEmail(email) {
		return email
	}
	return fmt.Sprintf("user%d@synthapi.cn", userID)
}

func isXPayValidEmail(email string) bool {
	email = strings.TrimSpace(email)
	if email == "" || !strings.Contains(email, "@") {
		return false
	}
	parts := strings.Split(email, "@")
	if len(parts) != 2 || parts[0] == "" {
		return false
	}
	domainParts := strings.Split(parts[1], ".")
	if len(domainParts) < 2 || len(domainParts) > 4 {
		return false
	}
	if len(domainParts[0]) < 2 || len(domainParts[0]) > 10 {
		return false
	}
	for _, part := range domainParts[1:] {
		if len(part) < 2 || len(part) > 4 {
			return false
		}
	}
	return true
}
