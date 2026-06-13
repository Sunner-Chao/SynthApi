package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

type ChannelMonitorItem struct {
	Id           int    `json:"id"`
	Name         string `json:"name"`
	Type         int    `json:"type"`
	TypeName     string `json:"type_name"`
	Status       int    `json:"status"`
	Group        string `json:"group"`
	Tag          string `json:"tag,omitempty"`
	ModelCount   int    `json:"model_count"`
	ResponseTime int    `json:"response_time"`
	TestTime     int64  `json:"test_time"`
}

type ChannelMonitorSummary struct {
	Total          int64 `json:"total"`
	Enabled        int64 `json:"enabled"`
	AutoDisabled   int64 `json:"auto_disabled"`
	ManualDisabled int64 `json:"manual_disabled"`
	Untested       int64 `json:"untested"`
	Slow           int64 `json:"slow"`
}

func GetDashboardChannelMonitor(c *gin.Context) {
	const slowResponseMs = 3000
	const itemLimit = 12

	var channels []model.Channel
	if err := model.DB.Model(&model.Channel{}).
		Order("status asc, test_time desc, response_time desc").
		Limit(itemLimit).
		Find(&channels).Error; err != nil {
		common.SysError("failed to get channel monitor data: " + err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "获取渠道状态失败"})
		return
	}

	var total, enabled, autoDisabled, manualDisabled, untested, slow int64
	_ = model.DB.Model(&model.Channel{}).Count(&total).Error
	_ = model.DB.Model(&model.Channel{}).Where("status = ?", common.ChannelStatusEnabled).Count(&enabled).Error
	_ = model.DB.Model(&model.Channel{}).Where("status = ?", common.ChannelStatusAutoDisabled).Count(&autoDisabled).Error
	_ = model.DB.Model(&model.Channel{}).Where("status = ?", common.ChannelStatusManuallyDisabled).Count(&manualDisabled).Error
	_ = model.DB.Model(&model.Channel{}).Where("test_time = ? OR test_time IS NULL", 0).Count(&untested).Error
	_ = model.DB.Model(&model.Channel{}).Where("response_time >= ?", slowResponseMs).Count(&slow).Error

	items := make([]ChannelMonitorItem, 0, len(channels))
	for _, channel := range channels {
		tag := ""
		if channel.Tag != nil {
			tag = *channel.Tag
		}
		items = append(items, ChannelMonitorItem{
			Id:           channel.Id,
			Name:         channel.Name,
			Type:         channel.Type,
			TypeName:     constant.GetChannelTypeName(channel.Type),
			Status:       channel.Status,
			Group:        channel.Group,
			Tag:          tag,
			ModelCount:   len(channel.GetModels()),
			ResponseTime: channel.ResponseTime,
			TestTime:     channel.TestTime,
		})
	}

	common.ApiSuccess(c, gin.H{
		"summary": ChannelMonitorSummary{
			Total:          total,
			Enabled:        enabled,
			AutoDisabled:   autoDisabled,
			ManualDisabled: manualDisabled,
			Untested:       untested,
			Slow:           slow,
		},
		"items": items,
	})
}
