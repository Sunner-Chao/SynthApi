package controller

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
)

type XPayCreateOrderRequest struct {
	Amount        float64 `json:"amount" binding:"required,gt=0"`
	PaymentMethod string `json:"payment_method"`
}

func XPayCreateOrder(c *gin.Context) {
	var req XPayCreateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}

	userID := c.GetInt("id")

	paymentMethod := req.PaymentMethod
	if paymentMethod == "" || paymentMethod == model.PaymentMethodXPay {
		paymentMethod = setting.XPayPaymentType
	}
	if paymentMethod == "" {
		paymentMethod = "DMF"
	}

	order, err := service.CreateXPayOrder(c.Request.Context(), userID, req.Amount, paymentMethod, "", "")
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("XPay 创建订单失败 user_id=%d amount=%.2f method=%s error=%q", userID, req.Amount, paymentMethod, err.Error()))
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, order)
}

func XPayOrderStatus(c *gin.Context) {
	tradeNo := c.Param("trade_no")
	if tradeNo == "" {
		common.ApiErrorMsg(c, "订单号不能为空")
		return
	}
	order, err := service.GetXPayOrderStatus(tradeNo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, order)
}

func XPayConfirmOrder(c *gin.Context) {
	tradeNo := c.Param("trade_no")
	if tradeNo == "" {
		common.ApiErrorMsg(c, "订单号不能为空")
		return
	}
	if err := service.ConfirmXPayOrder(tradeNo, 0, c.ClientIP()); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func XPayUserOrders(c *gin.Context) {
	userID := c.GetInt("id")
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
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"items": orders, "total": total, "page": page, "size": pageSize})
}

func XPayCallback(c *gin.Context) {
	params := map[string]string{}

	if c.Request.Method == http.MethodGet {
		for key, values := range c.Request.URL.Query() {
			if len(values) > 0 {
				params[key] = values[0]
			}
		}
	} else {
		contentType := c.ContentType()
		if contentType == "application/json" {
			var body map[string]any
			if err := common.DecodeJson(c.Request.Body, &body); err != nil {
				logger.LogWarn(c.Request.Context(), fmt.Sprintf("XPay 回调 JSON 解析失败 client_ip=%s error=%q", c.ClientIP(), err.Error()))
				_, _ = c.Writer.Write([]byte("FAIL"))
				return
			}
			for key, value := range body {
				params[key] = fmt.Sprint(value)
			}
		} else {
			if err := c.Request.ParseForm(); err != nil {
				logger.LogWarn(c.Request.Context(), fmt.Sprintf("XPay 回调表单解析失败 client_ip=%s error=%q", c.ClientIP(), err.Error()))
				_, _ = c.Writer.Write([]byte("FAIL"))
				return
			}
			for key, values := range c.Request.PostForm {
				if len(values) > 0 {
					params[key] = values[0]
				}
			}
		}
	}

	logger.LogInfo(c.Request.Context(), fmt.Sprintf("XPay 回调收到 client_ip=%s params=%q", c.ClientIP(), common.GetJsonString(params)))

	if !service.IsXPayTopUpEnabled() {
		logger.LogWarn(c.Request.Context(), "XPay 回调被拒绝 reason=disabled")
		_, _ = c.Writer.Write([]byte("FAIL"))
		return
	}
	if !service.VerifyXPayCallback(params) {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("XPay 回调验签失败 client_ip=%s params=%q", c.ClientIP(), common.GetJsonString(params)))
		_, _ = c.Writer.Write([]byte("FAIL"))
		return
	}

	tradeNo := service.ExtractXPayTradeNo(params)
	if tradeNo == "" {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("XPay 回调缺少订单号 client_ip=%s params=%q", c.ClientIP(), common.GetJsonString(params)))
		_, _ = c.Writer.Write([]byte("FAIL"))
		return
	}

	status := params["status"]
	if status == "" {
		status = params["tradeStatus"]
	}
	if status == "" {
		status = params["trade_status"]
	}
	if !service.IsXPayPaidStatus(status) {
		logger.LogInfo(c.Request.Context(), fmt.Sprintf("XPay 回调忽略非成功状态 trade_no=%s status=%s", tradeNo, status))
		_, _ = c.Writer.Write([]byte(setting.XPayNotifySuccess))
		return
	}

	LockOrder(tradeNo)
	defer UnlockOrder(tradeNo)
	if err := service.ConfirmXPayOrder(tradeNo, service.ExtractXPayMoney(params), c.ClientIP()); err != nil {
		if err == model.ErrTopUpStatusInvalid {
			_, _ = c.Writer.Write([]byte(setting.XPayNotifySuccess))
			return
		}
		logger.LogError(c.Request.Context(), fmt.Sprintf("XPay 回调入账失败 trade_no=%s client_ip=%s error=%q", tradeNo, c.ClientIP(), err.Error()))
		_, _ = c.Writer.Write([]byte("FAIL"))
		return
	}

	_, _ = c.Writer.Write([]byte(setting.XPayNotifySuccess))
}

func XPaySubmitNotification(c *gin.Context) {
	XPayCallback(c)
}
