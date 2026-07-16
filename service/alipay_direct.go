package service

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
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
	alipayProductionGateway = "https://openapi.alipay.com/gateway.do"
	alipaySandboxGateway    = "https://openapi-sandbox.dl.alipaydev.com/gateway.do"
	alipayNotifyPath        = "/api/alipay/notify"
	alipayReturnPath        = "/api/alipay/return"
	alipayOrderKindTopUp    = "topup"
	alipayOrderKindSub      = "subscription"
)

var (
	errAlipayOrderNotFound          = errors.New("Alipay order not found")
	alipayMaxPaymentAmount          = decimal.NewFromInt(100000000)
	alipayPollOnce                  sync.Once
	alipayPollRunning               atomic.Bool
	alipayConfigValidation          alipayConfigValidationCache
	alipayConfigSaveMu              sync.Mutex
	alipayTopUpPollingCursor        alipayPollingCursor
	alipaySubscriptionPollingCursor alipayPollingCursor
)

type alipayConfigValidationCache struct {
	mu          sync.Mutex
	initialized bool
	fingerprint [sha256.Size]byte
	err         error
}

type alipayPollingCursor struct {
	CreateTime int64
	ID         int
}

type alipayPollingCandidate struct {
	ID         int
	TradeNo    string
	CreateTime int64
}

type alipayRefundEvidence struct {
	RefundAmount       float64
	ProviderRefundNo   string
	ProviderRefundedAt string
}

type AlipayDirectConfig = setting.AlipayDirectConfig

type AlipayDirectOrder struct {
	TradeNo         string  `json:"trade_no"`
	PayURL          string  `json:"pay_url,omitempty"`
	Status          string  `json:"status"`
	Kind            string  `json:"kind"`
	Amount          float64 `json:"amount"`
	Money           float64 `json:"money"`
	PaymentMethod   string  `json:"payment_method"`
	PaymentProvider string  `json:"payment_provider"`
}

type alipayLocalOrder struct {
	TradeNo         string
	ProviderTradeNo string
	UserID          int
	Kind            string
	Status          string
	Amount          float64
	Money           float64
}

type alipayTradeQueryResponse struct {
	Code        string `json:"code"`
	Msg         string `json:"msg"`
	SubCode     string `json:"sub_code"`
	SubMsg      string `json:"sub_msg"`
	TradeNo     string `json:"trade_no"`
	OutTradeNo  string `json:"out_trade_no"`
	TradeStatus string `json:"trade_status"`
	TotalAmount string `json:"total_amount"`
	SellerID    string `json:"seller_id"`
}

func AlipayDirectGateway() string {
	return alipayDirectGateway(setting.GetAlipayDirectConfig())
}

func alipayDirectGateway(config setting.AlipayDirectConfig) string {
	if config.Sandbox {
		return alipaySandboxGateway
	}
	return alipayProductionGateway
}

func IsAlipayDirectConfigured() bool {
	return validateAlipayConfiguration(setting.GetAlipayDirectConfig()) == nil
}

func hasAlipayDirectConfiguration(config setting.AlipayDirectConfig) bool {
	return strings.TrimSpace(config.AppID) != "" &&
		strings.TrimSpace(config.SellerID) != "" &&
		strings.TrimSpace(config.PrivateKey) != "" &&
		strings.TrimSpace(config.PlatformPublicKey) != ""
}

func SaveAlipayDirectConfig(config AlipayDirectConfig) error {
	alipayConfigSaveMu.Lock()
	defer alipayConfigSaveMu.Unlock()
	if config.Enabled && !operation_setting.IsPaymentComplianceConfirmed() {
		return errors.New("启用支付宝支付前必须先确认支付合规条款")
	}

	current := setting.GetAlipayDirectConfig()
	privateKey := strings.TrimSpace(config.PrivateKey)
	if privateKey == "" {
		privateKey = current.PrivateKey
	}
	platformPublicKey := strings.TrimSpace(config.PlatformPublicKey)
	if platformPublicKey == "" {
		platformPublicKey = current.PlatformPublicKey
	}
	config.PrivateKey = privateKey
	config.PlatformPublicKey = platformPublicKey
	if config.Enabled {
		if err := validateAlipayConfigurationValues(
			config.AppID, config.SellerID, privateKey, platformPublicKey,
			resolveAlipayNotifyURL(config), resolveAlipayReturnURL(config), config.MinTopUp,
		); err != nil {
			return err
		}
	}

	return model.UpdateOptionsBulk(setting.AlipayDirectConfigToOptions(config))
}

func IsAlipayDirectTopUpEnabled() bool {
	return isAlipayDirectTopUpEnabled(setting.GetAlipayDirectConfig())
}

func isAlipayDirectTopUpEnabled(config setting.AlipayDirectConfig) bool {
	if !operation_setting.IsPaymentComplianceConfirmed() {
		return false
	}
	return config.Enabled && validateAlipayConfiguration(config) == nil
}

func GetAlipayDirectMinTopUp() float64 {
	return getAlipayDirectMinTopUp(setting.GetAlipayDirectConfig())
}

func getAlipayDirectMinTopUp(config setting.AlipayDirectConfig) float64 {
	minTopUp := config.MinTopUp
	if minTopUp <= 0 {
		minTopUp = 1
	}
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		minTopUp, _ = decimal.NewFromFloat(minTopUp).
			Mul(decimal.NewFromFloat(common.QuotaPerUnit)).Float64()
	}
	return minTopUp
}

