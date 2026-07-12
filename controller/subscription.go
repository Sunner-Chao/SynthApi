package controller

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ---- Shared types ----

type SubscriptionPlanDTO struct {
	Plan              model.SubscriptionPlan `json:"plan"`
	UpgradeGroupRatio float64                `json:"upgrade_group_ratio"`
}

type BillingPreferenceRequest struct {
	BillingPreference string `json:"billing_preference"`
}

type SubscriptionBalancePayRequest struct {
	PlanId int `json:"plan_id"`
}

type SubscriptionCancelRequest struct {
	SubscriptionId int `json:"subscription_id"`
}

type SubscriptionDeleteRequest struct {
	SubscriptionId int `json:"subscription_id"`
}

// ---- User APIs ----

func GetSubscriptionPlans(c *gin.Context) {
	if !operation_setting.IsPaymentComplianceConfirmed() {
		common.ApiSuccess(c, []SubscriptionPlanDTO{})
		return
	}

	var plans []model.SubscriptionPlan
	if err := model.DB.Where("enabled = ?", true).Order("sort_order desc, id desc").Find(&plans).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	result := make([]SubscriptionPlanDTO, 0, len(plans))
	for _, p := range plans {
		result = append(result, buildSubscriptionPlanDTO(p))
	}
	common.ApiSuccess(c, result)
}

func GetSubscriptionSelf(c *gin.Context) {
	userId := c.GetInt("id")
	settingMap, _ := model.GetUserSetting(userId, false)
	pref := common.NormalizeBillingPreference(settingMap.BillingPreference)

	// Get all subscriptions (including expired)
	allSubscriptions, err := model.GetAllUserSubscriptions(userId)
	if err != nil {
		allSubscriptions = []model.SubscriptionSummary{}
	}

	// Get active subscriptions for backward compatibility
	activeSubscriptions, err := model.GetAllActiveUserSubscriptions(userId)
	if err != nil {
		activeSubscriptions = []model.SubscriptionSummary{}
	}

	common.ApiSuccess(c, gin.H{
		"billing_preference": pref,
		"subscriptions":      activeSubscriptions, // all active subscriptions
		"all_subscriptions":  allSubscriptions,    // all subscriptions including expired
	})
}

func UpdateSubscriptionPreference(c *gin.Context) {
	userId := c.GetInt("id")
	var req BillingPreferenceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	pref := common.NormalizeBillingPreference(req.BillingPreference)

	user, err := model.GetUserById(userId, true)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	current := user.GetSetting()
	current.BillingPreference = pref
	user.SetSetting(current)
	if err := user.Update(false); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"billing_preference": pref})
}

