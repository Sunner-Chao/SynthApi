package controller

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

type AlipayDirectTopUpRequest struct {
	Amount float64 `json:"amount" binding:"required,gt=0"`
}

type AlipayDirectSubscriptionRequest struct {
	PlanID int `json:"plan_id" binding:"required,gt=0"`
}

func RequestAlipayDirectPay(c *gin.Context) {
	var req AlipayDirectTopUpRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	order, err := service.CreateAlipayDirectTopUpOrder(c.Request.Context(), c.GetInt("id"), req.Amount)
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("支付宝官方充值订单创建失败 user_id=%d amount=%.2f error=%q", c.GetInt("id"), req.Amount, err.Error()))
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, order)
}

func SubscriptionRequestAlipayDirectPay(c *gin.Context) {
	var req AlipayDirectSubscriptionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	order, err := service.CreateAlipayDirectSubscriptionOrder(c.Request.Context(), c.GetInt("id"), req.PlanID)
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("支付宝官方订阅订单创建失败 user_id=%d plan_id=%d error=%q", c.GetInt("id"), req.PlanID, err.Error()))
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, order)
}

func AlipayDirectNotify(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 64<<10)
	if err := c.Request.ParseForm(); err != nil {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("支付宝官方异步通知解析失败 client_ip=%s error=%q", c.ClientIP(), err.Error()))
		c.String(http.StatusOK, "fail")
		return
	}
	params := make(map[string]string, len(c.Request.PostForm))
	for key := range c.Request.PostForm {
		params[key] = c.Request.PostForm.Get(key)
	}
	tradeNo := strings.TrimSpace(params["out_trade_no"])
	tradeStatus := strings.TrimSpace(params["trade_status"])
	if err := service.HandleAlipayDirectNotification(c.Request.Context(), params, c.ClientIP()); err != nil {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("支付宝官方异步通知处理失败 trade_no=%s trade_status=%s client_ip=%s error=%q", tradeNo, tradeStatus, c.ClientIP(), err.Error()))
		c.String(http.StatusOK, "fail")
		return
	}
	logger.LogInfo(c.Request.Context(), fmt.Sprintf("支付宝官方异步通知处理成功 trade_no=%s trade_status=%s client_ip=%s", tradeNo, tradeStatus, c.ClientIP()))
	c.String(http.StatusOK, "success")
}

func AlipayDirectReturn(c *gin.Context) {
	params := make(map[string]string, len(c.Request.URL.Query()))
	for key := range c.Request.URL.Query() {
		params[key] = c.Request.URL.Query().Get(key)
	}
	tradeNo := strings.TrimSpace(params["out_trade_no"])
	if tradeNo == "" {
		c.Redirect(http.StatusFound, paymentReturnPath("/console/topup?pay=fail"))
		return
	}
	order, err := service.ProcessAlipayDirectReturn(c.Request.Context(), params, c.ClientIP())
	if err != nil {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("支付宝官方同步返回查单失败 trade_no=%s error=%q", tradeNo, err.Error()))
		c.Redirect(http.StatusFound, paymentReturnPath("/console/topup?pay=pending"))
		return
	}
	if order.Status == common.TopUpStatusSuccess {
		c.Redirect(http.StatusFound, paymentReturnPath("/console/topup?pay=success"))
		return
	}
	c.Redirect(http.StatusFound, paymentReturnPath("/console/topup?pay=pending"))
}

func AlipayDirectOrderStatus(c *gin.Context) {
	tradeNo := strings.TrimSpace(c.Param("trade_no"))
	localOrder, err := service.GetAlipayDirectOrderForUser(tradeNo, c.GetInt("id"))
	if err != nil {
		common.ApiErrorMsg(c, "订单不存在")
		return
	}
	if localOrder.Status == common.TopUpStatusFailed {
		common.ApiSuccess(c, localOrder)
		return
	}
	order, err := service.QueryAndCompleteAlipayDirectOrder(c.Request.Context(), tradeNo, c.ClientIP())
	if err != nil {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("支付宝官方用户查单失败 user_id=%d trade_no=%s error=%q", c.GetInt("id"), tradeNo, err.Error()))
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, order)
}