func CreateAlipayDirectTopUpOrder(ctx context.Context, userID int, amount float64) (*AlipayDirectOrder, error) {
	config := setting.GetAlipayDirectConfig()
	canonicalAmount, err := NormalizePaymentTopUpAmount(amount)
	if err != nil {
		return nil, err
	}
	amount = canonicalAmount
	if !isAlipayDirectTopUpEnabled(config) {
		return nil, errors.New("支付宝官方支付未配置或未启用")
	}
	if userID <= 0 || amount < getAlipayDirectMinTopUp(config) {
		return nil, errors.New("充值数量无效")
	}
	group, err := model.GetUserGroup(userID, true)
	if err != nil {
		return nil, fmt.Errorf("获取用户分组失败: %w", err)
	}
	paymentAmount, err := calculateAlipayDirectMoney(amount, group)
	if err != nil {
		return nil, err
	}
	storedAmount := int64(operation_setting.DisplayAmountToQuota(amount))
	if storedAmount <= 0 {
		return nil, errors.New("充值额度无效")
	}

	tradeNo := fmt.Sprintf("ALIUSR%dNO%s%d", userID, common.GetRandomString(6), time.Now().UnixNano())
	payURL, err := createAlipayPagePayURL(config, tradeNo, paymentAmount, "API wallet top-up", resolveAlipayNotifyURL(config), resolveAlipayReturnURL(config))
	if err != nil {
		return nil, err
	}
	storedMoney, _ := paymentAmount.Float64()
	topUp := &model.TopUp{
		UserId:          userID,
		Amount:          storedAmount,
		DisplayAmount:   amount,
		Money:           storedMoney,
		TradeNo:         tradeNo,
		Currency:        "CNY",
		PaymentMethod:   model.PaymentMethodAlipay,
		PaymentProvider: model.PaymentProviderAlipayDirect,
		CreateTime:      common.GetTimestamp(),
		Status:          common.TopUpStatusPending,
	}
	if err := topUp.Insert(); err != nil {
		return nil, fmt.Errorf("创建支付宝充值订单失败: %w", err)
	}
	logger.LogInfo(ctx, fmt.Sprintf("支付宝官方充值订单已创建 user_id=%d trade_no=%s amount=%.2f money=%s", userID, tradeNo, amount, paymentAmount.StringFixed(2)))
	return alipayDirectOrderFromLocal(&alipayLocalOrder{
		TradeNo: tradeNo, UserID: userID, Kind: alipayOrderKindTopUp,
		Status: common.TopUpStatusPending, Amount: amount, Money: storedMoney,
	}, payURL), nil
}

func CreateAlipayDirectSubscriptionOrder(ctx context.Context, userID int, planID int) (*AlipayDirectOrder, error) {
	config := setting.GetAlipayDirectConfig()
	if !isAlipayDirectTopUpEnabled(config) {
		return nil, errors.New("支付宝官方支付未配置或未启用")
	}
	if userID <= 0 || planID <= 0 {
		return nil, errors.New("参数错误")
	}
	plan, err := model.GetSubscriptionPlanById(planID)
	if err != nil {
		return nil, err
	}
	if !plan.Enabled {
		return nil, errors.New("套餐未启用")
	}
	if strings.ToUpper(strings.TrimSpace(plan.Currency)) != "CNY" {
		return nil, errors.New("支付宝仅支持以 CNY 定价的套餐")
	}
	if plan.MaxPurchasePerUser > 0 {
		count, err := model.CountUserSubscriptionsByPlan(userID, plan.Id)
		if err != nil {
			return nil, err
		}
		if count >= int64(plan.MaxPurchasePerUser) {
			return nil, errors.New("已达到该套餐购买上限")
		}
	}
	paymentAmount, err := normalizeAlipayMoney(plan.PriceAmount)
	if err != nil {
		return nil, err
	}

	tradeNo := fmt.Sprintf("ALISUBUSR%dNO%s%d", userID, common.GetRandomString(6), time.Now().UnixNano())
	payURL, err := createAlipayPagePayURL(config, tradeNo, paymentAmount, "API subscription", resolveAlipayNotifyURL(config), resolveAlipayReturnURL(config))
	if err != nil {
		return nil, err
	}
	storedMoney, _ := paymentAmount.Float64()
	order := &model.SubscriptionOrder{
		UserId:          userID,
		PlanId:          plan.Id,
		Money:           storedMoney,
		TradeNo:         tradeNo,
		PaymentMethod:   model.PaymentMethodAlipay,
		PaymentProvider: model.PaymentProviderAlipayDirect,
		CreateTime:      common.GetTimestamp(),
		Status:          common.TopUpStatusPending,
	}
	if err := order.Insert(); err != nil {
		return nil, fmt.Errorf("创建支付宝订阅订单失败: %w", err)
	}
	logger.LogInfo(ctx, fmt.Sprintf("支付宝官方订阅订单已创建 user_id=%d trade_no=%s plan_id=%d money=%s", userID, tradeNo, plan.Id, paymentAmount.StringFixed(2)))
	return alipayDirectOrderFromLocal(&alipayLocalOrder{
		TradeNo: tradeNo, UserID: userID, Kind: alipayOrderKindSub,
		Status: common.TopUpStatusPending, Money: storedMoney,
	}, payURL), nil
}

func createAlipayPagePayURL(config setting.AlipayDirectConfig, tradeNo string, amount decimal.Decimal, subject string, notifyURL string, returnURL string) (string, error) {
	if err := validateAlipayConfiguration(config); err != nil {
		return "", err
	}
	if err := validatePaymentCallbackURL(notifyURL); err != nil {
		return "", fmt.Errorf("支付宝异步通知地址无效: %w", err)
	}
	if err := validatePaymentCallbackURL(returnURL); err != nil {
		return "", fmt.Errorf("支付宝同步返回地址无效: %w", err)
	}
	bizContent, err := common.Marshal(map[string]any{
		"out_trade_no":    tradeNo,
		"product_code":    "FAST_INSTANT_TRADE_PAY",
		"total_amount":    amount.StringFixed(2),
		"subject":         subject,
		"timeout_express": "30m",
	})
	if err != nil {
		return "", fmt.Errorf("编码支付宝订单失败: %w", err)
	}
	params := alipayCommonParams(config, "alipay.trade.page.pay")
	params.Set("notify_url", notifyURL)
	params.Set("return_url", returnURL)
	params.Set("biz_content", string(bizContent))
	if err := signAlipayValues(params, config.PrivateKey); err != nil {
		return "", fmt.Errorf("支付宝订单签名失败: %w", err)
	}
	return alipayDirectGateway(config) + "?" + params.Encode(), nil
}

