package service

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

const importedAccountFailoverExcludedChannelsKey = "imported_account_failover_excluded_channels"
const importedAccountFailoverAttemptsKey = "imported_account_failover_attempts"

const maxImportedAccountFailoverAttempts = 50

func IsImportedAccountChannel(channel *model.Channel) bool {
	if channel == nil {
		return false
	}
	settings := channel.GetOtherSettings()
	return settings.IsImportedAccountChannel()
}

func IsImportedAccountLowQuotaChannel(channel *model.Channel) bool {
	if channel == nil {
		return false
	}
	settings := channel.GetOtherSettings()
	return settings.IsImportedAccountChannel() && settings.ImportedAccountMonitorLowQuota()
}

func ImportedAccountExcludedChannelIDs(c *gin.Context) map[int]struct{} {
	if c == nil {
		return nil
	}
	if existing, ok := c.Get(importedAccountFailoverExcludedChannelsKey); ok {
		if excluded, ok := existing.(map[int]struct{}); ok {
			return excluded
		}
	}
	excluded := make(map[int]struct{})
	c.Set(importedAccountFailoverExcludedChannelsKey, excluded)
	return excluded
}

func MarkImportedAccountChannelExcluded(c *gin.Context, channelID int) {
	if c == nil || channelID <= 0 {
		return
	}
	excluded := ImportedAccountExcludedChannelIDs(c)
	excluded[channelID] = struct{}{}
	c.Set(importedAccountFailoverExcludedChannelsKey, excluded)
}

func ShouldSkipChannelForImportedAccountFailover(c *gin.Context, channel *model.Channel) bool {
	if channel == nil {
		return false
	}
	if excluded := ImportedAccountExcludedChannelIDs(c); len(excluded) > 0 {
		if _, ok := excluded[channel.Id]; ok {
			return true
		}
	}
	return IsImportedAccountLowQuotaChannel(channel)
}

func IsImportedAccountQuotaError(c *gin.Context, err *types.NewAPIError) bool {
	if err == nil || !currentChannelIsImportedAccount(c) {
		return false
	}
	if err.StatusCode != http.StatusTooManyRequests &&
		err.StatusCode != http.StatusForbidden &&
		err.StatusCode != http.StatusPaymentRequired &&
		err.StatusCode != http.StatusBadRequest {
		return false
	}
	return importedAccountQuotaErrorMessage(err.Error())
}

func importedAccountQuotaErrorMessage(message string) bool {
	msg := strings.ToLower(strings.TrimSpace(message))
	if msg == "" {
		return false
	}
	keywords := []string{
		"quota",
		"usage limit",
		"rate limit",
		"rate_limit",
		"too many requests",
		"5h",
		"5 h",
		"5-hour",
		"5 hour",
		"weekly",
		"7d",
		"7 d",
		"额度",
		"配额",
		"用尽",
		"耗尽",
		"达到上限",
	}
	for _, keyword := range keywords {
		if strings.Contains(msg, keyword) {
			return true
		}
	}
	return false
}

func PrepareImportedAccountFailover(c *gin.Context, err *types.NewAPIError) bool {
	if !IsImportedAccountQuotaError(c, err) {
		return false
	}
	if c.GetInt(importedAccountFailoverAttemptsKey) >= maxImportedAccountFailoverAttempts {
		return false
	}
	channelID := common.GetContextKeyInt(c, constant.ContextKeyChannelId)
	if channelID <= 0 {
		return false
	}
	c.Set(importedAccountFailoverAttemptsKey, c.GetInt(importedAccountFailoverAttemptsKey)+1)
	MarkImportedAccountChannelExcluded(c, channelID)
	persistImportedAccountLowQuota(channelID, err)
	ClearChannelAffinityCacheForContext(c)
	return true
}

func persistImportedAccountLowQuota(channelID int, err *types.NewAPIError) {
	channel, dbErr := model.GetChannelById(channelID, true)
	if dbErr != nil || channel == nil || !IsImportedAccountChannel(channel) {
		if dbErr != nil {
			common.SysError(fmt.Sprintf("failed to load imported account channel for failover: channel_id=%d err=%v", channelID, dbErr))
		}
		return
	}

	settings := channel.GetOtherSettings()
	monitor := settings.ImportedAccountMonitor
	if monitor == nil {
		monitor = map[string]any{}
	}
	monitor["quota_status"] = "limited"
	monitor["quota_message"] = common.LocalLogPreview(err.Error())
	monitor["checked_at"] = time.Now().Unix()
	settings.ImportedAccountMonitor = monitor
	channel.SetOtherSettings(settings)

	if dbErr := model.DB.Model(&model.Channel{}).Where("id = ?", channelID).Update("settings", channel.OtherSettings).Error; dbErr != nil {
		common.SysError(fmt.Sprintf("failed to persist imported account low quota state: channel_id=%d err=%v", channelID, dbErr))
		return
	}
	model.CacheUpdateChannel(channel)
}

func currentChannelIsImportedAccount(c *gin.Context) bool {
	if c == nil {
		return false
	}
	raw, ok := common.GetContextKey(c, constant.ContextKeyChannelOtherSetting)
	if !ok || raw == nil {
		return false
	}
	switch settings := raw.(type) {
	case dto.ChannelOtherSettings:
		return settings.IsImportedAccountChannel()
	case *dto.ChannelOtherSettings:
		return settings.IsImportedAccountChannel()
	}
	return strings.Contains(strings.ToLower(fmt.Sprint(raw)), "imported_account_")
}
