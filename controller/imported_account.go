package controller

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

func importedAccountChannelByParam(c *gin.Context) (*model.Channel, int, error) {
	channelID, err := strconv.Atoi(c.Param("id"))
	if err != nil || channelID <= 0 {
		return nil, 0, fmt.Errorf("invalid channel id")
	}
	channel, err := model.GetChannelById(channelID, false)
	if err != nil {
		return nil, channelID, err
	}
	if channel == nil {
		return nil, channelID, fmt.Errorf("channel not found")
	}
	if !service.IsImportedAccountChannel(channel) {
		return nil, channelID, fmt.Errorf("channel is not an imported account channel")
	}
	return channel, channelID, nil
}

// GetImportedAccountResetState returns the local monitor reset counter. It is
// deliberately separate from the credential endpoint so no secret is needed.
func GetImportedAccountResetState(c *gin.Context) {
	channel, channelID, err := importedAccountChannelByParam(c)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	state := service.GetImportedAccountResetState(channel)
	common.ApiSuccess(c, gin.H{
		"channel_id":               channelID,
		"reset_count":              state.Count,
		"last_reset_at":            state.LastResetAt,
		"provider_reset_supported": false,
	})
}

// ResetImportedAccountState resets only local monitoring state. Upstream quota
// remains governed by the provider's own reset windows.
func ResetImportedAccountState(c *gin.Context) {
	channelID, err := strconv.Atoi(c.Param("id"))
	if err != nil || channelID <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid channel id"})
		return
	}
	_, state, err := service.ResetImportedAccountMonitor(channelID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	common.ApiSuccess(c, gin.H{
		"channel_id":               channelID,
		"reset_count":              state.Count,
		"last_reset_at":            state.LastResetAt,
		"provider_reset_supported": false,
	})
}
