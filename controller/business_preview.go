package controller

import (
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

type publicBusinessPaymentMethod struct {
	Type        string  `json:"type"`
	Name        string  `json:"name"`
	MinTopUp    float64 `json:"min_topup"`
	Recommended bool    `json:"recommended"`
}

type publicBusinessSubscriptionPlan struct {
	ID                      int     `json:"id"`
	Title                   string  `json:"title"`
	Subtitle                string  `json:"subtitle"`
	PriceAmount             float64 `json:"price_amount"`
	Currency                string  `json:"currency"`
	BillingDiscount         float64 `json:"billing_discount"`
	DurationUnit            string  `json:"duration_unit"`
	DurationValue           int     `json:"duration_value"`
	CustomSeconds           int64   `json:"custom_seconds"`
	TotalAmount             int64   `json:"total_amount"`
	QuotaResetPeriod        string  `json:"quota_reset_period"`
	QuotaResetCustomSeconds int64   `json:"quota_reset_custom_seconds"`
	MaxPurchasePerUser      int     `json:"max_purchase_per_user"`
	Unlimited               bool    `json:"unlimited"`
	NonRefundable           bool    `json:"non_refundable"`
}

func GetPublicBusinessPreview(c *gin.Context) {
	if !setting.IsPublicBusinessPreviewEnabled() {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "public business preview is disabled",
		})
		return
	}

	plans, err := getPublicBusinessSubscriptionPlans()
	if err != nil {
		common.SysError("failed to load public business preview plans: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "public business preview is temporarily unavailable",
		})
		return
	}

	amountOptions := append([]int(nil), operation_setting.GetPaymentSetting().AmountOptions...)
	common.ApiSuccess(c, gin.H{
		"payment_methods":         getPublicBusinessPaymentMethods(),
		"amount_options":          amountOptions,
		"plans":                   plans,
		"quota_display_type":      operation_setting.GetQuotaDisplayType(),
		"currency_symbol":         operation_setting.GetCurrencySymbol(),
		"purchase_requires_login": true,
	})
}

func getPublicBusinessSubscriptionPlans() ([]publicBusinessSubscriptionPlan, error) {
	result := make([]publicBusinessSubscriptionPlan, 0)
	if !operation_setting.IsPaymentComplianceConfirmed() {
		return result, nil
	}

	var plans []model.SubscriptionPlan
	if err := model.DB.Where("enabled = ?", true).
		Order("sort_order desc, id desc").
		Find(&plans).Error; err != nil {
		return nil, err
	}

	result = make([]publicBusinessSubscriptionPlan, 0, len(plans))
	for _, plan := range plans {
		plan.NormalizeDefaults()
		unlimited := model.IsUnlimitedSubscriptionPlan(&plan)
		result = append(result, publicBusinessSubscriptionPlan{
			ID:                      plan.Id,
			Title:                   plan.Title,
			Subtitle:                plan.Subtitle,
			PriceAmount:             plan.PriceAmount,
			Currency:                plan.Currency,
			BillingDiscount:         plan.BillingDiscount,
			DurationUnit:            plan.DurationUnit,
			DurationValue:           plan.DurationValue,
			CustomSeconds:           plan.CustomSeconds,
			TotalAmount:             plan.TotalAmount,
			QuotaResetPeriod:        plan.QuotaResetPeriod,
			QuotaResetCustomSeconds: plan.QuotaResetCustomSeconds,
			MaxPurchasePerUser:      plan.MaxPurchasePerUser,
			Unlimited:               unlimited,
			NonRefundable:           unlimited,
		})
	}
	return result, nil
}

func getPublicBusinessPaymentMethods() []publicBusinessPaymentMethod {
	methods := make(map[string]publicBusinessPaymentMethod)
	add := func(method publicBusinessPaymentMethod) {
		method.Type = strings.ToLower(strings.TrimSpace(method.Type))
		if method.Type == "" {
			return
		}
		if _, exists := methods[method.Type]; exists {
			return
		}
		methods[method.Type] = method
	}

	if service.IsAlipayDirectTopUpEnabled() {
		add(publicBusinessPaymentMethod{
			Type:        model.PaymentMethodAlipay,
			Name:        "支付宝",
			MinTopUp:    service.GetAlipayDirectMinTopUp(),
			Recommended: true,
		})
	}

	if service.IsMPayTopUpEnabled() {
		add(publicBusinessPaymentMethod{
			Type:        model.PaymentMethodAlipay,
			Name:        "支付宝",
			MinTopUp:    service.GetMPayMinTopup(),
			Recommended: true,
		})
		add(publicBusinessPaymentMethod{
			Type:     model.PaymentMethodWechat,
			Name:     "微信支付",
			MinTopUp: service.GetMPayMinTopup(),
		})
	}

	if isEpayTopUpEnabled() {
		for _, configured := range operation_setting.PayMethods {
			typeName := strings.ToLower(strings.TrimSpace(configured["type"]))
			if typeName == "custom1" || typeName == "" {
				continue
			}
			minTopUp := float64(operation_setting.MinTopUp)
			if parsed, err := strconv.ParseFloat(configured["min_topup"], 64); err == nil && parsed > 0 {
				minTopUp = parsed
			}
			add(publicBusinessPaymentMethod{
				Type:        typeName,
				Name:        publicPaymentMethodName(typeName, configured["name"]),
				MinTopUp:    minTopUp,
				Recommended: typeName == model.PaymentMethodAlipay,
			})
		}
	}

	if service.IsXPayTopUpEnabled() {
		add(publicBusinessPaymentMethod{
			Type:        model.PaymentMethodAlipay,
			Name:        "支付宝",
			MinTopUp:    setting.XPayMinTopUp,
			Recommended: true,
		})
	}
	if isStripeTopUpEnabled() {
		add(publicBusinessPaymentMethod{Type: "stripe", Name: "Stripe", MinTopUp: float64(setting.StripeMinTopUp)})
	}
	if isCreemTopUpEnabled() {
		add(publicBusinessPaymentMethod{Type: "creem", Name: "Creem"})
	}
	if isWaffoPancakeTopUpEnabled() {
		add(publicBusinessPaymentMethod{Type: model.PaymentMethodWaffoPancake, Name: "Waffo Pancake", MinTopUp: float64(setting.WaffoPancakeMinTopUp)})
	}
	if isWaffoTopUpEnabled() {
		add(publicBusinessPaymentMethod{Type: model.PaymentMethodWaffo, Name: "Waffo", MinTopUp: float64(setting.WaffoMinTopUp)})
	}

	priority := map[string]int{
		model.PaymentMethodAlipay: 0,
		model.PaymentMethodWechat: 1,
		"stripe":                  2,
		"creem":                   3,
	}
	result := make([]publicBusinessPaymentMethod, 0, len(methods))
	for _, method := range methods {
		result = append(result, method)
	}
	sort.SliceStable(result, func(i, j int) bool {
		left, leftOK := priority[result[i].Type]
		right, rightOK := priority[result[j].Type]
		if !leftOK {
			left = 100
		}
		if !rightOK {
			right = 100
		}
		if left != right {
			return left < right
		}
		return result[i].Name < result[j].Name
	})
	return result
}

func publicPaymentMethodName(typeName string, configuredName string) string {
	switch typeName {
	case model.PaymentMethodAlipay:
		return "支付宝"
	case model.PaymentMethodWechat:
		return "微信支付"
	case "stripe":
		return "Stripe"
	default:
		if name := strings.TrimSpace(configuredName); name != "" {
			return name
		}
		return typeName
	}
}
