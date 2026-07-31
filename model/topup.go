package model

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type TopUp struct {
	Id              int     `json:"id"`
	UserId          int     `json:"user_id" gorm:"index"`
	Amount          int64   `json:"amount"`
	DisplayAmount   float64 `json:"display_amount"`
	Money           float64 `json:"money"`
	TradeNo         string  `json:"trade_no" gorm:"unique;type:varchar(255);index"`
	ProviderTradeNo string  `json:"provider_trade_no" gorm:"type:varchar(128);index"`
	Currency        string  `json:"currency" gorm:"type:varchar(8);default:''"`
	PaymentMethod   string  `json:"payment_method" gorm:"type:varchar(50)"`
	PaymentProvider string  `json:"payment_provider" gorm:"type:varchar(50);default:''"`
	CreateTime      int64   `json:"create_time"`
	CompleteTime    int64   `json:"complete_time"`
	Status          string  `json:"status"`
}

const (
	PaymentMethodStripe       = "stripe"
	PaymentMethodCreem        = "creem"
	PaymentMethodWaffo        = "waffo"
	PaymentMethodWaffoPancake = "waffo_pancake"
	PaymentMethodXPay         = "xpay"
	PaymentMethodMPay         = "mpay"
	PaymentMethodAlipay       = "alipay"
	PaymentMethodWechat       = "wxpay"
	PaymentMethodBalance      = "balance"
	PaymentMethodRedemption   = "redemption"
)

const (
	PaymentProviderEpay         = "epay"
	PaymentProviderStripe       = "stripe"
	PaymentProviderCreem        = "creem"
	PaymentProviderWaffo        = "waffo"
	PaymentProviderWaffoPancake = "waffo_pancake"
	PaymentProviderXPay         = "xpay"
	PaymentProviderMPay         = "mpay"
	PaymentProviderAlipayDirect = "alipay_direct"
	PaymentProviderBalance      = "balance"
	PaymentProviderRedemption   = "redemption"
)

var (
	ErrPaymentMethodMismatch   = errors.New("payment method mismatch")
	ErrPaymentAmountMismatch   = errors.New("payment amount mismatch")
	ErrProviderTradeMismatch   = errors.New("provider trade number mismatch")
	ErrTopUpNotFound           = errors.New("topup not found")
	ErrTopUpStatusInvalid      = errors.New("topup status invalid")
	errPaymentOrderCASConflict = errors.New("payment order changed concurrently")
)

func (topUp *TopUp) Insert() error {
	var err error
	err = DB.Create(topUp).Error
	return err
}

func (topUp *TopUp) Update() error {
	var err error
	err = DB.Save(topUp).Error
	return err
}

func quotaFromTopUpDisplayAmount(amount int64) int {
	return operation_setting.DisplayAmountToQuota(float64(amount))
}

func quotaFromStoredTopUp(topUp *TopUp) int {
	if topUp == nil {
		return 0
	}

	switch topUp.PaymentProvider {
	case PaymentProviderStripe:
		dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
		return int(decimal.NewFromFloat(topUp.Money).Mul(dQuotaPerUnit).IntPart())
	case PaymentProviderMPay, PaymentProviderXPay, PaymentProviderAlipayDirect:
		return int(topUp.Amount)
	default:
		return quotaFromTopUpDisplayAmount(topUp.Amount)
	}
}

func GetTopUpById(id int) *TopUp {
	var topUp *TopUp
	var err error
	err = DB.Where("id = ?", id).First(&topUp).Error
	if err != nil {
		return nil
	}
	return topUp
}

func GetTopUpByTradeNo(tradeNo string) *TopUp {
	var topUp *TopUp
	var err error
	err = DB.Where("trade_no = ?", tradeNo).First(&topUp).Error
	if err != nil {
		return nil
	}
	return topUp
}