func SubscriptionRequestBalancePay(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}

	userId := c.GetInt("id")
	var req SubscriptionBalancePayRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.PlanId <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}

	if err := model.PurchaseSubscriptionWithBalance(userId, req.PlanId); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func CancelSubscriptionSelf(c *gin.Context) {
	userId := c.GetInt("id")
	var req SubscriptionCancelRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.SubscriptionId <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	result, err := model.CancelUserSubscriptionWithRefund(userId, req.SubscriptionId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func DeleteSubscriptionSelf(c *gin.Context) {
	userId := c.GetInt("id")
	var req SubscriptionDeleteRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.SubscriptionId <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	if err := model.DeleteUserFinishedSubscriptionRecord(userId, req.SubscriptionId); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// ---- Admin APIs ----

func AdminListSubscriptionPlans(c *gin.Context) {
	var plans []model.SubscriptionPlan
	if err := model.DB.Order("sort_order desc, id desc").Find(&plans).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	result := make([]SubscriptionPlanDTO, 0, len(plans))
	for _, p := range plans {
		result = append(result, buildSubscriptionPlanDTO(p))
	}
	common.ApiSuccess(c, result)
}

func buildSubscriptionPlanDTO(plan model.SubscriptionPlan) SubscriptionPlanDTO {
	plan.NormalizeDefaults()
	return SubscriptionPlanDTO{
		Plan:              plan,
		UpgradeGroupRatio: getSubscriptionUpgradeGroupRatio(plan),
	}
}

func getSubscriptionUpgradeGroupRatio(plan model.SubscriptionPlan) float64 {
	group := strings.TrimSpace(plan.UpgradeGroup)
	if group == "" {
		return 1
	}

	discountGroup := strings.TrimSpace(plan.BillingDiscountGroup)
	topupRatios := common.GetTopupGroupRatioCopy()
	if discountGroup == group {
		if ratio, ok := topupRatios[group]; ok {
			return ratio
		}
	}

	if ratio, ok := ratio_setting.GetGroupRatioCopy()[group]; ok {
		return ratio
	}
	if ratio, ok := topupRatios[group]; ok {
		return ratio
	}
	if model.IsUnlimitedSubscriptionGroup(group) {
		return 0
	}
	return 1
}

type AdminUpsertSubscriptionPlanRequest struct {
	Plan              model.SubscriptionPlan `json:"plan"`
	UpgradeGroupRatio *float64               `json:"upgrade_group_ratio,omitempty"`
}

func AdminCreateSubscriptionPlan(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}

	var req AdminUpsertSubscriptionPlanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	req.Plan.Id = 0
	if strings.TrimSpace(req.Plan.Title) == "" {
		common.ApiErrorMsg(c, "套餐标题不能为空")
		return
	}
	if req.Plan.PriceAmount < 0 {
		common.ApiErrorMsg(c, "价格不能为负数")
		return
	}
	if req.Plan.PriceAmount > 9999 {
		common.ApiErrorMsg(c, "价格不能超过9999")
		return
	}
	req.Plan.Currency = operation_setting.GetQuotaDisplayType()
	if req.Plan.AllowBalancePay == nil {
		req.Plan.AllowBalancePay = common.GetPointer(true)
	}
	if req.Plan.DurationUnit == "" {
		req.Plan.DurationUnit = model.SubscriptionDurationMonth
	}
	if req.Plan.DurationValue <= 0 && req.Plan.DurationUnit != model.SubscriptionDurationCustom {
		req.Plan.DurationValue = 1
	}
	if req.Plan.MaxPurchasePerUser < 0 {
		common.ApiErrorMsg(c, "购买上限不能为负数")
		return
	}
	if req.Plan.TotalAmount < 0 {
		common.ApiErrorMsg(c, "总额度不能为负数")
		return
	}
	req.Plan.UpgradeGroup = strings.TrimSpace(req.Plan.UpgradeGroup)
	if req.Plan.UpgradeGroup != "" {
		if !subscriptionUpgradeGroupExists(req.Plan.UpgradeGroup) {
			common.ApiErrorMsg(c, "升级分组名称不能包含逗号、制表符或换行")
			return
		}
	}
	req.Plan.BillingDiscountGroup = strings.TrimSpace(req.Plan.BillingDiscountGroup)
	if req.Plan.BillingDiscountGroup == "" && topupGroupExists(req.Plan.UpgradeGroup) {
		req.Plan.BillingDiscountGroup = req.Plan.UpgradeGroup
	}
	if req.Plan.BillingDiscountGroup != "" {
		if !topupGroupExists(req.Plan.BillingDiscountGroup) {
			common.ApiErrorMsg(c, "折扣分组不存在")
			return
		}
	}
	if req.Plan.UpgradeGroup != "" {
		if err := syncSubscriptionUpgradeGroupRatio(req.Plan, req.UpgradeGroupRatio); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	req.Plan.BillingDiscount = model.ResolveSubscriptionBillingDiscount(req.Plan.BillingDiscountGroup, req.Plan.BillingDiscount)
	req.Plan.QuotaResetPeriod = model.NormalizeResetPeriod(req.Plan.QuotaResetPeriod)
	if req.Plan.QuotaResetPeriod == model.SubscriptionResetCustom && req.Plan.QuotaResetCustomSeconds <= 0 {
		common.ApiErrorMsg(c, "自定义重置周期需大于0秒")
		return
	}
	err := model.DB.Create(&req.Plan).Error
	if err != nil {
		common.ApiError(c, err)
		return
	}
	model.InvalidateSubscriptionPlanCache(req.Plan.Id)
	common.ApiSuccess(c, req.Plan)
}

func AdminUpdateSubscriptionPlan(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}

	id, _ := strconv.Atoi(c.Param("id"))
	if id <= 0 {
		common.ApiErrorMsg(c, "无效的ID")
		return
	}
	var req AdminUpsertSubscriptionPlanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	if strings.TrimSpace(req.Plan.Title) == "" {
		common.ApiErrorMsg(c, "套餐标题不能为空")
		return
	}
	if req.Plan.PriceAmount < 0 {
		common.ApiErrorMsg(c, "价格不能为负数")
		return
	}
	if req.Plan.PriceAmount > 9999 {
		common.ApiErrorMsg(c, "价格不能超过9999")
		return
	}
	req.Plan.Id = id
	req.Plan.Currency = operation_setting.GetQuotaDisplayType()
	if req.Plan.DurationUnit == "" {
		req.Plan.DurationUnit = model.SubscriptionDurationMonth
	}
	if req.Plan.DurationValue <= 0 && req.Plan.DurationUnit != model.SubscriptionDurationCustom {
		req.Plan.DurationValue = 1
	}
	if req.Plan.MaxPurchasePerUser < 0 {
		common.ApiErrorMsg(c, "购买上限不能为负数")
		return
	}
	if req.Plan.TotalAmount < 0 {
		common.ApiErrorMsg(c, "总额度不能为负数")
		return
	}
	req.Plan.UpgradeGroup = strings.TrimSpace(req.Plan.UpgradeGroup)
	if req.Plan.UpgradeGroup != "" {
		if !subscriptionUpgradeGroupExists(req.Plan.UpgradeGroup) {
			common.ApiErrorMsg(c, "升级分组名称不能包含逗号、制表符或换行")
			return
		}
	}
	req.Plan.BillingDiscountGroup = strings.TrimSpace(req.Plan.BillingDiscountGroup)
	if req.Plan.BillingDiscountGroup == "" && topupGroupExists(req.Plan.UpgradeGroup) {
		req.Plan.BillingDiscountGroup = req.Plan.UpgradeGroup
	}
	if req.Plan.BillingDiscountGroup != "" {
		if !topupGroupExists(req.Plan.BillingDiscountGroup) {
			common.ApiErrorMsg(c, "折扣分组不存在")
			return
		}
	}
	if req.Plan.UpgradeGroup != "" {
		if err := syncSubscriptionUpgradeGroupRatio(req.Plan, req.UpgradeGroupRatio); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	req.Plan.BillingDiscount = model.ResolveSubscriptionBillingDiscount(req.Plan.BillingDiscountGroup, req.Plan.BillingDiscount)
	req.Plan.QuotaResetPeriod = model.NormalizeResetPeriod(req.Plan.QuotaResetPeriod)
	if req.Plan.QuotaResetPeriod == model.SubscriptionResetCustom && req.Plan.QuotaResetCustomSeconds <= 0 {
		common.ApiErrorMsg(c, "自定义重置周期需大于0秒")
		return
	}

	err := model.DB.Transaction(func(tx *gorm.DB) error {
		// update plan (allow zero values updates with map)
		updateMap := map[string]interface{}{
			"title":                      req.Plan.Title,
			"subtitle":                   req.Plan.Subtitle,
			"price_amount":               req.Plan.PriceAmount,
			"currency":                   req.Plan.Currency,
			"billing_discount":           req.Plan.BillingDiscount,
			"billing_discount_group":     req.Plan.BillingDiscountGroup,
			"duration_unit":              req.Plan.DurationUnit,
			"duration_value":             req.Plan.DurationValue,
			"custom_seconds":             req.Plan.CustomSeconds,
			"enabled":                    req.Plan.Enabled,
			"sort_order":                 req.Plan.SortOrder,
			"stripe_price_id":            req.Plan.StripePriceId,
			"creem_product_id":           req.Plan.CreemProductId,
			"waffo_pancake_product_id":   req.Plan.WaffoPancakeProductId,
			"max_purchase_per_user":      req.Plan.MaxPurchasePerUser,
			"total_amount":               req.Plan.TotalAmount,
			"upgrade_group":              req.Plan.UpgradeGroup,
			"quota_reset_period":         req.Plan.QuotaResetPeriod,
			"quota_reset_custom_seconds": req.Plan.QuotaResetCustomSeconds,
			"updated_at":                 common.GetTimestamp(),
		}
		if req.Plan.AllowBalancePay != nil {
			updateMap["allow_balance_pay"] = *req.Plan.AllowBalancePay
		}
		if err := tx.Model(&model.SubscriptionPlan{}).Where("id = ?", id).Updates(updateMap).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.UserSubscription{}).
			Where("plan_id = ? AND status = ?", id, "active").
			Updates(map[string]interface{}{
				"billing_discount":       req.Plan.BillingDiscount,
				"billing_discount_group": req.Plan.BillingDiscountGroup,
				"updated_at":             common.GetTimestamp(),
			}).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	model.InvalidateSubscriptionPlanCache(id)
	common.ApiSuccess(c, nil)
}

func topupGroupExists(group string) bool {
	group = strings.TrimSpace(group)
	if group == "" {
		return false
	}
	_, ok := common.GetTopupGroupRatioCopy()[group]
	return ok
}

func subscriptionUpgradeGroupExists(group string) bool {
	group = strings.TrimSpace(group)
	if group == "" {
		return true
	}
	if len([]rune(group)) > 64 {
		return false
	}
	return !strings.ContainsAny(group, ",\r\n\t")
}

func syncSubscriptionUpgradeGroupRatio(plan model.SubscriptionPlan, ratio *float64) error {
	group := strings.TrimSpace(plan.UpgradeGroup)
	if group == "" {
		return nil
	}
	groupRatios := ratio_setting.GetGroupRatioCopy()
	topupRatios := common.GetTopupGroupRatioCopy()
	targetRatio := 1.0
	if model.IsUnlimitedSubscriptionGroup(group) {
		targetRatio = 0
	}
	discountGroup := strings.TrimSpace(plan.BillingDiscountGroup)
	if discountGroup == group {
		if existing, ok := topupRatios[group]; ok {
			targetRatio = existing
		}
	} else if existing, ok := groupRatios[group]; ok {
		targetRatio = existing
	} else if existing, ok := topupRatios[group]; ok {
		targetRatio = existing
	}
	if ratio != nil {
		if *ratio < 0 {
			return fmt.Errorf("升级分组倍率不能小于0")
		}
		targetRatio = *ratio
	}

	updateTopupRatio := discountGroup == group
	if !updateTopupRatio {
		_, hasGroupRatio := groupRatios[group]
		_, hasTopupRatio := topupRatios[group]
		updateTopupRatio = hasTopupRatio && !hasGroupRatio
	}

	updates := map[string]string{}
	if updateTopupRatio {
		if existing, ok := topupRatios[group]; !ok || existing != targetRatio {
			topupRatios[group] = targetRatio
			raw, err := common.Marshal(topupRatios)
			if err != nil {
				return err
			}
			updates["TopupGroupRatio"] = string(raw)
		}
		if _, ok := groupRatios[group]; !ok {
			return model.UpdateOptionsBulk(updates)
		}
	}

	if existing, ok := groupRatios[group]; !ok || existing != targetRatio {
		groupRatios[group] = targetRatio
		raw, err := common.Marshal(groupRatios)
		if err != nil {
			return err
		}
		updates["GroupRatio"] = string(raw)
	}
	return model.UpdateOptionsBulk(updates)
}

type unlimitedSubscriptionPreset struct {
	Title         string
	Subtitle      string
	UpgradeGroup  string
	DurationUnit  string
	DurationValue int
	SortOrder     int
}

var unlimitedSubscriptionPresets = []unlimitedSubscriptionPreset{
	{
		Title:         "日卡无限量",
		Subtitle:      "24小时不限量使用，适合短期高频调用",
		UpgradeGroup:  "unlimited_day",
		DurationUnit:  model.SubscriptionDurationDay,
		DurationValue: 1,
		SortOrder:     300,
	},
	{
		Title:         "周卡无限量",
		Subtitle:      "7天不限量使用，适合阶段性项目冲刺",
		UpgradeGroup:  "unlimited_week",
		DurationUnit:  model.SubscriptionDurationDay,
		DurationValue: 7,
		SortOrder:     290,
	},
	{
		Title:         "月卡无限量",
		Subtitle:      "自然月维度不限量使用，适合长期稳定调用",
		UpgradeGroup:  "unlimited_month",
		DurationUnit:  model.SubscriptionDurationMonth,
		DurationValue: 1,
		SortOrder:     280,
	},
}

func AdminEnsureUnlimitedSubscriptionPlanPresets(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}

	for _, preset := range unlimitedSubscriptionPresets {
		zeroRatio := 0.0
		if err := syncSubscriptionUpgradeGroupRatio(model.SubscriptionPlan{UpgradeGroup: preset.UpgradeGroup}, &zeroRatio); err != nil {
			common.ApiError(c, err)
			return
		}
	}

	allowBalancePay := true
	plans := make([]model.SubscriptionPlan, 0, len(unlimitedSubscriptionPresets))
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		for _, preset := range unlimitedSubscriptionPresets {
			var plan model.SubscriptionPlan
			query := tx.Where("title = ? OR upgrade_group = ?", preset.Title, preset.UpgradeGroup).
				Order("id asc").
				Limit(1).
				Find(&plan)
			if query.Error != nil {
				return query.Error
			}
			if query.RowsAffected == 0 {
				plan = model.SubscriptionPlan{
					Title:              preset.Title,
					Subtitle:           preset.Subtitle,
					PriceAmount:        0,
					Currency:           operation_setting.GetQuotaDisplayType(),
					BillingDiscount:    1,
					DurationUnit:       preset.DurationUnit,
					DurationValue:      preset.DurationValue,
					Enabled:            false,
					SortOrder:          preset.SortOrder,
					AllowBalancePay:    &allowBalancePay,
					MaxPurchasePerUser: 0,
					UpgradeGroup:       preset.UpgradeGroup,
					TotalAmount:        0,
					QuotaResetPeriod:   model.SubscriptionResetNever,
				}
				if err := tx.Create(&plan).Error; err != nil {
					return err
				}
			}
			plans = append(plans, plan)
		}
		return nil
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}

	result := make([]SubscriptionPlanDTO, 0, len(plans))
	for _, p := range plans {
		model.InvalidateSubscriptionPlanCache(p.Id)
		result = append(result, buildSubscriptionPlanDTO(p))
	}
	common.ApiSuccess(c, result)
}

type AdminUpdateSubscriptionPlanStatusRequest struct {
	Enabled *bool `json:"enabled"`
}

func AdminUpdateSubscriptionPlanStatus(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}

	id, _ := strconv.Atoi(c.Param("id"))
	if id <= 0 {
		common.ApiErrorMsg(c, "无效的ID")
		return
	}
	var req AdminUpdateSubscriptionPlanStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Enabled == nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	if err := model.DB.Model(&model.SubscriptionPlan{}).Where("id = ?", id).Update("enabled", *req.Enabled).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	model.InvalidateSubscriptionPlanCache(id)
	common.ApiSuccess(c, nil)
}

type AdminBindSubscriptionRequest struct {
	UserId int `json:"user_id"`
	PlanId int `json:"plan_id"`
}

func AdminBindSubscription(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}

	var req AdminBindSubscriptionRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.UserId <= 0 || req.PlanId <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	msg, err := model.AdminBindSubscription(req.UserId, req.PlanId, "")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if msg != "" {
		common.ApiSuccess(c, gin.H{"message": msg})
		return
	}
	common.ApiSuccess(c, nil)
}

