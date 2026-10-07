package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func SubscriptionRequestMPay(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}
	var req struct {
		PlanID int `json:"plan_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.PlanID <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	order, err := service.CreateMPaySubscriptionOrder(c.Request.Context(), c.GetInt("id"), req.PlanID)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, order)
}