func UpdatePendingTopUpStatus(tradeNo string, expectedPaymentProvider string, targetStatus string) error {
	if tradeNo == "" {
		return errors.New("未提供支付单号")
	}
	if targetStatus == "" {
		return errors.New("未提供目标状态")
	}

	updates := map[string]interface{}{"status": targetStatus}
	if targetStatus == common.TopUpStatusExpired || targetStatus == common.TopUpStatusFailed {
		updates["complete_time"] = common.GetTimestamp()
	}
	query := DB.Model(&TopUp{}).
		Where("trade_no = ? AND status = ?", tradeNo, common.TopUpStatusPending)
	if expectedPaymentProvider != "" {
		query = query.Where("payment_provider = ?", expectedPaymentProvider)
	}
	result := query.Updates(updates)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 1 {
		return nil
	}

	current := GetTopUpByTradeNo(tradeNo)
	if current == nil {
		return ErrTopUpNotFound
	}
	if expectedPaymentProvider != "" && current.PaymentProvider != expectedPaymentProvider {
		return ErrPaymentMethodMismatch
	}
	if current.Status == targetStatus {
		return nil
	}
	return ErrTopUpStatusInvalid
}

func Recharge(referenceId string, customerId string, callerIp string) (err error) {
	if referenceId == "" {
		return errors.New("未提供支付单号")
	}

	var quota float64
	topUp := &TopUp{}

	refCol := "`trade_no`"
	if common.UsingPostgreSQL {
		refCol = `"trade_no"`
	}

	err = DB.Transaction(func(tx *gorm.DB) error {
		err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", referenceId).First(topUp).Error
		if err != nil {
			return errors.New("充值订单不存在")
		}

		if topUp.PaymentProvider != PaymentProviderStripe {
			return ErrPaymentMethodMismatch
		}

		if topUp.Status != common.TopUpStatusPending {
			return errors.New("充值订单状态错误")
		}

		topUp.CompleteTime = common.GetTimestamp()
		topUp.Status = common.TopUpStatusSuccess
		err = tx.Save(topUp).Error
		if err != nil {
			return err
		}

		quota = topUp.Money * common.QuotaPerUnit
		err = tx.Model(&User{}).Where("id = ?", topUp.UserId).Updates(map[string]interface{}{"stripe_customer": customerId, "quota": gorm.Expr("quota + ?", quota)}).Error
		if err != nil {
			return err
		}
		if err := ClearWalletLowQuotaNotifyStateIfRecoveredTx(tx, topUp.UserId); err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		common.SysError("topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}

	RecordPaymentLog(topUp.UserId,
		fmt.Sprintf("使用在线充值成功，充值金额: %v，支付金额：%d", logger.FormatQuota(int(quota)), topUp.Amount),
		PaymentAuditInfo{
			Event:                 "topup_completed",
			Source:                "webhook",
			TradeNo:               topUp.TradeNo,
			ProviderTradeNo:       topUp.ProviderTradeNo,
			PaymentMethod:         topUp.PaymentMethod,
			PaymentProvider:       PaymentProviderStripe,
			CallbackPaymentMethod: PaymentMethodStripe,
			CallerIp:              callerIp,
		})

	return nil
}

// topUpQueryWindowSeconds 限制充值记录查询的时间窗口（秒）。
const topUpQueryWindowSeconds int64 = 30 * 24 * 60 * 60

// topUpQueryCutoff 返回允许查询的最早 create_time（秒级 Unix 时间戳）。
func topUpQueryCutoff() int64 {
	return common.GetTimestamp() - topUpQueryWindowSeconds
}

func GetUserTopUps(userId int, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	// Start transaction
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	cutoff := topUpQueryCutoff()

	// Get total count within transaction
	err = tx.Model(&TopUp{}).Where("user_id = ? AND create_time >= ?", userId, cutoff).Count(&total).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	// Get paginated topups within same transaction
	err = tx.Where("user_id = ? AND create_time >= ?", userId, cutoff).Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	// Commit transaction
	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return topups, total, nil
}

// GetAllTopUps 获取全平台的充值记录（管理员使用，不限制时间窗口）
func GetAllTopUps(pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err = tx.Model(&TopUp{}).Count(&total).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return topups, total, nil
}

// GetAllPendingTopUps 获取所有待支付的充值记录（用于支付通知匹配）
func GetAllPendingTopUps() []*TopUp {
	var topUps []*TopUp
	DB.Where("status = ?", common.TopUpStatusPending).Find(&topUps)
	return topUps
}

// searchTopUpCountHardLimit 搜索充值记录时 COUNT 的安全上限，
// 防止对超大表执行无界 COUNT 触发 DoS。
const searchTopUpCountHardLimit = 10000

// SearchUserTopUps 按订单号搜索某用户的充值记录
func SearchUserTopUps(userId int, keyword string, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	query := tx.Model(&TopUp{}).Where("user_id = ? AND create_time >= ?", userId, topUpQueryCutoff())
	if keyword != "" {
		pattern, perr := sanitizeLikePattern(keyword)
		if perr != nil {
			tx.Rollback()
			return nil, 0, perr
		}
		query = query.Where("trade_no LIKE ? ESCAPE '!'", pattern)
	}

	if err = query.Limit(searchTopUpCountHardLimit).Count(&total).Error; err != nil {
		tx.Rollback()
		common.SysError("failed to count search topups: " + err.Error())
		return nil, 0, errors.New("搜索充值记录失败")
	}

	if err = query.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error; err != nil {
		tx.Rollback()
		common.SysError("failed to search topups: " + err.Error())
		return nil, 0, errors.New("搜索充值记录失败")
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}
	return topups, total, nil
}

// SearchAllTopUps 按订单号搜索全平台充值记录（管理员使用，不限制时间窗口）
func SearchAllTopUps(keyword string, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	query := tx.Model(&TopUp{})
	if keyword != "" {
		pattern, perr := sanitizeLikePattern(keyword)
		if perr != nil {
			tx.Rollback()
			return nil, 0, perr
		}
		query = query.Where("trade_no LIKE ? ESCAPE '!'", pattern)
	}

	if err = query.Limit(searchTopUpCountHardLimit).Count(&total).Error; err != nil {
		tx.Rollback()
		common.SysError("failed to count search topups: " + err.Error())
		return nil, 0, errors.New("搜索充值记录失败")
	}

	if err = query.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error; err != nil {
		tx.Rollback()
		common.SysError("failed to search topups: " + err.Error())
		return nil, 0, errors.New("搜索充值记录失败")
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}
	return topups, total, nil
}

// ManualCompleteTopUp 管理员手动完成订单并给用户充值
func ManualCompleteTopUp(tradeNo string, callerIp string) error {
	if tradeNo == "" {
		return errors.New("未提供订单号")
	}

	refCol := "`trade_no`"
	if common.UsingPostgreSQL {
		refCol = `"trade_no"`
	}

	var userId int
	var quotaToAdd int
	var payMoney float64
	var paymentMethod string
	var paymentProvider string
	var providerTradeNo string

	err := DB.Transaction(func(tx *gorm.DB) error {
		topUp := &TopUp{}
		// 行级锁，避免并发补单
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", tradeNo).First(topUp).Error; err != nil {
			return errors.New("充值订单不存在")
		}

		// 幂等处理：已成功直接返回
		if topUp.Status == common.TopUpStatusSuccess {
			return nil
		}

		if topUp.Status != common.TopUpStatusPending {
			return errors.New("订单状态不是待支付，无法补单")
		}

		quotaToAdd = quotaFromStoredTopUp(topUp)
		if quotaToAdd <= 0 {
			return errors.New("无效的充值额度")
		}

		// 标记完成
		topUp.CompleteTime = common.GetTimestamp()
		topUp.Status = common.TopUpStatusSuccess
		if err := tx.Save(topUp).Error; err != nil {
			return err
		}

		// 增加用户额度（立即写库，保持一致性）
		if err := tx.Model(&User{}).Where("id = ?", topUp.UserId).Update("quota", gorm.Expr("quota + ?", quotaToAdd)).Error; err != nil {
			return err
		}
		if err := ClearWalletLowQuotaNotifyStateIfRecoveredTx(tx, topUp.UserId); err != nil {
			return err
		}

		userId = topUp.UserId
		payMoney = topUp.Money
		paymentMethod = topUp.PaymentMethod
		paymentProvider = topUp.PaymentProvider
		providerTradeNo = topUp.ProviderTradeNo
		return nil
	})

	if err != nil {
		return err
	}

	// 事务外记录日志，避免阻塞
	RecordPaymentLog(userId,
		fmt.Sprintf("管理员补单成功，充值金额: %v，支付金额：%f", logger.FormatQuota(quotaToAdd), payMoney),
		PaymentAuditInfo{
			Event:           "manual_topup_completed",
			Source:          "admin",
			TradeNo:         tradeNo,
			ProviderTradeNo: providerTradeNo,
			PaymentMethod:   paymentMethod,
			PaymentProvider: paymentProvider,
			CallerIp:        callerIp,
		})
	return nil
}

// CompleteAlipayDirectTopUp atomically marks an official Alipay order paid and
// credits the wallet. Repeated notifications are idempotent.
func CompleteAlipayDirectTopUp(tradeNo string, providerTradeNo string, paidMoney string, callerIp string) error {
	providerTradeNo = strings.TrimSpace(providerTradeNo)
	if tradeNo == "" || providerTradeNo == "" {
		return errors.New("未提供订单号")
	}

	refCol := "`trade_no`"
	if common.UsingPostgreSQL {
		refCol = `"trade_no"`
	}

	var topUp TopUp
	var quotaToAdd int
	completed := false
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where(refCol+" = ?", tradeNo).First(&topUp).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrTopUpNotFound
			}
			return err
		}
		if topUp.PaymentProvider != PaymentProviderAlipayDirect {
			return ErrPaymentMethodMismatch
		}
		if !paymentAmountMatches(topUp.Money, paidMoney) {
			return ErrPaymentAmountMismatch
		}
		if topUp.Currency != "CNY" {
			return errors.New("支付宝订单币种不是 CNY")
		}
		if topUp.Status == common.TopUpStatusSuccess {
			if topUp.ProviderTradeNo != "" && topUp.ProviderTradeNo != providerTradeNo {
				return ErrProviderTradeMismatch
			}
			return nil
		}
		if topUp.Status != common.TopUpStatusPending {
			return ErrTopUpStatusInvalid
		}

		quotaToAdd = quotaFromStoredTopUp(&topUp)
		if quotaToAdd <= 0 {
			return errors.New("无效的充值额度")
		}

		completeTime := common.GetTimestamp()
		result := tx.Model(&TopUp{}).
			Where("id = ? AND status = ? AND payment_provider = ?", topUp.Id, common.TopUpStatusPending, PaymentProviderAlipayDirect).
			Updates(map[string]interface{}{
				"provider_trade_no": providerTradeNo,
				"payment_method":    PaymentMethodAlipay,
				"status":            common.TopUpStatusSuccess,
				"complete_time":     completeTime,
			})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errPaymentOrderCASConflict
		}
		userUpdate := tx.Model(&User{}).Where("id = ?", topUp.UserId).
			Update("quota", gorm.Expr("quota + ?", quotaToAdd))
		if userUpdate.Error != nil {
			return userUpdate.Error
		}
		if userUpdate.RowsAffected != 1 {
			return errors.New("充值用户不存在")
		}
		if err := ClearWalletLowQuotaNotifyStateIfRecoveredTx(tx, topUp.UserId); err != nil {
			return err
		}
		topUp.PaymentMethod = PaymentMethodAlipay
		topUp.ProviderTradeNo = providerTradeNo
		topUp.Status = common.TopUpStatusSuccess
		topUp.CompleteTime = completeTime
		completed = true
		return nil
	})
	if errors.Is(err, errPaymentOrderCASConflict) {
		current := GetTopUpByTradeNo(tradeNo)
		if current == nil {
			return ErrTopUpNotFound
		}
		if current.PaymentProvider != PaymentProviderAlipayDirect {
			return ErrPaymentMethodMismatch
		}
		if !paymentAmountMatches(current.Money, paidMoney) {
			return ErrPaymentAmountMismatch
		}
		if current.Status == common.TopUpStatusSuccess {
			if current.ProviderTradeNo != "" && current.ProviderTradeNo != providerTradeNo {
				return ErrProviderTradeMismatch
			}
			return nil
		}
		return ErrTopUpStatusInvalid
	}
	if err != nil {
		return err
	}
	if !completed {
		return nil
	}

	if err := cacheIncrUserQuota(topUp.UserId, int64(quotaToAdd)); err != nil {
		common.SysLog("failed to increase user quota cache after Alipay topup: " + err.Error())
	}
	RecordPaymentLog(topUp.UserId,
		fmt.Sprintf("支付宝官方充值成功，充值金额: %v，支付金额: %.2f", logger.FormatQuota(quotaToAdd), topUp.Money),
		PaymentAuditInfo{
			Event:                 "topup_completed",
			Source:                "verified_completion",
			TradeNo:               topUp.TradeNo,
			ProviderTradeNo:       topUp.ProviderTradeNo,
			PaymentMethod:         PaymentMethodAlipay,
			PaymentProvider:       PaymentProviderAlipayDirect,
			CallbackPaymentMethod: PaymentMethodAlipay,
			CallerIp:              callerIp,
		})
	return nil
}