// ---- Admin: user subscription management ----

func AdminListUserSubscriptions(c *gin.Context) {
	userId, _ := strconv.Atoi(c.Param("id"))
	if userId <= 0 {
		common.ApiErrorMsg(c, "无效的用户ID")
		return
	}
	subs, err := model.GetAllUserSubscriptions(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, subs)
}

type AdminCreateUserSubscriptionRequest struct {
	PlanId int `json:"plan_id"`
}

// AdminCreateUserSubscription creates a new user subscription from a plan (no payment).
func AdminCreateUserSubscription(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}

	userId, _ := strconv.Atoi(c.Param("id"))
	if userId <= 0 {
		common.ApiErrorMsg(c, "无效的用户ID")
		return
	}
	var req AdminCreateUserSubscriptionRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.PlanId <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	msg, err := model.AdminBindSubscription(userId, req.PlanId, "")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if msg != "" {
		common.ApiSuccess(c, gin.H{"message": msg})
		return
	}
	common.ApiSuccess(c, nil)
}

// AdminInvalidateUserSubscription cancels a user subscription immediately.
func AdminInvalidateUserSubscription(c *gin.Context) {
	subId, _ := strconv.Atoi(c.Param("id"))
	if subId <= 0 {
		common.ApiErrorMsg(c, "无效的订阅ID")
		return
	}
	msg, err := model.AdminInvalidateUserSubscription(subId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if msg != "" {
		common.ApiSuccess(c, gin.H{"message": msg})
		return
	}
	common.ApiSuccess(c, nil)
}

// AdminDeleteUserSubscription hard-deletes a user subscription.
func AdminDeleteUserSubscription(c *gin.Context) {
	subId, _ := strconv.Atoi(c.Param("id"))
	if subId <= 0 {
		common.ApiErrorMsg(c, "无效的订阅ID")
		return
	}
	msg, err := model.AdminDeleteUserSubscription(subId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if msg != "" {
		common.ApiSuccess(c, gin.H{"message": msg})
		return
	}
	common.ApiSuccess(c, nil)
}
