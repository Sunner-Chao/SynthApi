package controller

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// XPayCreateOrderRequest 创建 XPay 订单请求
type XPayCreateOrderRequest struct {
	Amount        float64 `json:"amount" binding:"required,gt=0"`
	PaymentMethod string  `json:"payment_method" binding:"required"`
}

// XPayCreateOrder 创建 XPay 订单
func XPayCreateOrder(c *gin.Context) {
	var req XPayCreateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid request: " + err.Error(),
		})
		return
	}

	// 验证支付方式
	validMethods := map[string]bool{
		"alipay":   true,
		"wechat":   true,
		"unionpay": true,
		"qq":       true,
	}
	if !validMethods[req.PaymentMethod] {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid payment method",
		})
		return
	}

	// 获取用户 ID
	userID := c.GetInt("id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "Unauthorized",
		})
		return
	}

	// 创建订单
	order, err := service.CreateXPayOrder(c.Request.Context(), userID, req.Amount, req.PaymentMethod)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Failed to create order: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Order created successfully",
		"data":    order,
	})
}

// XPayOrderStatus 获取 XPay 订单状态
func XPayOrderStatus(c *gin.Context) {
	tradeNo := c.Param("trade_no")
	if tradeNo == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Trade number is required",
		})
		return
	}

	order, err := service.GetXPayOrderStatus(tradeNo)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    order,
	})
}

// XPayConfirmOrder 确认 XPay 订单（管理员）
func XPayConfirmOrder(c *gin.Context) {
	tradeNo := c.Param("trade_no")
	if tradeNo == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Trade number is required",
		})
		return
	}

	adminID := c.GetInt("id")
	if adminID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "Unauthorized",
		})
		return
	}

	if err := service.ConfirmXPayOrder(tradeNo, adminID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Failed to confirm order: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Order confirmed successfully",
	})
}

// XPayUserOrders 获取用户的 XPay 订单
func XPayUserOrders(c *gin.Context) {
	userID := c.GetInt("id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "Unauthorized",
		})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "10"))

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 10
	}

	orders, total, err := service.GetUserXPayOrders(userID, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Failed to get orders: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"items": orders,
			"total": total,
			"page":  page,
			"size":  pageSize,
		},
	})
}

// XPayCallbackRequest 回调请求结构
type XPayCallbackRequest struct {
	TradeNo  string `json:"trade_no" form:"trade_no"`
	Status   string `json:"status" form:"status"`
	Amount   string `json:"amount" form:"amount"`
	Sign     string `json:"sign" form:"sign"`
	Platform string `json:"platform" form:"platform"`
}

// XPayCallback XPay 支付回调（自动确认）
func XPayCallback(c *gin.Context) {
	var req XPayCallbackRequest

	// 支持 JSON 和 form-urlencoded
	if c.ContentType() == "application/json" {
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "Invalid request format",
			})
			return
		}
	} else {
		req.TradeNo = c.PostForm("trade_no")
		req.Status = c.PostForm("status")
		req.Amount = c.PostForm("amount")
		req.Sign = c.PostForm("sign")
		req.Platform = c.PostForm("platform")
	}

	// 也支持 URL 参数
	if req.TradeNo == "" {
		req.TradeNo = c.Query("trade_no")
	}
	if req.Status == "" {
		req.Status = c.Query("status")
	}

	// 验证密钥
	secretKey := c.GetHeader("X-Callback-Secret")
	if secretKey == "" {
		secretKey = c.GetHeader("Authorization")
	}
	if secretKey == "" {
		secretKey = c.Query("secret")
	}

	expectedSecret := common.GetCallbackSecret()
	if expectedSecret != "" && secretKey != expectedSecret {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "Invalid secret",
		})
		return
	}

	// 验证必填字段
	if req.TradeNo == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Trade number is required",
		})
		return
	}

	// 支持多种状态值
	confirmStatuses := []string{"success", "paid", "completed", "TRADE_SUCCESS", "TRADE_FINISHED"}
	shouldConfirm := false
	for _, s := range confirmStatuses {
		if req.Status == s {
			shouldConfirm = true
			break
		}
	}

	if shouldConfirm {
		// 自动确认订单
		if err := service.ConfirmXPayOrder(req.TradeNo, 0); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"message": "Failed to confirm order: " + err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "Order confirmed successfully",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Callback received, status: " + req.Status,
	})
}

// XPayQRCode 获取支付二维码（用于显示收款码）
func XPayQRCode(c *gin.Context) {
	method := c.Query("method")
	amount := c.Query("amount")

	if method == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Payment method is required",
		})
		return
	}

	// 返回收款码图片路径
	qrPath := fmt.Sprintf("/pay/%s.png", method)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"qr_path": qrPath,
			"method":  method,
			"amount":  amount,
		},
	})
}

// XPaySubmitNotification 提交支付通知（用于手动或自动通知）
func XPaySubmitNotification(c *gin.Context) {
	var notification service.PaymentNotification

	// 支持 JSON 和 form-urlencoded
	if c.ContentType() == "application/json" {
		if err := c.ShouldBindJSON(&notification); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "Invalid request format",
			})
			return
		}
	} else {
		notification.Platform = c.PostForm("platform")
		notification.RawText = c.PostForm("text")

		// 尝试解析金额
		amountStr := c.PostForm("amount")
		if amountStr != "" {
			amount, err := strconv.ParseFloat(amountStr, 64)
			if err == nil {
				notification.Amount = amount
			}
		}
	}

	// 如果没有提供平台和金额，尝试从文本解析
	if notification.Platform == "" && notification.RawText != "" {
		parsed, err := service.ParsePaymentNotification(notification.RawText)
		if err == nil {
			notification.Platform = parsed.Platform
			notification.Amount = parsed.Amount
		}
	}

	// 验证必填字段
	if notification.Amount <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Amount is required and must be positive",
		})
		return
	}

	// 提交到监听器
	listener := service.GetPaymentListener()
	notification.Timestamp = time.Now().Unix()
	listener.SubmitNotification(notification)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Notification submitted successfully",
		"data": gin.H{
			"platform": notification.Platform,
			"amount":   notification.Amount,
		},
	})
}