func HandleAlipayDirectNotification(ctx context.Context, params map[string]string, callerIP string) error {
	config := setting.GetAlipayDirectConfig()
	if err := validateAlipayConfiguration(config); err != nil {
		return errors.New("支付宝官方支付未配置")
	}
	if err := verifyAlipayDirectParams(params, config.PlatformPublicKey); err != nil {
		return err
	}
	if strings.TrimSpace(params["app_id"]) != strings.TrimSpace(config.AppID) {
		return errors.New("支付宝通知 app_id 不匹配")
	}
	if authAppID := strings.TrimSpace(params["auth_app_id"]); authAppID != "" && authAppID != strings.TrimSpace(config.AppID) {
		return errors.New("支付宝通知 auth_app_id 不匹配")
	}
	callbackSellerID := strings.TrimSpace(params["seller_id"])
	if callbackSellerID != "" && callbackSellerID != strings.TrimSpace(config.SellerID) {
		return errors.New("支付宝通知 seller_id 不匹配")
	}

	tradeNo := strings.TrimSpace(params["out_trade_no"])
	if tradeNo == "" {
		return errors.New("支付宝通知缺少 out_trade_no")
	}
	local, err := loadAlipayLocalOrder(tradeNo)
	if err != nil {
		return err
	}
	if err := validateAlipayAmount(local.Money, params["total_amount"]); err != nil {
		return err
	}
	refundEvidence, err := parseAlipayRefundEvidence(params)
	if err != nil {
		return err
	}
	if callbackSellerID == "" {
		queryCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		order, err := queryAndCompleteAlipayDirectOrderWithRefund(
			queryCtx, config, tradeNo, callerIP, strings.TrimSpace(params["trade_no"]), refundEvidence,
		)
		cancel()
		if err != nil {
			return err
		}
		if order.Status != common.TopUpStatusSuccess && order.Status != common.TopUpStatusExpired {
			return errors.New("支付宝主动查单尚未确认交易终态")
		}
		return nil
	}

	tradeStatus := strings.TrimSpace(params["trade_status"])
	if refundEvidence != nil && local.Status == common.TopUpStatusSuccess {
		_, err := recordAlipayRefundReview(local, params["trade_no"], tradeStatus, "webhook", refundEvidence)
		return err
	}
	switch tradeStatus {
	case "TRADE_SUCCESS", "TRADE_FINISHED":
		if strings.TrimSpace(params["trade_no"]) == "" {
			return errors.New("支付宝成功通知缺少 trade_no")
		}
		if err := completeAlipayLocalOrder(local, params["trade_no"], tradeStatus, params["total_amount"], callerIP); err != nil {
			return err
		}
		if refundEvidence == nil {
			return nil
		}
		completed, err := loadAlipayLocalOrder(local.TradeNo)
		if err != nil {
			return err
		}
		_, err = recordAlipayRefundReview(completed, params["trade_no"], tradeStatus, "webhook", refundEvidence)
		return err
	case "TRADE_CLOSED":
		_, err := handleAlipayTradeClosed(local, params["trade_no"], "webhook", refundEvidence)
		return err
	case "WAIT_BUYER_PAY":
		return nil
	default:
		return fmt.Errorf("支付宝通知交易状态无效: %s", tradeStatus)
	}
}

func QueryAndCompleteAlipayDirectOrder(ctx context.Context, tradeNo string, callerIP string) (*AlipayDirectOrder, error) {
	return queryAndCompleteAlipayDirectOrder(ctx, setting.GetAlipayDirectConfig(), tradeNo, callerIP)
}

func queryAndCompleteAlipayDirectOrder(ctx context.Context, config setting.AlipayDirectConfig, tradeNo string, callerIP string) (*AlipayDirectOrder, error) {
	return queryAndCompleteAlipayDirectOrderWithRefund(ctx, config, tradeNo, callerIP, "", nil)
}

func queryAndCompleteAlipayDirectOrderWithRefund(ctx context.Context, config setting.AlipayDirectConfig, tradeNo string, callerIP string, notifiedProviderTradeNo string, refundEvidence *alipayRefundEvidence) (*AlipayDirectOrder, error) {
	if err := validateAlipayConfiguration(config); err != nil {
		return nil, errors.New("支付宝官方支付未配置")
	}
	local, err := loadAlipayLocalOrder(strings.TrimSpace(tradeNo))
	if err != nil {
		return nil, err
	}
	if local.Status == common.TopUpStatusFailed {
		return alipayDirectOrderFromLocal(local, ""), nil
	}

	queryResponse, err := queryAlipayTrade(ctx, config, local.TradeNo)
	if err != nil {
		return nil, err
	}
	if queryResponse == nil {
		if refundEvidence != nil {
			return nil, errors.New("支付宝查单未确认退款所属交易")
		}
		return alipayDirectOrderFromLocal(local, ""), nil
	}
	if strings.TrimSpace(queryResponse.OutTradeNo) != local.TradeNo {
		return nil, errors.New("支付宝查单返回的 out_trade_no 不匹配")
	}
	if err := validateAlipayAmount(local.Money, queryResponse.TotalAmount); err != nil {
		return nil, err
	}
	if queryResponse.SellerID != "" && strings.TrimSpace(queryResponse.SellerID) != strings.TrimSpace(config.SellerID) {
		return nil, errors.New("支付宝查单返回的 seller_id 不匹配")
	}
	if refundEvidence != nil {
		queryProviderTradeNo := strings.TrimSpace(queryResponse.TradeNo)
		if notifiedProviderTradeNo == "" || queryProviderTradeNo == "" || strings.TrimSpace(notifiedProviderTradeNo) != queryProviderTradeNo {
			return nil, model.ErrProviderTradeMismatch
		}
	}
	if refundEvidence != nil && local.Status == common.TopUpStatusSuccess {
		if _, err := recordAlipayRefundReview(local, notifiedProviderTradeNo, queryResponse.TradeStatus, "webhook", refundEvidence); err != nil {
			return nil, err
		}
		return alipayDirectOrderFromLocal(local, ""), nil
	}

	switch strings.TrimSpace(queryResponse.TradeStatus) {
	case "TRADE_SUCCESS", "TRADE_FINISHED":
		if strings.TrimSpace(queryResponse.TradeNo) == "" {
			return nil, errors.New("支付宝查单成功响应缺少 trade_no")
		}
		if err := completeAlipayLocalOrder(local, queryResponse.TradeNo, queryResponse.TradeStatus, queryResponse.TotalAmount, callerIP); err != nil {
			return nil, err
		}
		local.Status = common.TopUpStatusSuccess
		if refundEvidence != nil {
			if _, err := recordAlipayRefundReview(local, notifiedProviderTradeNo, queryResponse.TradeStatus, "webhook", refundEvidence); err != nil {
				return nil, err
			}
		}
	case "TRADE_CLOSED":
		source := "query"
		providerTradeNo := queryResponse.TradeNo
		if refundEvidence != nil {
			source = "webhook"
			providerTradeNo = notifiedProviderTradeNo
		}
		reviewed, err := handleAlipayTradeClosed(local, providerTradeNo, source, refundEvidence)
		if err != nil {
			return nil, err
		}
		if reviewed {
			local.Status = common.TopUpStatusSuccess
		} else {
			local.Status = common.TopUpStatusExpired
		}
	case "WAIT_BUYER_PAY":
	default:
		return nil, fmt.Errorf("支付宝查单返回未知交易状态: %s", queryResponse.TradeStatus)
	}
	return alipayDirectOrderFromLocal(local, ""), nil
}

