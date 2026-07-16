package controller

import (
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

type AlipayDirectConfigRequest struct {
	Enabled           bool    `json:"enabled"`
	AppID             string  `json:"app_id"`
	SellerID          string  `json:"seller_id"`
	PrivateKey        string  `json:"private_key"`
	PlatformPublicKey string  `json:"platform_public_key"`
	Sandbox           bool    `json:"sandbox"`
	NotifyURL         string  `json:"notify_url"`
	ReturnURL         string  `json:"return_url"`
	MinTopUp          float64 `json:"min_topup" binding:"required,gte=0.01"`
}

func SaveAlipayDirectConfig(c *gin.Context) {
	var req AlipayDirectConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "支付宝配置参数无效")
		return
	}

	err := service.SaveAlipayDirectConfig(service.AlipayDirectConfig{
		Enabled:           req.Enabled,
		AppID:             req.AppID,
		SellerID:          req.SellerID,
		PrivateKey:        req.PrivateKey,
		PlatformPublicKey: req.PlatformPublicKey,
		Sandbox:           req.Sandbox,
		NotifyURL:         req.NotifyURL,
		ReturnURL:         req.ReturnURL,
		MinTopUp:          req.MinTopUp,
	})
	if err != nil {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("支付宝官方支付配置保存失败 error=%q", err.Error()))
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
