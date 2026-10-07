package service

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/shopspring/decimal"
)

// Subscriptions use the plan's CNY price, never wallet conversion or recharge promotions.
func CreateMPaySubscriptionOrder(ctx context.Context, userID, planID int) (*XPayOrder, error) {
	if !IsMPayTopUpEnabled() {
		return nil, errors.New("微信支付暂未启用")
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
	if !strings.EqualFold(strings.TrimSpace(plan.Currency), "CNY") {
		return nil, errors.New("微信支付仅支持以 CNY 定价的套餐")
	}
	money := decimal.NewFromFloat(plan.PriceAmount).Round(2)
	if money.LessThan(decimal.NewFromFloat(0.01)) {
		return nil, errors.New("套餐金额过低")
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
	storedMoney, _ := money.Float64()
	order := &model.SubscriptionOrder{
		UserId: userID, PlanId: plan.Id, Money: storedMoney,
		TradeNo:       fmt.Sprintf("MPSUBUSR%dNO%s%d", userID, common.GetRandomString(6), time.Now().UnixNano()),
		PaymentMethod: model.PaymentMethodWechat, PaymentProvider: model.PaymentProviderMPay,
		CreateTime: common.GetTimestamp(), Status: common.TopUpStatusPending,
	}
	if err := order.Insert(); err != nil {
		return nil, fmt.Errorf("创建微信订阅订单失败: %w", err)
	}
	requestCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	result, err := createRemoteMPayOrder(requestCtx, order.TradeNo, storedMoney, storedMoney,
		model.PaymentMethodWechat, "", "", "", "SynthAPI subscription: "+plan.Title)
	if err != nil {
		_ = model.ExpireSubscriptionOrder(order.TradeNo, model.PaymentProviderMPay)
		return nil, fmt.Errorf("拉起微信支付失败: %w", err)
	}
	checkoutURL, parseErr := url.Parse(result.PayURL)
	if parseErr != nil || checkoutURL.Host == "" || (checkoutURL.Scheme != "https" && checkoutURL.Scheme != "http") {
		_ = model.ExpireSubscriptionOrder(order.TradeNo, model.PaymentProviderMPay)
		return nil, errors.New("微信收银台地址无效，请联系管理员")
	}
	logger.LogInfo(ctx, fmt.Sprintf("微信订阅订单已创建 user_id=%d trade_no=%s plan_id=%d money=%s", userID, order.TradeNo, plan.Id, money.StringFixed(2)))
	return &XPayOrder{
		TradeNo: order.TradeNo, OutTradeNo: order.TradeNo, Amount: storedMoney, Money: storedMoney,
		PaymentMethod: model.PaymentMethodWechat, Status: order.Status, PayURL: result.PayURL, CreatedAt: order.CreateTime,
	}, nil
}

func validateMPaySubscriptionCallback(order *model.SubscriptionOrder, params map[string]string) error {
	if order == nil {
		return model.ErrSubscriptionOrderNotFound
	}
	if order.PaymentProvider != model.PaymentProviderMPay || order.PaymentMethod != model.PaymentMethodWechat {
		return model.ErrPaymentMethodMismatch
	}
	if strings.TrimSpace(params["pid"]) != strings.TrimSpace(setting.MPayPid) ||
		strings.TrimSpace(params["out_trade_no"]) != order.TradeNo ||
		normalizeMPayMethod(params["type"]) != model.PaymentMethodWechat ||
		strings.TrimSpace(params["trade_no"]) == "" {
		return errors.New("微信订阅回调订单、商户或支付方式不匹配")
	}
	if !IsMPayPaidStatus(params["trade_status"]) {
		return errors.New("微信订阅尚未支付成功")
	}
	money, err := decimal.NewFromString(strings.TrimSpace(params["money"]))
	if err != nil || !money.IsPositive() || !money.Equal(decimal.NewFromFloat(order.Money).Round(2)) {
		return model.ErrPaymentAmountMismatch
	}
	return nil
}

func ConfirmMPaySubscriptionOrder(params map[string]string, callerIP string) error {
	if !IsMPayTopUpEnabled() || !VerifyMPayCallback(params) {
		return errors.New("微信订阅回调验签失败")
	}
	tradeNo := strings.TrimSpace(params["out_trade_no"])
	order := model.GetSubscriptionOrderByTradeNo(tradeNo)
	if err := validateMPaySubscriptionCallback(order, params); err != nil {
		return err
	}
	providerTradeNo := strings.TrimSpace(params["trade_no"])
	payload, err := common.Marshal(map[string]string{"trade_no": providerTradeNo, "trade_status": params["trade_status"]})
	if err != nil {
		return err
	}
	return model.CompleteSubscriptionOrderWithAudit(tradeNo, string(payload), model.PaymentProviderMPay, model.PaymentMethodWechat,
		model.PaymentAuditInfo{Source: "webhook", ProviderTradeNo: providerTradeNo, CallerIp: callerIP,
			PaymentProvider: model.PaymentProviderMPay, CallbackPaymentMethod: model.PaymentMethodWechat}, params["money"])
}
