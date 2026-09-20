package service

import (
	"context"
	"fmt"
	"log"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
)

// PaymentNotification 支付通知结构
type PaymentNotification struct {
	Platform  string  `json:"platform"`  // alipay, wechat, unionpay
	Amount    float64 `json:"amount"`    // 支付金额
	TradeNo   string  `json:"trade_no"`  // 交易号
	Payer     string  `json:"payer"`     // 付款人
	Timestamp int64   `json:"timestamp"` // 时间戳
	RawText   string  `json:"raw_text"`  // 原始通知文本
}

// PaymentListener 支付通知监听器
type PaymentListener struct {
	notifications chan PaymentNotification
	running       bool
	mu            sync.Mutex
}

var globalListener *PaymentListener

func init() {
	globalListener = &PaymentListener{
		notifications: make(chan PaymentNotification, 100),
	}
}

// GetPaymentListener 获取全局支付监听器
func GetPaymentListener() *PaymentListener {
	return globalListener
}

// Start 启动监听器
func (pl *PaymentListener) Start() {
	pl.mu.Lock()
	defer pl.mu.Unlock()

	if pl.running {
		return
	}

	pl.running = true
	go pl.processNotifications()

	logger.LogInfo(context.Background(), "支付通知监听器已启动")
}

// Stop 停止监听器
func (pl *PaymentListener) Stop() {
	pl.mu.Lock()
	defer pl.mu.Unlock()

	pl.running = false
	close(pl.notifications)

	logger.LogInfo(context.Background(), "支付通知监听器已停止")
}

// SubmitNotification 提交支付通知
func (pl *PaymentListener) SubmitNotification(notification PaymentNotification) {
	if !pl.running {
		pl.Start()
	}

	pl.notifications <- notification
}

// processNotifications 处理支付通知
func (pl *PaymentListener) processNotifications() {
	for notification := range pl.notifications {
		pl.handleNotification(notification)
	}
}

// handleNotification 处理单个支付通知
func (pl *PaymentListener) handleNotification(notification PaymentNotification) {
	logger.LogInfo(context.Background(), fmt.Sprintf(
		"收到支付通知: platform=%s amount=%.2f trade_no=%s payer=%s",
		notification.Platform, notification.Amount, notification.TradeNo, notification.Payer,
	))

	// 尝试匹配待支付订单
	matched := pl.matchPendingOrder(notification)
	if matched {
		logger.LogInfo(context.Background(), fmt.Sprintf(
			"支付通知已匹配: trade_no=%s amount=%.2f",
			notification.TradeNo, notification.Amount,
		))
	} else {
		logger.LogWarn(context.Background(), fmt.Sprintf(
			"支付通知未匹配: platform=%s amount=%.2f",
			notification.Platform, notification.Amount,
		))
	}
}

// matchPendingOrder 匹配待支付订单
func (pl *PaymentListener) matchPendingOrder(notification PaymentNotification) bool {
	// 获取所有待支付订单
	pendingOrders := model.GetAllPendingTopUps()

	for _, order := range pendingOrders {
		// 检查金额是否匹配（允许小误差）
		if pl.amountMatches(order.Money, notification.Amount) {
			// 检查支付方式是否匹配
			if pl.paymentMethodMatches(order.PaymentMethod, notification.Platform) {
				// 自动确认订单
				if err := ConfirmXPayOrder(order.TradeNo, notification.Amount, "payment-listener"); err != nil {
					logger.LogError(context.Background(), fmt.Sprintf(
						"自动确认订单失败: trade_no=%s error=%v",
						order.TradeNo, err,
					))
				} else {
					return true
				}
			}
		}
	}

	return false
}

// amountMatches 检查金额是否匹配
func (pl *PaymentListener) amountMatches(expected, actual float64) bool {
	diff := expected - actual
	if diff < 0 {
		diff = -diff
	}
	return diff < 0.01 // 允许 0.01 的误差
}