func ProcessAlipayDirectReturn(ctx context.Context, params map[string]string, callerIP string) (*AlipayDirectOrder, error) {
	config := setting.GetAlipayDirectConfig()
	if err := validateAlipayConfiguration(config); err != nil {
		return nil, errors.New("支付宝官方支付未配置")
	}
	if err := verifyAlipayDirectParams(params, config.PlatformPublicKey); err != nil {
		return nil, err
	}
	if strings.TrimSpace(params["app_id"]) != strings.TrimSpace(config.AppID) {
		return nil, errors.New("支付宝同步返回 app_id 不匹配")
	}
	if authAppID := strings.TrimSpace(params["auth_app_id"]); authAppID != "" && authAppID != strings.TrimSpace(config.AppID) {
		return nil, errors.New("支付宝同步返回 auth_app_id 不匹配")
	}
	if sellerID := strings.TrimSpace(params["seller_id"]); sellerID != "" && sellerID != strings.TrimSpace(config.SellerID) {
		return nil, errors.New("支付宝同步返回 seller_id 不匹配")
	}
	tradeNo := strings.TrimSpace(params["out_trade_no"])
	if tradeNo == "" {
		return nil, errors.New("支付宝同步返回缺少 out_trade_no")
	}
	return queryAndCompleteAlipayDirectOrder(ctx, config, tradeNo, callerIP)
}

func GetAlipayDirectOrderForUser(tradeNo string, userID int) (*AlipayDirectOrder, error) {
	local, err := loadAlipayLocalOrder(strings.TrimSpace(tradeNo))
	if err != nil {
		return nil, err
	}
	if userID <= 0 || local.UserID != userID {
		return nil, errAlipayOrderNotFound
	}
	return alipayDirectOrderFromLocal(local, ""), nil
}

