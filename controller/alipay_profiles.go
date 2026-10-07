package controller

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

type AlipayProfileConfigRequest struct {
	ID                string  `json:"id"`
	Name              string  `json:"name"`
	Enabled           bool    `json:"enabled"`
	AppID             string  `json:"app_id"`
	SellerID          string  `json:"seller_id"`
	PrivateKey        string  `json:"private_key"`
	PlatformPublicKey string  `json:"platform_public_key"`
	Sandbox           bool    `json:"sandbox"`
	NotifyURL         string  `json:"notify_url"`
	ReturnURL         string  `json:"return_url"`
	MinTopUp          float64 `json:"min_topup"`
}

func GetAlipayProfiles(c *gin.Context) {
	profiles, active := service.GetAlipayProfileViews()
	common.ApiSuccess(c, gin.H{"profiles": profiles, "active_profile": active})
}

func SaveAlipayProfile(c *gin.Context) {
	var req AlipayProfileConfigRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "支付宝配置参数无效")
		return
	}
	config := service.AlipayDirectConfig{
		Enabled: req.Enabled, AppID: strings.TrimSpace(req.AppID), SellerID: strings.TrimSpace(req.SellerID),
		PrivateKey: req.PrivateKey, PlatformPublicKey: req.PlatformPublicKey, Sandbox: req.Sandbox,
		NotifyURL: strings.TrimSpace(req.NotifyURL), ReturnURL: strings.TrimSpace(req.ReturnURL), MinTopUp: req.MinTopUp,
	}
	if err := service.SaveAlipayProfile(req.ID, req.Name, config); err != nil {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("支付宝收款档案保存失败 error=%q", err.Error()))
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

type AlipayProfileActivationRequest struct {
	ID string `json:"id" binding:"required"`
}

func ActivateAlipayProfile(c *gin.Context) {
	var req AlipayProfileActivationRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil || strings.TrimSpace(req.ID) == "" {
		common.ApiErrorMsg(c, "支付宝配置档案标识无效")
		return
	}
	if err := service.ActivateAlipayProfile(req.ID); err != nil {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("支付宝收款档案切换失败 error=%q", err.Error()))
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"active_profile": strings.TrimSpace(req.ID)})
}
