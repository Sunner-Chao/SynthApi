package handler

import (
	"context"
	"strings"

	"github.com/Wei-Shaw/sub2api/internal/pkg/ip"
	"github.com/Wei-Shaw/sub2api/internal/pkg/logger"
	middleware2 "github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

func bindCMCCSeedanceTaskMetadata(
	ctx context.Context,
	h *OpenAIGatewayHandler,
	reqLog *zap.Logger,
	apiKey *service.APIKey,
	subject middleware2.AuthSubject,
	account *service.Account,
	result *service.OpenAIForwardResult,
) {
	if account == nil || !account.IsCMCCSeedanceMediaAPI() || result == nil ||
		strings.TrimSpace(result.ResponseID) == "" || result.CMCCSeedanceBilling == nil {
		return
	}
	if err := h.gatewayService.BindCMCCSeedanceTaskMetadata(
		ctx, apiKey.GroupID, result.ResponseID, subject.UserID, apiKey.ID, result.CMCCSeedanceBilling,
	); err != nil {
		reqLog.Warn("grok_media.bind_cmcc_seedance_task_metadata_failed",
			zap.Int64("account_id", account.ID),
			zap.String("request_id", result.ResponseID),
			zap.Error(err),
		)
	}
}

func handleCMCCSeedanceUsage(
	c *gin.Context,
	h *OpenAIGatewayHandler,
	reqLog *zap.Logger,
	apiKey *service.APIKey,
	subject middleware2.AuthSubject,
	subscription *service.UserSubscription,
	account *service.Account,
	result *service.OpenAIForwardResult,
	endpoint service.GrokMediaEndpoint,
	taskID string,
) bool {
	if account == nil || !account.IsCMCCSeedanceMediaAPI() {
		return false
	}
	settleCMCCSeedanceUsage(c, h, reqLog, apiKey, subject, subscription, account, result, endpoint, taskID)
	return true
}

func shouldSettleCMCCSeedanceUsage(endpoint service.GrokMediaEndpoint, result *service.OpenAIForwardResult) bool {
	return (endpoint == service.GrokMediaEndpointVideoStatus || endpoint == service.GrokMediaEndpointVideoContent) &&
		result != nil &&
		result.CMCCSeedanceBilling != nil &&
		strings.EqualFold(strings.TrimSpace(result.CMCCSeedanceBilling.TaskStatus), "succeeded") &&
		result.Usage.OutputTokens > 0
}

func settleCMCCSeedanceUsage(
	c *gin.Context,
	h *OpenAIGatewayHandler,
	reqLog *zap.Logger,
	apiKey *service.APIKey,
	subject middleware2.AuthSubject,
	subscription *service.UserSubscription,
	account *service.Account,
	result *service.OpenAIForwardResult,
	endpoint service.GrokMediaEndpoint,
	taskID string,
) {
	if !shouldSettleCMCCSeedanceUsage(endpoint, result) {
		return
	}
	taskID = strings.TrimSpace(taskID)
	metadata, err := h.gatewayService.ResolveCMCCSeedanceTaskMetadata(
		c.Request.Context(), apiKey.GroupID, taskID, subject.UserID, apiKey.ID,
	)
	if err != nil || metadata == nil {
		reqLog.Warn("grok_media.cmcc_seedance_billing_metadata_missing",
			zap.String("request_id", taskID),
			zap.Error(err),
		)
		return
	}
	if metadata.AccountID != account.ID {
		reqLog.Warn("grok_media.cmcc_seedance_billing_account_mismatch",
			zap.String("request_id", taskID),
			zap.Int64("stored_account_id", metadata.AccountID),
			zap.Int64("selected_account_id", account.ID),
		)
		return
	}
	if statusResolution := strings.TrimSpace(result.CMCCSeedanceBilling.VideoResolution); statusResolution != "" {
		metadata.VideoResolution = statusResolution
	}
	if statusDuration := result.CMCCSeedanceBilling.VideoDurationSeconds; statusDuration > 0 {
		metadata.VideoDurationSeconds = statusDuration
	}
	result.Model = metadata.RequestedModel
	result.BillingModel = metadata.RequestedModel
	result.ResponseID = taskID
	result.VideoCount = 1
	result.ImageCount = 1
	result.VideoResolution = metadata.VideoResolution
	result.VideoDurationSeconds = metadata.VideoDurationSeconds
	result.CMCCSeedanceBilling = metadata
	recordCMCCSeedanceUsage(c, h, reqLog, apiKey, subject, subscription, account, result, metadata.RequestedModel, taskID)
}

func recordCMCCSeedanceUsage(
	c *gin.Context,
	h *OpenAIGatewayHandler,
	reqLog *zap.Logger,
	apiKey *service.APIKey,
	subject middleware2.AuthSubject,
	subscription *service.UserSubscription,
	account *service.Account,
	result *service.OpenAIForwardResult,
	requestModel string,
	requestID string,
) {
	userAgent := c.GetHeader("User-Agent")
	clientIP := ip.GetClientIP(c)
	sessionID := service.ExtractClientSessionID(c)
	payloadForHash := []byte(requestID)
	inboundEndpoint := GetInboundEndpoint(c)
	upstreamEndpoint := GetUpstreamEndpoint(c, account.Platform)
	quotaPlatform := service.QuotaPlatform(c.Request.Context(), apiKey)
	channelUsageFields := service.ChannelUsageFields{
		OriginalModel:      clientRequestedModel(c, requestModel),
		ChannelMappedModel: requestModel,
	}
	h.submitOpenAIUsageRecordTask(c.Request.Context(), result, func(ctx context.Context) {
		if err := h.gatewayService.RecordUsage(ctx, &service.OpenAIRecordUsageInput{
			Result:             result,
			BillingRequestID:   "cmcc-seedance:" + requestID,
			APIKey:             apiKey,
			User:               apiKey.User,
			Account:            account,
			Subscription:       subscription,
			InboundEndpoint:    inboundEndpoint,
			UpstreamEndpoint:   upstreamEndpoint,
			UserAgent:          userAgent,
			IPAddress:          clientIP,
			RequestPayloadHash: service.HashUsageRequestPayload(payloadForHash),
			APIKeyService:      h.apiKeyService,
			QuotaPlatform:      quotaPlatform,
			SessionID:          sessionID,
			ChannelUsageFields: channelUsageFields,
		}); err != nil {
			logger.L().With(
				zap.String("component", "handler.openai_gateway.grok_media"),
				zap.Int64("user_id", subject.UserID),
				zap.Int64("api_key_id", apiKey.ID),
				zap.Any("group_id", apiKey.GroupID),
				zap.String("model", requestModel),
				zap.Int64("account_id", account.ID),
			).Error("grok_media.record_usage_failed", zap.Error(err))
			reqLog.Debug("grok_media.record_usage_failed", zap.Error(err))
		}
	})
}