func queryAlipayTrade(ctx context.Context, config setting.AlipayDirectConfig, tradeNo string) (*alipayTradeQueryResponse, error) {
	bizContent, err := common.Marshal(map[string]string{"out_trade_no": tradeNo})
	if err != nil {
		return nil, err
	}
	params := alipayCommonParams(config, "alipay.trade.query")
	params.Set("biz_content", string(bizContent))
	if err := signAlipayValues(params, config.PrivateKey); err != nil {
		return nil, fmt.Errorf("支付宝查单签名失败: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, alipayDirectGateway(config), strings.NewReader(params.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded;charset=utf-8")
	client := GetHttpClient()
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("支付宝查单请求失败: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("读取支付宝查单响应失败: %w", err)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("支付宝查单返回 HTTP %d", resp.StatusCode)
	}

	var envelope map[string]json.RawMessage
	if err := common.Unmarshal(body, &envelope); err != nil {
		return nil, errors.New("支付宝查单返回无效 JSON")
	}
	rawResponse, ok := envelope["alipay_trade_query_response"]
	if !ok || len(bytes.TrimSpace(rawResponse)) == 0 {
		return nil, errors.New("支付宝查单响应缺少业务数据")
	}
	var signature string
	if rawSign, ok := envelope["sign"]; ok {
		if err := common.Unmarshal(rawSign, &signature); err != nil {
			return nil, errors.New("支付宝查单响应签名格式无效")
		}
	}
	if signature == "" {
		return nil, errors.New("支付宝查单响应缺少签名")
	}
	if err := verifyAlipaySignature(rawResponse, signature, config.PlatformPublicKey); err != nil {
		return nil, fmt.Errorf("支付宝查单响应验签失败: %w", err)
	}

	var result alipayTradeQueryResponse
	if err := common.Unmarshal(rawResponse, &result); err != nil {
		return nil, errors.New("支付宝查单业务响应格式无效")
	}
	if result.Code != "10000" {
		if result.SubCode == "ACQ.TRADE_NOT_EXIST" {
			return nil, nil
		}
		return nil, fmt.Errorf("支付宝查单失败: code=%s sub_code=%s", result.Code, result.SubCode)
	}
	return &result, nil
}

func completeAlipayLocalOrder(local *alipayLocalOrder, providerTradeNo string, tradeStatus string, paidMoney string, callerIP string) error {
	if local == nil {
		return errAlipayOrderNotFound
	}
	switch local.Kind {
	case alipayOrderKindTopUp:
		return model.CompleteAlipayDirectTopUp(local.TradeNo, providerTradeNo, paidMoney, callerIP)
	case alipayOrderKindSub:
		payload, err := common.Marshal(map[string]string{
			"trade_no":     strings.TrimSpace(providerTradeNo),
			"trade_status": strings.TrimSpace(tradeStatus),
		})
		if err != nil {
			return err
		}
		return model.CompleteAlipayDirectSubscriptionOrder(local.TradeNo, string(payload), paidMoney)
	default:
		return errAlipayOrderNotFound
	}
}

// handleAlipayTradeClosed persists a manual refund review for already-paid
// orders. Pending orders are closed with a CAS and never auto-refunded.
// The boolean result reports whether a refund review was recorded.
func handleAlipayTradeClosed(local *alipayLocalOrder, providerTradeNo string, source string, refundEvidence *alipayRefundEvidence) (bool, error) {
	if local == nil {
		return false, errAlipayOrderNotFound
	}
	current, err := loadAlipayLocalOrder(local.TradeNo)
	if err != nil {
		return false, err
	}
	if current.Status == common.TopUpStatusSuccess {
		return recordAlipayRefundReview(current, providerTradeNo, "TRADE_CLOSED", source, refundEvidence)
	}
	if current.Status == common.TopUpStatusExpired || current.Status == common.TopUpStatusFailed {
		return false, nil
	}
	if current.Status != common.TopUpStatusPending {
		return false, fmt.Errorf("支付宝订单无法关闭: trade_no=%s status=%s", current.TradeNo, current.Status)
	}

	switch current.Kind {
	case alipayOrderKindTopUp:
		err = model.UpdatePendingTopUpStatus(current.TradeNo, model.PaymentProviderAlipayDirect, common.TopUpStatusExpired)
	case alipayOrderKindSub:
		err = model.ExpireSubscriptionOrder(current.TradeNo, model.PaymentProviderAlipayDirect)
	default:
		return false, errAlipayOrderNotFound
	}
	if err == nil {
		return false, nil
	}
	if !errors.Is(err, model.ErrTopUpStatusInvalid) && !errors.Is(err, model.ErrSubscriptionOrderStatusInvalid) {
		return false, err
	}

	latest, loadErr := loadAlipayLocalOrder(current.TradeNo)
	if loadErr != nil {
		return false, loadErr
	}
	if latest.Status == common.TopUpStatusSuccess {
		return handleAlipayTradeClosed(latest, providerTradeNo, source, refundEvidence)
	}
	if latest.Status == common.TopUpStatusExpired {
		return false, nil
	}
	return false, err
}

func recordAlipayRefundReview(local *alipayLocalOrder, providerTradeNo string, providerStatus string, source string, evidence *alipayRefundEvidence) (bool, error) {
	if local == nil || local.Status != common.TopUpStatusSuccess {
		return false, errAlipayOrderNotFound
	}
	providerTradeNo = strings.TrimSpace(providerTradeNo)
	if providerTradeNo == "" || local.ProviderTradeNo == "" || local.ProviderTradeNo != providerTradeNo {
		return false, model.ErrProviderTradeMismatch
	}

	input := model.PaymentRefundReviewInput{
		PaymentProvider: model.PaymentProviderAlipayDirect,
		LocalTradeNo:    local.TradeNo,
		ProviderTradeNo: providerTradeNo,
		OrderKind:       local.Kind,
		UserId:          local.UserID,
		Amount:          local.Money,
		Currency:        "CNY",
		ProviderStatus:  strings.TrimSpace(providerStatus),
		Source:          source,
	}
	if strings.TrimSpace(providerStatus) == "TRADE_CLOSED" {
		input.RefundAmount = decimal.NewFromFloat(local.Money).Round(2).InexactFloat64()
	}
	if evidence != nil {
		if decimal.NewFromFloat(evidence.RefundAmount).GreaterThan(decimal.NewFromFloat(local.Money).Round(2)) {
			return false, errors.New("支付宝退款金额超过原订单金额")
		}
		if evidence.RefundAmount > input.RefundAmount {
			input.RefundAmount = evidence.RefundAmount
		}
		input.ProviderRefundNo = evidence.ProviderRefundNo
		input.ProviderRefundedAt = evidence.ProviderRefundedAt
	}
	review, err := model.UpsertPaymentRefundReview(input)
	if err != nil {
		return false, fmt.Errorf("支付宝退款复核记录落库失败: %w", err)
	}
	logger.LogError(context.Background(), fmt.Sprintf(
		"高优先级支付退款复核: review_id=%d trade_no=%s kind=%s user_id=%d amount=%.2f refund_amount=%.2f notifications=%d",
		review.Id, local.TradeNo, local.Kind, local.UserID, local.Money, review.RefundAmount, review.NotificationCount,
	))
	return true, nil
}

func loadAlipayLocalOrder(tradeNo string) (*alipayLocalOrder, error) {
	if tradeNo == "" {
		return nil, errAlipayOrderNotFound
	}
	if subscriptionOrder := model.GetSubscriptionOrderByTradeNo(tradeNo); subscriptionOrder != nil {
		if subscriptionOrder.PaymentProvider != model.PaymentProviderAlipayDirect {
			return nil, model.ErrPaymentMethodMismatch
		}
		return &alipayLocalOrder{
			TradeNo:         subscriptionOrder.TradeNo,
			ProviderTradeNo: alipayProviderTradeNoFromPayload(subscriptionOrder.ProviderPayload),
			UserID:          subscriptionOrder.UserId,
			Kind:            alipayOrderKindSub,
			Status:          subscriptionOrder.Status,
			Money:           subscriptionOrder.Money,
		}, nil
	}
	if topUp := model.GetTopUpByTradeNo(tradeNo); topUp != nil {
		if topUp.PaymentProvider != model.PaymentProviderAlipayDirect {
			return nil, model.ErrPaymentMethodMismatch
		}
		return &alipayLocalOrder{
			TradeNo:         topUp.TradeNo,
			ProviderTradeNo: topUp.ProviderTradeNo,
			UserID:          topUp.UserId,
			Kind:            alipayOrderKindTopUp,
			Status:          topUp.Status,
			Amount:          topUp.DisplayAmount,
			Money:           topUp.Money,
		}, nil
	}
	return nil, errAlipayOrderNotFound
}

func alipayProviderTradeNoFromPayload(payload string) string {
	if strings.TrimSpace(payload) == "" {
		return ""
	}
	var data map[string]string
	if err := common.UnmarshalJsonStr(payload, &data); err != nil {
		return ""
	}
	return strings.TrimSpace(data["trade_no"])
}

func alipayDirectOrderFromLocal(local *alipayLocalOrder, payURL string) *AlipayDirectOrder {
	return &AlipayDirectOrder{
		TradeNo:         local.TradeNo,
		PayURL:          payURL,
		Status:          local.Status,
		Kind:            local.Kind,
		Amount:          local.Amount,
		Money:           local.Money,
		PaymentMethod:   model.PaymentMethodAlipay,
		PaymentProvider: model.PaymentProviderAlipayDirect,
	}
}

func normalizeAlipayMoney(money float64) (decimal.Decimal, error) {
	amount := decimal.NewFromFloat(money).Round(2)
	if amount.LessThan(decimal.NewFromFloat(0.01)) {
		return decimal.Zero, errors.New("支付金额不能低于 0.01 CNY")
	}
	if amount.GreaterThan(alipayMaxPaymentAmount) {
		return decimal.Zero, errors.New("支付金额不能超过 100000000 CNY")
	}
	return amount, nil
}

func GetAlipayDirectMoney(amount float64, group string) (float64, error) {
	paymentAmount, err := calculateAlipayDirectMoney(amount, group)
	if err != nil {
		return 0, err
	}
	return paymentAmount.InexactFloat64(), nil
}

func calculateAlipayDirectMoney(amount float64, group string) (decimal.Decimal, error) {
	canonicalAmount, err := NormalizePaymentTopUpAmount(amount)
	if err != nil {
		return decimal.Zero, err
	}
	amount = canonicalAmount
	topupGroupRatio := common.GetTopupGroupRatio(group)
	if topupGroupRatio == 0 {
		topupGroupRatio = 1
	}
	discount := 1.0
	if configured, ok := operation_setting.GetPaymentSetting().AmountDiscount[int(amount)]; ok && configured > 0 {
		discount = configured
	}
	rawMoney := decimal.NewFromFloat(operation_setting.DisplayAmountToUSD(amount)).
		Mul(decimal.NewFromFloat(operation_setting.Price)).
		Mul(decimal.NewFromFloat(topupGroupRatio)).
		Mul(decimal.NewFromFloat(discount))
	return normalizeAlipayMoney(rawMoney.InexactFloat64())
}

func validateAlipayAmount(expectedMoney float64, actual string) error {
	expected, err := normalizeAlipayMoney(expectedMoney)
	if err != nil {
		return err
	}
	actualAmount, err := decimal.NewFromString(strings.TrimSpace(actual))
	if err != nil || actualAmount.LessThan(decimal.NewFromFloat(0.01)) {
		return errors.New("支付宝返回的交易金额无效")
	}
	if !actualAmount.Equal(expected) {
		return fmt.Errorf("支付宝交易金额不匹配: expected=%s actual=%s", expected.StringFixed(2), actualAmount.String())
	}
	return nil
}

func parseAlipayRefundEvidence(params map[string]string) (*alipayRefundEvidence, error) {
	refundFee := strings.TrimSpace(params["refund_fee"])
	providerRefundNo := strings.TrimSpace(params["out_biz_no"])
	providerRefundedAt := strings.TrimSpace(params["gmt_refund"])
	evidence := &alipayRefundEvidence{
		ProviderRefundNo:   providerRefundNo,
		ProviderRefundedAt: providerRefundedAt,
	}
	hasEvidence := providerRefundNo != "" && providerRefundedAt != ""
	if refundFee != "" {
		amount, err := decimal.NewFromString(refundFee)
		if err != nil || amount.IsNegative() {
			return nil, errors.New("支付宝退款金额无效")
		}
		if amount.IsPositive() {
			evidence.RefundAmount = amount.InexactFloat64()
			hasEvidence = true
		}
	}
	if !hasEvidence {
		return nil, nil
	}
	return evidence, nil
}

func resolveAlipayNotifyURL(config setting.AlipayDirectConfig) string {
	if configured := strings.TrimSpace(config.NotifyURL); configured != "" {
		return configured
	}
	return strings.TrimRight(GetCallbackAddress(), "/") + alipayNotifyPath
}

func resolveAlipayReturnURL(config setting.AlipayDirectConfig) string {
	if configured := strings.TrimSpace(config.ReturnURL); configured != "" {
		return configured
	}
	return strings.TrimRight(GetCallbackAddress(), "/") + alipayReturnPath
}

func validatePaymentCallbackURL(rawURL string) error {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return err
	}
	if parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return errors.New("必须是完整的 HTTP(S) URL")
	}
	if parsed.User != nil || parsed.Fragment != "" {
		return errors.New("URL 不能包含用户凭据或片段")
	}
	return nil
}

