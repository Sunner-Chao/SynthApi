package controller

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel/codex"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func importedAccountChannelByParam(c *gin.Context) (*model.Channel, int, error) {
	channelID, err := strconv.Atoi(c.Param("id"))
	if err != nil || channelID <= 0 {
		return nil, 0, fmt.Errorf("invalid channel id")
	}
	// The reset action needs the credential in server memory to call the
	// provider. It is never serialized in this controller response.
	channel, err := model.GetChannelById(channelID, true)
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
	providerSupported := channel.Type == constant.ChannelTypeCodex
	common.ApiSuccess(c, gin.H{
		"channel_id":               channelID,
		"reset_count":              state.Count,
		"last_reset_at":            state.LastResetAt,
		"provider_reset_supported": providerSupported,
		"local_reset_applied":      false,
	})
}

// ResetImportedAccountState consumes an official Codex reset credit when the
// imported account supports it; other imported channels keep the local reset.
func ResetImportedAccountState(c *gin.Context) {
	channel, channelID, err := importedAccountChannelByParam(c)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	// Imported Codex accounts have a real upstream reset-credit flow. Do not
	// clear local state until OpenAI confirms that a credit was consumed.
	if channel.Type == constant.ChannelTypeCodex {
		var req struct {
			CreditID       string `json:"credit_id"`
			IdempotencyKey string `json:"idempotency_key"`
		}
		if c.Request.ContentLength != 0 {
			if bindErr := c.ShouldBindJSON(&req); bindErr != nil {
				common.ApiError(c, bindErr)
				return
			}
		}
		idempotencyKey := strings.TrimSpace(req.IdempotencyKey)
		if idempotencyKey == "" {
			idempotencyKey = uuid.NewString()
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
		defer cancel()
		outcome, windowsReset, err := consumeImportedCodexResetCredit(
			ctx,
			channel,
			idempotencyKey,
			strings.TrimSpace(req.CreditID),
		)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		if outcome != "reset" && outcome != "already_redeemed" {
			message := "上游未执行额度重置"
			if outcome == "no_credit" {
				message = "该账号没有可用的官方额度重置次数"
			} else if outcome == "nothing_to_reset" {
				message = "当前额度窗口无需重置"
			}
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": message,
				"data": gin.H{
					"channel_id":               channelID,
					"provider_outcome":         outcome,
					"provider_windows_reset":   windowsReset,
					"provider_reset_supported": true,
					"local_reset_applied":      false,
				},
			})
			return
		}

		_, state, err := service.ResetImportedAccountMonitor(channelID)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		common.ApiSuccess(c, gin.H{
			"channel_id":               channelID,
			"reset_count":              state.Count,
			"last_reset_at":            state.LastResetAt,
			"provider_outcome":         outcome,
			"provider_windows_reset":   windowsReset,
			"provider_reset_supported": true,
			"local_reset_applied":      true,
		})
		return
	}

	// Non-Codex imported channels retain the historical local monitor reset.
	_, state, err := service.ResetImportedAccountMonitor(channelID)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"channel_id":               channelID,
		"reset_count":              state.Count,
		"last_reset_at":            state.LastResetAt,
		"provider_reset_supported": false,
		"local_reset_applied":      true,
	})
}

// consumeImportedCodexResetCredit calls the official reset-credit endpoint.
// On an expired access token it performs the same refresh flow as the usage
// checker, then retries once with the newly persisted credential.
func consumeImportedCodexResetCredit(
	ctx context.Context,
	channel *model.Channel,
	idempotencyKey string,
	creditID string,
) (outcome string, windowsReset int64, err error) {
	if channel == nil || channel.Type != constant.ChannelTypeCodex {
		return "", 0, fmt.Errorf("channel type is not Codex")
	}
	if !service.IsImportedAccountChannel(channel) {
		return "", 0, fmt.Errorf("channel is not an imported account channel")
	}

	oauthKey, err := codex.ParseOAuthKey(strings.TrimSpace(channel.Key))
	if err != nil {
		return "", 0, fmt.Errorf("解析凭证失败，请检查渠道配置")
	}
	if strings.TrimSpace(oauthKey.AccessToken) == "" || strings.TrimSpace(oauthKey.AccountID) == "" {
		return "", 0, fmt.Errorf("codex channel: access_token and account_id are required")
	}
	client, err := service.NewProxyHttpClient(channel.GetSetting().Proxy)
	if err != nil {
		return "", 0, err
	}

	request := func(key *codex.OAuthKey) (int, []byte, error) {
		return service.ConsumeCodexRateLimitResetCredit(
			ctx,
			client,
			channel.GetBaseURL(),
			key.AccessToken,
			key.AccountID,
			idempotencyKey,
			creditID,
		)
	}
	statusCode, body, err := request(oauthKey)
	if err != nil {
		return "", 0, err
	}

	if (statusCode == http.StatusUnauthorized || statusCode == http.StatusForbidden) &&
		strings.TrimSpace(oauthKey.RefreshToken) != "" {
		refreshed, refreshedChannel, refreshErr := service.RefreshCodexChannelCredential(
			ctx,
			channel.Id,
			service.CodexCredentialRefreshOptions{ResetCaches: true},
		)
		if refreshErr == nil && refreshed != nil && refreshedChannel != nil {
			channel = refreshedChannel
			oauthKey = &codex.OAuthKey{
				AccessToken:  refreshed.AccessToken,
				RefreshToken: refreshed.RefreshToken,
				AccountID:    refreshed.AccountID,
			}
			statusCode, body, err = request(oauthKey)
			if err != nil {
				return "", 0, err
			}
		}
	}

	var response service.CodexRateLimitResetConsumeResponse
	if common.Unmarshal(body, &response) != nil {
		if statusCode >= 200 && statusCode < 300 {
			return "", 0, fmt.Errorf("上游重置响应格式无效")
		}
		return "", 0, fmt.Errorf("上游额度重置失败（HTTP %d）", statusCode)
	}
	if statusCode < 200 || statusCode >= 300 {
		return "", 0, fmt.Errorf("上游额度重置失败（HTTP %d）", statusCode)
	}
	response.Code = strings.ToLower(strings.TrimSpace(response.Code))
	switch response.Code {
	case "reset", "nothing_to_reset", "no_credit", "already_redeemed":
		return response.Code, response.WindowsReset, nil
	default:
		return "", 0, fmt.Errorf("上游返回未知重置结果")
	}
}