func paymentAmountMatches(expected float64, actual string) bool {
	actualAmount, err := decimal.NewFromString(strings.TrimSpace(actual))
	if err != nil {
		return false
	}
	return decimal.NewFromFloat(expected).Round(2).Equal(actualAmount)
}

func RechargeCreem(referenceId string, customerEmail string, customerName string, callerIp string) (err error) {
	if referenceId == "" {
		return errors.New("未提供支付单号")
	}

	var quota int64
	topUp := &TopUp{}

	refCol := "`trade_no`"
	if common.UsingPostgreSQL {
		refCol = `"trade_no"`
	}

	err = DB.Transaction(func(tx *gorm.DB) error {
		err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", referenceId).First(topUp).Error
		if err != nil {
			return errors.New("充值订单不存在")
		}

		if topUp.PaymentProvider != PaymentProviderCreem {
			return ErrPaymentMethodMismatch
		}

		if topUp.Status != common.TopUpStatusPending {
			return errors.New("充值订单状态错误")
		}

		topUp.CompleteTime = common.GetTimestamp()
		topUp.Status = common.TopUpStatusSuccess
		err = tx.Save(topUp).Error
		if err != nil {
			return err
		}

		// Creem 直接使用 Amount 作为充值额度（整数）
		quota = topUp.Amount

		// 构建更新字段，优先使用邮箱，如果邮箱为空则使用用户名
		updateFields := map[string]interface{}{
			"quota": gorm.Expr("quota + ?", quota),
		}

		// 如果有客户邮箱，尝试更新用户邮箱（仅当用户邮箱为空时）
		if customerEmail != "" {
			// 先检查用户当前邮箱是否为空
			var user User
			err = tx.Where("id = ?", topUp.UserId).First(&user).Error
			if err != nil {
				return err
			}

			// 如果用户邮箱为空，则更新为支付时使用的邮箱
			if user.Email == "" {
				updateFields["email"] = customerEmail
			}
		}

		err = tx.Model(&User{}).Where("id = ?", topUp.UserId).Updates(updateFields).Error
		if err != nil {
			return err
		}
		if err := ClearWalletLowQuotaNotifyStateIfRecoveredTx(tx, topUp.UserId); err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		common.SysError("creem topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}

	RecordPaymentLog(topUp.UserId,
		fmt.Sprintf("使用Creem充值成功，充值额度: %v，支付金额：%.2f", quota, topUp.Money),
		PaymentAuditInfo{
			Event:                 "topup_completed",
			Source:                "webhook",
			TradeNo:               topUp.TradeNo,
			ProviderTradeNo:       topUp.ProviderTradeNo,
			PaymentMethod:         topUp.PaymentMethod,
			PaymentProvider:       PaymentProviderCreem,
			CallbackPaymentMethod: PaymentMethodCreem,
			CallerIp:              callerIp,
		})

	return nil
}

func RechargeWaffo(tradeNo string, callerIp string) (err error) {
	if tradeNo == "" {
		return errors.New("未提供支付单号")
	}

	var quotaToAdd int
	topUp := &TopUp{}

	refCol := "`trade_no`"
	if common.UsingPostgreSQL {
		refCol = `"trade_no"`
	}

	err = DB.Transaction(func(tx *gorm.DB) error {
		err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", tradeNo).First(topUp).Error
		if err != nil {
			return errors.New("充值订单不存在")
		}

		if topUp.PaymentProvider != PaymentProviderWaffo {
			return ErrPaymentMethodMismatch
		}

		if topUp.Status == common.TopUpStatusSuccess {
			return nil // 幂等：已成功直接返回
		}

		if topUp.Status != common.TopUpStatusPending {
			return errors.New("充值订单状态错误")
		}

		quotaToAdd = quotaFromTopUpDisplayAmount(topUp.Amount)
		if quotaToAdd <= 0 {
			return errors.New("无效的充值额度")
		}

		topUp.CompleteTime = common.GetTimestamp()
		topUp.Status = common.TopUpStatusSuccess
		if err := tx.Save(topUp).Error; err != nil {
			return err
		}

		if err := tx.Model(&User{}).Where("id = ?", topUp.UserId).Update("quota", gorm.Expr("quota + ?", quotaToAdd)).Error; err != nil {
			return err
		}
		if err := ClearWalletLowQuotaNotifyStateIfRecoveredTx(tx, topUp.UserId); err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		common.SysError("waffo topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}

	if quotaToAdd > 0 {
		RecordPaymentLog(topUp.UserId,
			fmt.Sprintf("Waffo充值成功，充值额度: %v，支付金额: %.2f", logger.FormatQuota(quotaToAdd), topUp.Money),
			PaymentAuditInfo{
				Event:                 "topup_completed",
				Source:                "webhook",
				TradeNo:               topUp.TradeNo,
				ProviderTradeNo:       topUp.ProviderTradeNo,
				PaymentMethod:         topUp.PaymentMethod,
				PaymentProvider:       PaymentProviderWaffo,
				CallbackPaymentMethod: PaymentMethodWaffo,
				CallerIp:              callerIp,
			})
	}

	return nil
}

func RechargeWaffoPancake(tradeNo string, callerIp ...string) (err error) {
	if tradeNo == "" {
		return errors.New("未提供支付单号")
	}

	var quotaToAdd int
	topUp := &TopUp{}

	refCol := "`trade_no`"
	if common.UsingPostgreSQL {
		refCol = `"trade_no"`
	}

	err = DB.Transaction(func(tx *gorm.DB) error {
		err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", tradeNo).First(topUp).Error
		if err != nil {
			return errors.New("充值订单不存在")
		}

		if topUp.PaymentProvider != PaymentProviderWaffoPancake {
			return ErrPaymentMethodMismatch
		}

		if topUp.Status == common.TopUpStatusSuccess {
			return nil
		}

		if topUp.Status != common.TopUpStatusPending {
			return errors.New("充值订单状态错误")
		}

		quotaToAdd = quotaFromTopUpDisplayAmount(topUp.Amount)
		if quotaToAdd <= 0 {
			return errors.New("无效的充值额度")
		}

		topUp.CompleteTime = common.GetTimestamp()
		topUp.Status = common.TopUpStatusSuccess
		if err := tx.Save(topUp).Error; err != nil {
			return err
		}

		if err := tx.Model(&User{}).Where("id = ?", topUp.UserId).Update("quota", gorm.Expr("quota + ?", quotaToAdd)).Error; err != nil {
			return err
		}
		if err := ClearWalletLowQuotaNotifyStateIfRecoveredTx(tx, topUp.UserId); err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		common.SysError("waffo pancake topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}

	if quotaToAdd > 0 {
		callbackIp := ""
		if len(callerIp) > 0 {
			callbackIp = callerIp[0]
		}
		RecordPaymentLog(topUp.UserId,
			fmt.Sprintf("Waffo Pancake充值成功，充值额度: %v，支付金额: %.2f", logger.FormatQuota(quotaToAdd), topUp.Money),
			PaymentAuditInfo{
				Event:                 "topup_completed",
				Source:                "webhook",
				TradeNo:               topUp.TradeNo,
				ProviderTradeNo:       topUp.ProviderTradeNo,
				PaymentMethod:         topUp.PaymentMethod,
				PaymentProvider:       PaymentProviderWaffoPancake,
				CallbackPaymentMethod: PaymentMethodWaffoPancake,
				CallerIp:              callbackIp,
			})
	}

	return nil
}