func validateAlipayConfiguration(config setting.AlipayDirectConfig) error {
	fingerprint := alipayConfigurationFingerprint(config)
	alipayConfigValidation.mu.Lock()
	defer alipayConfigValidation.mu.Unlock()
	if alipayConfigValidation.initialized && alipayConfigValidation.fingerprint == fingerprint {
		return alipayConfigValidation.err
	}

	err := validateAlipayConfigurationUncached(config)
	alipayConfigValidation.initialized = true
	alipayConfigValidation.fingerprint = fingerprint
	alipayConfigValidation.err = err
	return err
}

func validateAlipayConfigurationUncached(config setting.AlipayDirectConfig) error {
	return validateAlipayConfigurationValues(
		config.AppID,
		config.SellerID,
		config.PrivateKey,
		config.PlatformPublicKey,
		resolveAlipayNotifyURL(config),
		resolveAlipayReturnURL(config),
		config.MinTopUp,
	)
}

func validateAlipayConfigurationValues(appID string, sellerID string, privateKeyRaw string, publicKeyRaw string, notifyURL string, returnURL string, minTopUp float64) error {
	if strings.TrimSpace(appID) == "" || strings.TrimSpace(sellerID) == "" || strings.TrimSpace(privateKeyRaw) == "" || strings.TrimSpace(publicKeyRaw) == "" {
		return errors.New("支付宝 AppID、SellerID 或 RSA2 密钥未完整配置")
	}
	if !isAlipayNumericID(appID) {
		return errors.New("支付宝 AppID 必须是 16 位数字")
	}
	if !isAlipayNumericID(sellerID) || !strings.HasPrefix(strings.TrimSpace(sellerID), "2088") {
		return errors.New("支付宝 SellerID 必须是 2088 开头的 16 位数字")
	}
	privateKey, err := parseAlipayPrivateKey(privateKeyRaw)
	if err != nil {
		return fmt.Errorf("支付宝应用私钥无效: %w", err)
	}
	if privateKey.N.BitLen() < 2048 {
		return errors.New("支付宝应用私钥必须至少为 2048 位 RSA 密钥")
	}
	publicKey, err := parseAlipayPublicKey(publicKeyRaw)
	if err != nil {
		return fmt.Errorf("支付宝平台公钥无效: %w", err)
	}
	if publicKey.N.BitLen() < 2048 {
		return errors.New("支付宝平台公钥必须至少为 2048 位 RSA 密钥")
	}
	if err := validatePaymentCallbackURL(notifyURL); err != nil {
		return fmt.Errorf("支付宝异步通知地址无效: %w", err)
	}
	if err := validatePaymentCallbackURL(returnURL); err != nil {
		return fmt.Errorf("支付宝同步返回地址无效: %w", err)
	}
	if minTopUp < 0.01 {
		return errors.New("支付宝最低充值数量不能低于 0.01")
	}
	return nil
}