// paymentMethodMatches 检查支付方式是否匹配
func (pl *PaymentListener) paymentMethodMatches(expected, actual string) bool {
	expected = strings.ToLower(expected)
	actual = strings.ToLower(actual)

	// 支付方式映射
	methodMap := map[string][]string{
		"alipay":   {"alipay", "支付宝", "zhifubao"},
		"wechat":   {"wechat", "wxpay", "微信", "weixin"},
		"unionpay": {"unionpay", "云闪付", "yinlian"},
		"qq":       {"qqpay", "qq", "qq钱包"},
	}

	for _, aliases := range methodMap {
		if pl.containsAlias(expected, aliases) && pl.containsAlias(actual, aliases) {
			return true
		}
	}

	return false
}

// containsAlias 检查是否包含别名
func (pl *PaymentListener) containsAlias(s string, aliases []string) bool {
	for _, alias := range aliases {
		if strings.Contains(s, alias) {
			return true
		}
	}
	return false
}

// ParsePaymentNotification 解析支付通知文本
func ParsePaymentNotification(text string) (*PaymentNotification, error) {
	// 尝试解析支付宝通知
	if notification := parseAlipayNotification(text); notification != nil {
		return notification, nil
	}

	// 尝试解析微信通知
	if notification := parseWechatNotification(text); notification != nil {
		return notification, nil
	}

	// 尝试解析通用格式
	if notification := parseGenericNotification(text); notification != nil {
		return notification, nil
	}

	return nil, fmt.Errorf("无法解析支付通知: %s", text)
}

// parseAlipayNotification 解析支付宝通知
func parseAlipayNotification(text string) *PaymentNotification {
	// 支付宝收款通知格式:
	// "支付宝成功收款 ¥10.00"
	// "You received ¥10.00 via Alipay"

	patterns := []string{
		`收款[^\d]*([\d.]+)`,
		`received[^\d]*([\d.]+)`,
		`Payment received[^\d]*([\d.]+)`,
	}

	for _, pattern := range patterns {
		re := regexp.MustCompile(pattern)
		matches := re.FindStringSubmatch(text)
		if len(matches) > 1 {
			amount, err := strconv.ParseFloat(matches[1], 64)
			if err == nil {
				return &PaymentNotification{
					Platform:  "alipay",
					Amount:    amount,
					Timestamp: time.Now().Unix(),
					RawText:   text,
				}
			}
		}
	}

	return nil
}

// parseWechatNotification 解析微信通知
func parseWechatNotification(text string) *PaymentNotification {
	// 微信收款通知格式:
	// "微信支付收款 ¥10.00"
	// "WeChat Pay received ¥10.00"

	patterns := []string{
		`微信支付[^\d]*([\d.]+)`,
		`WeChat Pay[^\d]*([\d.]+)`,
		`收款[^\d]*([\d.]+)`,
	}

	for _, pattern := range patterns {
		re := regexp.MustCompile(pattern)
		matches := re.FindStringSubmatch(text)
		if len(matches) > 1 {
			amount, err := strconv.ParseFloat(matches[1], 64)
			if err == nil {
				return &PaymentNotification{
					Platform:  "wechat",
					Amount:    amount,
					Timestamp: time.Now().Unix(),
					RawText:   text,
				}
			}
		}
	}

	return nil
}

// parseGenericNotification 解析通用通知
func parseGenericNotification(text string) *PaymentNotification {
	// 通用格式: 包含金额的任何通知
	re := regexp.MustCompile(`([\d.]+)\s*(?:元|¥|CNY|USD)`)
	matches := re.FindStringSubmatch(text)
	if len(matches) > 1 {
		amount, err := strconv.ParseFloat(matches[1], 64)
		if err == nil {
			return &PaymentNotification{
				Platform:  "unknown",
				Amount:    amount,
				Timestamp: time.Now().Unix(),
				RawText:   text,
			}
		}
	}

	return nil
}

// LogPaymentNotification 记录支付通知（用于调试）
func LogPaymentNotification(notification PaymentNotification) {
	log.Printf("[Payment Notification] Platform: %s, Amount: %.2f, TradeNo: %s, Payer: %s",
		notification.Platform,
		notification.Amount,
		notification.TradeNo,
		notification.Payer,
	)
}
