package controller

import (
	"fmt"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
)

func MPayCreateOrder(c *gin.Context) {
	var req XPayCreateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}

	userID := c.GetInt("id")
	paymentMethod := req.PaymentMethod
	if paymentMethod == "" || paymentMethod == model.PaymentMethodMPay || paymentMethod == model.PaymentMethodXPay {
		paymentMethod = setting.MPayPaymentType
	}

	order, err := service.CreateMPayOrder(c.Request.Context(), userID, req.Amount, paymentMethod, "", "")
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("MPay 创建订单失败 user_id=%d amount=%.2f method=%s error=%q", userID, req.Amount, paymentMethod, err.Error()))
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, order)
}

func MPayCallback(c *gin.Context) {
	params := map[string]string{}

	if c.Request.Method == http.MethodGet {
		for key, values := range c.Request.URL.Query() {
			if len(values) > 0 {
				params[key] = values[0]
			}
		}
	} else {
		if err := c.Request.ParseForm(); err != nil {
			logger.LogWarn(c.Request.Context(), fmt.Sprintf("MPay 回调表单解析失败 client_ip=%s error=%q", c.ClientIP(), err.Error()))
			_, _ = c.Writer.Write([]byte("fail"))
			return
		}
		for key, values := range c.Request.PostForm {
			if len(values) > 0 {
				params[key] = values[0]
			}
		}
	}

	logger.LogInfo(c.Request.Context(), fmt.Sprintf("MPay 回调收到 client_ip=%s params=%q", c.ClientIP(), common.GetJsonString(params)))

	if !service.IsMPayTopUpEnabled() {
		logger.LogWarn(c.Request.Context(), "MPay 回调被拒绝 reason=disabled")
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}
	if !service.VerifyMPayCallback(params) {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("MPay 回调验签失败 client_ip=%s params=%q", c.ClientIP(), common.GetJsonString(params)))
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}

	tradeNo := service.ExtractMPayTradeNo(params)
	if tradeNo == "" {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("MPay 回调缺少订单号 client_ip=%s params=%q", c.ClientIP(), common.GetJsonString(params)))
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}

	status := params["trade_status"]
	if !service.IsMPayPaidStatus(status) {
		logger.LogInfo(c.Request.Context(), fmt.Sprintf("MPay 回调忽略非成功状态 trade_no=%s status=%s", tradeNo, status))
		_, _ = c.Writer.Write([]byte(setting.MPayNotifySuccess))
		return
	}

	LockOrder(tradeNo)
	defer UnlockOrder(tradeNo)
	if err := service.ConfirmMPayOrder(tradeNo, service.ExtractMPayMoney(params), c.ClientIP()); err != nil {
		if err == model.ErrTopUpStatusInvalid {
			_, _ = c.Writer.Write([]byte(setting.MPayNotifySuccess))
			return
		}
		logger.LogError(c.Request.Context(), fmt.Sprintf("MPay 回调入账失败 trade_no=%s client_ip=%s error=%q", tradeNo, c.ClientIP(), err.Error()))
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}

	_, _ = c.Writer.Write([]byte(setting.MPayNotifySuccess))
}
