package service

import (
	"context"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
)

// XPayOrder XPay 风格的订单结构
type XPayOrder struct {
	TradeNo       string  `json:"trade_no"`
	OutTradeNo    string  `json:"out_trade_no"`
	Amount        float64 `json:"amount"`
	PaymentMethod string  `json:"payment_method"`
	Status        string  `json:"status"`
	CreatedAt     int64   `json:"created_at"`
	PaidAt        int64   `json:"paid_at,omitempty"`
	Email         string  `json:"email,omitempty"`
}

// CreateXPayOrder 创建 XPay 风格的订单
func CreateXPayOrder(ctx context.Context, userID int, amount float64, paymentMethod string) (*XPayOrder, error) {
	// 生成订单号
	tradeNo := fmt.Sprintf("XP%d%s%d", userID, common.GetRandomString(6), time.Now().Unix())

	// 获取用户信息
	user, err := model.GetUserById(userID, false)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}

	// 计算配额
	quotaAmount := int64(amount * common.QuotaPerUnit)

	// 创建充值记录
	topUp := &model.TopUp{
		UserId:          userID,
		Amount:          quotaAmount,
		Money:           amount,
		TradeNo:         tradeNo,
		PaymentMethod:   paymentMethod,
		PaymentProvider: "xpay",
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}

	if err := topUp.Insert(); err != nil {
		return nil, fmt.Errorf("failed to create order: %w", err)
	}

	// 发送邮件通知（如果配置了 SMTP）
	if common.SMTPServer != "" && user.Email != "" {
		go sendPaymentNotification(user.Email, tradeNo, amount, paymentMethod)
	}

	logger.LogInfo(ctx, fmt.Sprintf("XPay 订单创建成功 user_id=%d trade_no=%s amount=%.2f method=%s",
		userID, tradeNo, amount, paymentMethod))

	return &XPayOrder{
		TradeNo:       tradeNo,
		OutTradeNo:    tradeNo,
		Amount:        amount,
		PaymentMethod: paymentMethod,
		Status:        "pending",
		CreatedAt:     time.Now().Unix(),
		Email:         user.Email,
	}, nil
}

// sendPaymentNotification 发送支付通知邮件
func sendPaymentNotification(email, tradeNo string, amount float64, method string) {
	subject := fmt.Sprintf("[SynthAPI] 新的支付订单 - %s", tradeNo)
	content := fmt.Sprintf(`
<h2>新的支付订单</h2>
<p><strong>订单号：</strong>%s</p>
<p><strong>金额：</strong>%.2f</p>
<p><strong>支付方式：</strong>%s</p>
<p><strong>时间：</strong>%s</p>
<hr>
<p>请在收到用户付款后，在管理后台确认此订单。</p>
<p><a href="%s/admin/topup">前往管理后台</a></p>
`, tradeNo, amount, method, time.Now().Format("2006-01-02 15:04:05"),
		system_setting.ServerAddress)

	if err := common.SendEmail(subject, email, content); err != nil {
		logger.LogError(context.Background(), fmt.Sprintf("发送支付通知邮件失败: %v", err))
	}
}

// ConfirmXPayOrder 确认 XPay 订单（管理员操作）
func ConfirmXPayOrder(tradeNo string, adminID int) error {
	// 获取订单
	topUp := model.GetTopUpByTradeNo(tradeNo)
	if topUp == nil {
		return fmt.Errorf("order not found: %s", tradeNo)
	}

	if topUp.Status != common.TopUpStatusPending {
		return fmt.Errorf("order already processed: %s", topUp.Status)
	}

	// 确认订单
	topUp.Status = common.TopUpStatusSuccess
	topUp.CompleteTime = time.Now().Unix()

	if err := topUp.Update(); err != nil {
		return fmt.Errorf("failed to update order: %w", err)
	}

	// 增加用户配额
	if err := model.IncreaseUserQuota(topUp.UserId, int(topUp.Amount), false); err != nil {
		return fmt.Errorf("failed to increase user quota: %w", err)
	}

	logger.LogInfo(context.Background(), fmt.Sprintf("XPay 订单确认成功 trade_no=%s user_id=%d amount=%d admin_id=%d",
		tradeNo, topUp.UserId, topUp.Amount, adminID))

	return nil
}

// GetXPayOrderStatus 获取订单状态
func GetXPayOrderStatus(tradeNo string) (*XPayOrder, error) {
	topUp := model.GetTopUpByTradeNo(tradeNo)
	if topUp == nil {
		return nil, fmt.Errorf("order not found: %s", tradeNo)
	}

	status := "pending"
	if topUp.Status == common.TopUpStatusSuccess {
		status = "paid"
	} else if topUp.Status == common.TopUpStatusExpired {
		status = "expired"
	}

	return &XPayOrder{
		TradeNo:       topUp.TradeNo,
		OutTradeNo:    topUp.TradeNo,
		Amount:        topUp.Money,
		PaymentMethod: topUp.PaymentMethod,
		Status:        status,
		CreatedAt:     topUp.CreateTime,
		PaidAt:        topUp.CompleteTime,
	}, nil
}

// GetUserXPayOrders 获取用户的 XPay 订单列表
func GetUserXPayOrders(userID int, page, pageSize int) ([]XPayOrder, int, error) {
	topUps, total, err := model.GetUserTopUps(userID, &common.PageInfo{
		Page:     page,
		PageSize: pageSize,
	})
	if err != nil {
		return nil, 0, err
	}

	orders := make([]XPayOrder, len(topUps))
	for i, topUp := range topUps {
		status := "pending"
		if topUp.Status == common.TopUpStatusSuccess {
			status = "paid"
		} else if topUp.Status == common.TopUpStatusExpired {
			status = "expired"
		}

		orders[i] = XPayOrder{
			TradeNo:       topUp.TradeNo,
			OutTradeNo:    topUp.TradeNo,
			Amount:        topUp.Money,
			PaymentMethod: topUp.PaymentMethod,
			Status:        status,
			CreatedAt:     topUp.CreateTime,
			PaidAt:        topUp.CompleteTime,
		}
	}

	return orders, int(total), nil
}