func alipayConfigurationFingerprint(config setting.AlipayDirectConfig) [sha256.Size]byte {
	hasher := sha256.New()
	values := []string{
		strings.TrimSpace(config.AppID),
		strings.TrimSpace(config.SellerID),
		strings.TrimSpace(config.PrivateKey),
		strings.TrimSpace(config.PlatformPublicKey),
		resolveAlipayNotifyURL(config),
		resolveAlipayReturnURL(config),
		strconv.FormatFloat(config.MinTopUp, 'f', -1, 64),
	}
	for _, value := range values {
		_, _ = io.WriteString(hasher, value)
		_, _ = hasher.Write([]byte{0})
	}
	var fingerprint [sha256.Size]byte
	copy(fingerprint[:], hasher.Sum(nil))
	return fingerprint
}

func isAlipayNumericID(value string) bool {
	value = strings.TrimSpace(value)
	if len(value) != 16 {
		return false
	}
	for _, char := range value {
		if char < '0' || char > '9' {
			return false
		}
	}
	return true
}

func alipayCommonParams(config setting.AlipayDirectConfig, method string) url.Values {
	params := make(url.Values)
	params.Set("app_id", strings.TrimSpace(config.AppID))
	params.Set("method", method)
	params.Set("format", "JSON")
	params.Set("charset", "utf-8")
	params.Set("sign_type", "RSA2")
	params.Set("timestamp", time.Now().In(time.FixedZone("CST", 8*60*60)).Format("2006-01-02 15:04:05"))
	params.Set("version", "1.0")
	return params
}

func SignAlipayDirectParams(params map[string]string, privateKey string) (string, error) {
	return signAlipayContent(canonicalAlipayRequestParams(params), privateKey)
}

func signAlipayContent(canonical string, privateKey string) (string, error) {
	key, err := parseAlipayPrivateKey(privateKey)
	if err != nil {
		return "", err
	}
	digest := sha256.Sum256([]byte(canonical))
	signature, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest[:])
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(signature), nil
}

func VerifyAlipayDirectParams(params map[string]string) error {
	config := setting.GetAlipayDirectConfig()
	return verifyAlipayDirectParams(params, config.PlatformPublicKey)
}

func verifyAlipayDirectParams(params map[string]string, platformPublicKey string) error {
	signature := strings.TrimSpace(params["sign"])
	if signature == "" {
		return errors.New("支付宝参数缺少签名")
	}
	return verifyAlipaySignature([]byte(canonicalAlipayNotificationParams(params)), signature, platformPublicKey)
}

func signAlipayValues(values url.Values, privateKey string) error {
	params := make(map[string]string, len(values))
	for key := range values {
		params[key] = values.Get(key)
	}
	signature, err := SignAlipayDirectParams(params, privateKey)
	if err != nil {
		return err
	}
	values.Set("sign", signature)
	return nil
}

func canonicalAlipayRequestParams(params map[string]string) string {
	return canonicalAlipayParams(params, false)
}

func canonicalAlipayNotificationParams(params map[string]string) string {
	return canonicalAlipayParams(params, true)
}

func canonicalAlipayParams(params map[string]string, excludeSignType bool) string {
	keys := make([]string, 0, len(params))
	for key, value := range params {
		if key == "sign" || (excludeSignType && key == "sign_type") || value == "" {
			continue
		}
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, key+"="+params[key])
	}
	return strings.Join(parts, "&")
}

func verifyAlipaySignature(content []byte, signature string, publicKey string) error {
	key, err := parseAlipayPublicKey(publicKey)
	if err != nil {
		return err
	}
	decodedSignature, err := base64.StdEncoding.DecodeString(strings.TrimSpace(signature))
	if err != nil {
		return errors.New("签名不是有效的 Base64")
	}
	digest := sha256.Sum256(content)
	if err := rsa.VerifyPKCS1v15(key, crypto.SHA256, digest[:], decodedSignature); err != nil {
		return errors.New("RSA2 签名无效")
	}
	return nil
}

func parseAlipayPrivateKey(raw string) (*rsa.PrivateKey, error) {
	block, err := decodeAlipayPEM(raw, "PRIVATE KEY")
	if err != nil {
		return nil, err
	}
	if key, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		if rsaKey, ok := key.(*rsa.PrivateKey); ok {
			return rsaKey, nil
		}
		return nil, errors.New("私钥不是 RSA 私钥")
	}
	if key, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return key, nil
	}
	return nil, errors.New("仅支持 PKCS#8 或 PKCS#1 RSA 私钥")
}

func parseAlipayPublicKey(raw string) (*rsa.PublicKey, error) {
	block, err := decodeAlipayPEM(raw, "PUBLIC KEY")
	if err != nil {
		return nil, err
	}
	if key, err := x509.ParsePKIXPublicKey(block.Bytes); err == nil {
		if rsaKey, ok := key.(*rsa.PublicKey); ok {
			return rsaKey, nil
		}
		return nil, errors.New("平台公钥不是 RSA 公钥")
	}
	if key, err := x509.ParsePKCS1PublicKey(block.Bytes); err == nil {
		return key, nil
	}
	return nil, errors.New("支付宝平台公钥格式无效")
}

func decodeAlipayPEM(raw string, pemType string) (*pem.Block, error) {
	trimmed := strings.TrimSpace(strings.ReplaceAll(raw, `\n`, "\n"))
	if trimmed == "" {
		return nil, errors.New("密钥为空")
	}
	if !strings.Contains(trimmed, "-----BEGIN") {
		trimmed = "-----BEGIN " + pemType + "-----\n" + trimmed + "\n-----END " + pemType + "-----"
	}
	block, _ := pem.Decode([]byte(trimmed))
	if block == nil {
		return nil, errors.New("密钥 PEM 格式无效")
	}
	return block, nil
}

func StartAlipayDirectOrderPollingTask() {
	alipayPollOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		gopool.Go(func() {
			ticker := time.NewTicker(2 * time.Minute)
			defer ticker.Stop()
			for range ticker.C {
				runAlipayDirectOrderPollingOnce()
			}
		})
	})
}

func runAlipayDirectOrderPollingOnce() {
	if !IsAlipayDirectConfigured() || !alipayPollRunning.CompareAndSwap(false, true) {
		return
	}
	defer alipayPollRunning.Store(false)

	readyBefore := common.GetTimestamp() - 15
	topUps, nextTopUpCursor, err := loadAlipayTopUpPollingBatch(readyBefore, 10, alipayTopUpPollingCursor)
	if err != nil {
		logger.LogWarn(context.Background(), "支付宝补偿任务读取充值订单失败: "+err.Error())
		return
	}
	alipayTopUpPollingCursor = nextTopUpCursor
	subscriptions, nextSubscriptionCursor, err := loadAlipaySubscriptionPollingBatch(readyBefore, 10, alipaySubscriptionPollingCursor)
	if err != nil {
		logger.LogWarn(context.Background(), "支付宝补偿任务读取订阅订单失败: "+err.Error())
		return
	}
	alipaySubscriptionPollingCursor = nextSubscriptionCursor

	tradeNos := make([]string, 0, len(topUps)+len(subscriptions))
	for _, candidate := range topUps {
		tradeNos = append(tradeNos, candidate.TradeNo)
	}
	for _, candidate := range subscriptions {
		tradeNos = append(tradeNos, candidate.TradeNo)
	}

	for _, tradeNo := range tradeNos {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		_, err := QueryAndCompleteAlipayDirectOrder(ctx, tradeNo, "alipay-polling")
		cancel()
		if err != nil {
			logger.LogWarn(context.Background(), fmt.Sprintf("支付宝补偿查单失败 trade_no=%s error=%q", tradeNo, err.Error()))
		}
	}
}

func loadAlipayTopUpPollingBatch(readyBefore int64, limit int, cursor alipayPollingCursor) ([]alipayPollingCandidate, alipayPollingCursor, error) {
	load := func(activeCursor alipayPollingCursor) ([]alipayPollingCandidate, error) {
		query := model.DB.Model(&model.TopUp{}).
			Select("id", "trade_no", "create_time").
			Where("status = ? AND payment_provider = ? AND create_time <= ?", common.TopUpStatusPending, model.PaymentProviderAlipayDirect, readyBefore)
		if activeCursor.ID > 0 {
			query = query.Where("(create_time > ?) OR (create_time = ? AND id > ?)", activeCursor.CreateTime, activeCursor.CreateTime, activeCursor.ID)
		}
		var candidates []alipayPollingCandidate
		err := query.Order("create_time asc, id asc").Limit(limit).Scan(&candidates).Error
		return candidates, err
	}
	return loadAlipayPollingBatchWithWrap(load, cursor)
}

func loadAlipaySubscriptionPollingBatch(readyBefore int64, limit int, cursor alipayPollingCursor) ([]alipayPollingCandidate, alipayPollingCursor, error) {
	load := func(activeCursor alipayPollingCursor) ([]alipayPollingCandidate, error) {
		query := model.DB.Model(&model.SubscriptionOrder{}).
			Select("id", "trade_no", "create_time").
			Where("status = ? AND payment_provider = ? AND create_time <= ?", common.TopUpStatusPending, model.PaymentProviderAlipayDirect, readyBefore)
		if activeCursor.ID > 0 {
			query = query.Where("(create_time > ?) OR (create_time = ? AND id > ?)", activeCursor.CreateTime, activeCursor.CreateTime, activeCursor.ID)
		}
		var candidates []alipayPollingCandidate
		err := query.Order("create_time asc, id asc").Limit(limit).Scan(&candidates).Error
		return candidates, err
	}
	return loadAlipayPollingBatchWithWrap(load, cursor)
}

func loadAlipayPollingBatchWithWrap(load func(alipayPollingCursor) ([]alipayPollingCandidate, error), cursor alipayPollingCursor) ([]alipayPollingCandidate, alipayPollingCursor, error) {
	candidates, err := load(cursor)
	if err != nil {
		return nil, cursor, err
	}
	if len(candidates) == 0 && cursor.ID > 0 {
		cursor = alipayPollingCursor{}
		candidates, err = load(cursor)
		if err != nil {
			return nil, cursor, err
		}
	}
	if len(candidates) == 0 {
		return candidates, alipayPollingCursor{}, nil
	}
	last := candidates[len(candidates)-1]
	return candidates, alipayPollingCursor{CreateTime: last.CreateTime, ID: last.ID}, nil
}
