package controller

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/QuantumNous/new-api/relay"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/types"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/samber/lo"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

func relayHandler(c *gin.Context, info *relaycommon.RelayInfo) *types.NewAPIError {
	var err *types.NewAPIError
	switch info.RelayMode {
	case relayconstant.RelayModeImagesGenerations, relayconstant.RelayModeImagesEdits:
		err = relay.ImageHelper(c, info)
	case relayconstant.RelayModeAudioSpeech:
		fallthrough
	case relayconstant.RelayModeAudioTranslation:
		fallthrough
	case relayconstant.RelayModeAudioTranscription:
		err = relay.AudioHelper(c, info)
	case relayconstant.RelayModeRerank:
		err = relay.RerankHelper(c, info)
	case relayconstant.RelayModeEmbeddings:
		err = relay.EmbeddingHelper(c, info)
	case relayconstant.RelayModeResponses, relayconstant.RelayModeResponsesCompact:
		err = relay.ResponsesHelper(c, info)
	default:
		err = relay.TextHelper(c, info)
	}
	return err
}

func shouldBypassSensitiveRiskCheck(c *gin.Context, relayInfo *relaycommon.RelayInfo) bool {
	if c == nil {
		return false
	}
	if c.GetInt("role") >= common.RoleAdminUser {
		return true
	}
	if relayInfo != nil && relayInfo.UserId > 0 {
		return model.IsAdmin(relayInfo.UserId)
	}
	return false
}

func geminiRelayHandler(c *gin.Context, info *relaycommon.RelayInfo) *types.NewAPIError {
	var err *types.NewAPIError
	if strings.Contains(c.Request.URL.Path, "embed") {
		err = relay.GeminiEmbeddingHandler(c, info)
	} else {
		err = relay.GeminiHelper(c, info)
	}
	return err
}

func Relay(c *gin.Context, relayFormat types.RelayFormat) {

	requestId := c.GetString(common.RequestIdKey)
	stageTrace := newRelayStageTrace(c)
	//group := common.GetContextKeyString(c, constant.ContextKeyUsingGroup)
	//originalModel := common.GetContextKeyString(c, constant.ContextKeyOriginalModel)

	var (
		newAPIError *types.NewAPIError
		relayInfo   *relaycommon.RelayInfo
		ws          *websocket.Conn
	)
	defer func() {
		stageTrace.logIfSlow(c, relayInfo, newAPIError)
	}()

	if relayFormat == types.RelayFormatOpenAIRealtime {
		var err error
		ws, err = upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			helper.WssError(c, ws, types.NewError(err, types.ErrorCodeGetChannelFailed, types.ErrOptionWithSkipRetry()).ToOpenAIError())
			return
		}
		defer ws.Close()
	}

	defer func() {
		if newAPIError != nil {
			logger.LogError(c, fmt.Sprintf("relay error: %s", common.LocalLogPreview(newAPIError.Error())))
			newAPIError.SetMessage(common.MessageWithRequestId(newAPIError.Error(), requestId))
			switch relayFormat {
			case types.RelayFormatOpenAIRealtime:
				helper.WssError(c, ws, newAPIError.ToOpenAIError())
			case types.RelayFormatClaude:
				c.JSON(newAPIError.StatusCode, gin.H{
					"type":  "error",
					"error": newAPIError.ToClaudeError(),
				})
			default:
				c.JSON(newAPIError.StatusCode, gin.H{
					"error": newAPIError.ToOpenAIError(),
				})
			}
		}
	}()

	stageStart := time.Now()
	request, err := helper.GetAndValidateRequest(c, relayFormat)
	stageTrace.addSince(&stageTrace.validateRequest, stageStart)
	if err != nil {
		// Map "request body too large" to 413 so clients can handle it correctly
		if common.IsRequestBodyTooLargeError(err) || errors.Is(err, common.ErrRequestBodyTooLarge) {
			newAPIError = types.NewErrorWithStatusCode(err, types.ErrorCodeReadRequestBodyFailed, http.StatusRequestEntityTooLarge, types.ErrOptionWithSkipRetry())
		} else {
			newAPIError = types.NewError(err, types.ErrorCodeInvalidRequest)
		}
		return
	}

	stageStart = time.Now()
	relayInfo, err = relaycommon.GenRelayInfo(c, relayFormat, request, ws)
	stageTrace.addSince(&stageTrace.genRelayInfo, stageStart)
	if err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeGenRelayInfoFailed)
		return
	}
	relayInfo.StageMetricsProvider = stageTrace

	stageStart = time.Now()
	needSensitiveCheck := setting.ShouldCheckPromptSensitive() && !shouldBypassSensitiveRiskCheck(c, relayInfo)
	needCountToken := constant.CountToken
	// Avoid building huge CombineText (strings.Join) when token counting and sensitive check are both disabled.
	var meta *types.TokenCountMeta
	if needCountToken || (needSensitiveCheck && !hasSensitiveTextProvider(request)) {
		meta = request.GetTokenCountMeta()
	} else {
		meta = fastTokenCountMetaForPricing(request)
	}

	if needSensitiveCheck && meta != nil {
		sensitiveText := getSensitiveCheckText(request, meta)
		riskResult := service.ScanSensitiveRiskText(sensitiveText)
		if riskResult.Blocked {
			logger.LogWarn(c, fmt.Sprintf("user sensitive risk detected: score=%d, hits=%s", riskResult.Score, strings.Join(riskResult.Words, ", ")))
			service.NotifySensitiveRisk(service.NewSensitiveRiskEventWithScore(relayInfo, c.ClientIP(), riskResult.Score, riskResult.Words, sensitiveText))
			newAPIError = types.NewError(errors.New("sensitive words detected"), types.ErrorCodeSensitiveWordsDetected, types.ErrOptionWithSkipRetry())
			return
		}
	}

	tokens, err := service.EstimateRequestToken(c, meta, relayInfo)
	stageTrace.addSince(&stageTrace.preprocess, stageStart)
	if err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeCountTokenFailed)
		return
	}

	relayInfo.SetEstimatePromptTokens(tokens)

	stageStart = time.Now()
	priceData, err := helper.ModelPriceHelper(c, relayInfo, tokens, meta)
	stageTrace.addSince(&stageTrace.pricing, stageStart)
	if err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeModelPriceError, types.ErrOptionWithStatusCode(http.StatusBadRequest))
		return
	}

	// common.SetContextKey(c, constant.ContextKeyTokenCountMeta, meta)

	if priceData.FreeModel {
		logger.LogInfo(c, fmt.Sprintf("模型 %s 免费，跳过预扣费", relayInfo.OriginModelName))
	} else {
		stageStart = time.Now()
		newAPIError = service.PreConsumeBilling(c, priceData.QuotaToPreConsume, relayInfo)
		stageTrace.addSince(&stageTrace.preConsume, stageStart)
		if newAPIError != nil {
			return
		}
	}

	defer func() {
		// Only return quota if downstream failed and quota was actually pre-consumed
		if newAPIError != nil {
			newAPIError = service.NormalizeViolationFeeError(newAPIError)
			if relayInfo.Billing != nil {
				relayInfo.Billing.Refund(c)
			}
			service.ChargeViolationFeeIfNeeded(c, relayInfo, newAPIError)
		}
	}()

	primaryGroup := relayInfo.UsingGroup
	if primaryGroup == "" {
		primaryGroup = relayInfo.TokenGroup
	}
	attemptBudget := newRelayAttemptBudget(common.RetryTimes)
	failoverPolicy := newRelayFailoverPolicy()
	retryParam := &service.RetryParam{
		Ctx:        c,
		TokenGroup: primaryGroup,
		ModelName:  relayInfo.OriginModelName,
		Retry:      common.GetPointer(0),
	}
	relayInfo.RetryIndex = 0
	relayInfo.LastError = nil

	for ; retryParam.GetRetry() <= attemptBudget.retryLimit() && !attemptBudget.exhausted(); retryParam.IncreaseRetry() {
		if failoverPolicy.expired() {
			break
		}
		stageStart = time.Now()
		channel, channelErr := getChannel(c, relayInfo, retryParam)
		stageTrace.addSince(&stageTrace.selectChannel, stageStart)
		if channelErr != nil {
			logger.LogError(c, channelErr.Error())
			newAPIError = channelErr
			if channelErr.GetErrorCode() == types.ErrorCodeConcurrencyLimit {
				c.Header("Retry-After", "1")
			}
			if prepareSmartGroupFailover(c, relayInfo, retryParam, primaryGroup, newAPIError) {
				continue
			}
			break
		}
		stageTrace.setSelected(channel.Id, relayInfo.UsingGroup)
		channelSettings := channel.GetSetting()
		channelLimit := channelSettings.EffectiveMaxConcurrency(common.ModelRequestDefaultChannelMaxConcurrency)
		channelUserLimit := channelSettings.EffectiveMaxConcurrencyPerUser(common.ModelRequestDefaultChannelMaxConcurrencyPerUser)
		endActiveUse, capacity := service.TryBeginChannelActiveUse(channel.Id, relayInfo.UserId, channelLimit, channelUserLimit)
		if !capacity.Allowed {
			service.MarkChannelCapacityExcluded(c, channel.Id)
			logger.LogWarn(c, fmt.Sprintf("channel #%d concurrency limit reached: limited_by=%s active=%d/%d user_active=%d/%d",
				channel.Id, capacity.LimitedBy, capacity.Active, capacity.TotalLimit, capacity.UserActive, capacity.PerUserLimit))
			newAPIError = channelCapacityError(channel.Id, capacity)
			if _, specific := c.Get("specific_channel_id"); specific {
				c.Header("Retry-After", "1")
				break
			}
			retryParam.ResetRetryNextTry()
			continue
		}

		stageStart = time.Now()
		if billingErr := refreshBillingForSelectedGroup(c, relayInfo, tokens, meta); billingErr != nil {
			stageTrace.addSince(&stageTrace.refreshBilling, stageStart)
			newAPIError = billingErr
			endActiveUse()
			break
		}
		stageTrace.addSince(&stageTrace.refreshBilling, stageStart)

		stageStart = time.Now()
		bodyStorage, bodyErr := common.GetBodyStorage(c)
		stageTrace.addSince(&stageTrace.bodyStorage, stageStart)
		if bodyErr != nil {
			// Ensure consistent 413 for oversized bodies even when error occurs later (e.g., retry path)
			if common.IsRequestBodyTooLargeError(bodyErr) || errors.Is(bodyErr, common.ErrRequestBodyTooLarge) {
				newAPIError = types.NewErrorWithStatusCode(bodyErr, types.ErrorCodeReadRequestBodyFailed, http.StatusRequestEntityTooLarge, types.ErrOptionWithSkipRetry())
			} else {
				newAPIError = types.NewErrorWithStatusCode(bodyErr, types.ErrorCodeReadRequestBodyFailed, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
			}
			endActiveUse()
			break
		}
		c.Request.Body = io.NopCloser(bodyStorage)
		failoverPolicy.setBodySize(bodyStorage.Size())
		addUsedChannel(c, channel.Id)
		if !attemptBudget.acquire() {
			endActiveUse()
			break
		}
		relayInfo.RetryIndex = attemptBudget.used - 1

		stageTrace.beginUpstreamRelay()
		func() {
			defer endActiveUse()
			defer failoverPolicy.applyAttemptDeadline(c)()

			switch relayFormat {
			case types.RelayFormatOpenAIRealtime:
				newAPIError = relay.WssHelper(c, relayInfo)
			case types.RelayFormatClaude:
				newAPIError = relay.ClaudeHelper(c, relayInfo)
			case types.RelayFormatGemini:
				newAPIError = geminiRelayHandler(c, relayInfo)
			default:
				newAPIError = relayHandler(c, relayInfo)
			}
		}()
		stageTrace.endUpstreamRelay()

		if newAPIError == nil {
			clearChannelTransientFailures(channel.Id)
			service.ClearUserChannelCooldown(c, channel.Id)
			relayInfo.LastError = nil
			return
		}

		newAPIError = service.NormalizeViolationFeeError(newAPIError)
		relayInfo.LastError = newAPIError
		if c.Request.Context().Err() != nil {
			logger.LogInfo(c, "client disconnected; stop upstream retry and channel failover")
			break
		}
		processChannelError(c, relayInfo, *types.NewChannelError(channel.Id, channel.Type, channel.Name, channel.ChannelInfo.IsMultiKey, common.GetContextKeyString(c, constant.ContextKeyChannelKey), channel.GetAutoBan()), newAPIError)

		remainingRetries := attemptBudget.remainingRetries()
		if !failoverPolicy.allowRetry(c, relayInfo, newAPIError, remainingRetries) {
			break
		}
		service.MarkChannelSelectionExcluded(c, channel.Id)
		if prepareSmartGroupFailover(c, relayInfo, retryParam, primaryGroup, newAPIError) {
			continue
		}
		retryParam.ResetRetryNextTry()
	}

	useChannel := c.GetStringSlice("use_channel")
	if len(useChannel) > 1 {
		retryLogStr := fmt.Sprintf("重试：%s", strings.Trim(strings.Join(strings.Fields(fmt.Sprint(useChannel)), "->"), "[]"))
		logger.LogInfo(c, retryLogStr)
	}
	if newAPIError != nil {
		gopool.Go(func() {
			perfmetrics.RecordRelaySample(relayInfo, false, 0)
		})
	}
}

var upgrader = websocket.Upgrader{
	Subprotocols: []string{"realtime"}, // WS 握手支持的协议，如果有使用 Sec-WebSocket-Protocol，则必须在此声明对应的 Protocol TODO add other protocol
	CheckOrigin: func(r *http.Request) bool {
		return true // 允许跨域
	},
}

func addUsedChannel(c *gin.Context, channelId int) {
	useChannel := c.GetStringSlice("use_channel")
	useChannel = append(useChannel, fmt.Sprintf("%d", channelId))
	c.Set("use_channel", useChannel)
}

func fastTokenCountMetaForPricing(request dto.Request) *types.TokenCountMeta {
	if request == nil {
		return &types.TokenCountMeta{}
	}
	meta := &types.TokenCountMeta{
		TokenType: types.TokenTypeTokenizer,
	}
	switch r := request.(type) {
	case *dto.GeneralOpenAIRequest:
		maxCompletionTokens := lo.FromPtrOr(r.MaxCompletionTokens, uint(0))
		maxTokens := lo.FromPtrOr(r.MaxTokens, uint(0))
		if maxCompletionTokens > maxTokens {
			meta.MaxTokens = int(maxCompletionTokens)
		} else {
			meta.MaxTokens = int(maxTokens)
		}
	case *dto.OpenAIResponsesRequest:
		meta.MaxTokens = int(lo.FromPtrOr(r.MaxOutputTokens, uint(0)))
	case *dto.ClaudeRequest:
		meta.MaxTokens = int(lo.FromPtr(r.MaxTokens))
	case *dto.ImageRequest:
		// Pricing for image requests depends on ImagePriceRatio; safe to compute even when CountToken is disabled.
		return r.GetTokenCountMeta()
	default:
		// Best-effort: leave CombineText empty to avoid large allocations.
	}
	return meta
}

func hasSensitiveTextProvider(request dto.Request) bool {
	if request == nil {
		return false
	}
	_, ok := request.(dto.SensitiveTextProvider)
	return ok
}

func getSensitiveCheckText(request dto.Request, meta *types.TokenCountMeta) string {
	if provider, ok := request.(dto.SensitiveTextProvider); ok {
		return provider.GetSensitiveCheckText()
	}
	if meta == nil {
		return ""
	}
	return meta.CombineText
}

func getChannel(c *gin.Context, info *relaycommon.RelayInfo, retryParam *service.RetryParam) (*model.Channel, *types.NewAPIError) {
	if info.ChannelMeta == nil {
		initialChannelID := c.GetInt("channel_id")
		_, specific := c.Get("specific_channel_id")
		if specific || !service.IsChannelSelectionExcluded(c, initialChannelID) {
			channel, err := model.CacheGetChannel(initialChannelID)
			if err != nil {
				return nil, types.NewError(fmt.Errorf("获取初始渠道 %d 失败: %w", initialChannelID, err), types.ErrorCodeGetChannelFailed, types.ErrOptionWithSkipRetry())
			}
			return channel, nil
		}
	}
	channel, selectGroup, err := service.CacheGetRandomSatisfiedChannel(retryParam)

	if selectGroup != "" {
		common.SetContextKey(c, constant.ContextKeyUsingGroup, selectGroup)
		info.UsingGroup = selectGroup
	}
	info.PriceData.GroupRatioInfo = helper.HandleGroupRatio(c, info)

	if err != nil {
		if errors.Is(err, service.ErrAllChannelsAtCapacity) {
			return nil, types.NewErrorWithStatusCode(err, types.ErrorCodeConcurrencyLimit, http.StatusTooManyRequests, types.ErrOptionWithSkipRetry())
		}
		return nil, types.NewError(fmt.Errorf("获取分组 %s 下模型 %s 的可用渠道失败（retry）: %s", selectGroup, info.OriginModelName, err.Error()), types.ErrorCodeGetChannelFailed, types.ErrOptionWithSkipRetry())
	}
	if channel == nil {
		return nil, types.NewError(fmt.Errorf("分组 %s 下模型 %s 的可用渠道不存在（retry）", selectGroup, info.OriginModelName), types.ErrorCodeGetChannelFailed, types.ErrOptionWithSkipRetry())
	}

	newAPIError := middleware.SetupContextForSelectedChannel(c, channel, info.OriginModelName)
	if newAPIError != nil {
		return nil, newAPIError
	}
	return channel, nil
}

func refreshBillingForSelectedGroup(c *gin.Context, relayInfo *relaycommon.RelayInfo, tokens int, meta *types.TokenCountMeta) *types.NewAPIError {
	priceData, err := helper.ModelPriceHelper(c, relayInfo, tokens, meta)
	if err != nil {
		return types.NewError(err, types.ErrorCodeModelPriceError, types.ErrOptionWithStatusCode(http.StatusBadRequest), types.ErrOptionWithSkipRetry())
	}
	if priceData.FreeModel {
		return nil
	}
	if relayInfo.Billing == nil {
		return service.PreConsumeBilling(c, priceData.QuotaToPreConsume, relayInfo)
	}
	if err := relayInfo.Billing.Reserve(priceData.QuotaToPreConsume); err != nil {
		var apiErr *types.NewAPIError
		if errors.As(err, &apiErr) {
			return apiErr
		}
		return types.NewErrorWithStatusCode(err, types.ErrorCodePreConsumeTokenQuotaFailed, http.StatusForbidden, types.ErrOptionWithSkipRetry(), types.ErrOptionWithNoRecordErrorLog())
	}
	return nil
}

func prepareSmartGroupFailover(c *gin.Context, relayInfo *relaycommon.RelayInfo, retryParam *service.RetryParam, primaryGroup string, lastErr *types.NewAPIError) bool {
	if !shouldSmartGroupFailover(c, relayInfo, primaryGroup, lastErr) {
		return false
	}
	nextGroup, ok := service.NextSmartFailoverGroup(c, primaryGroup, relayInfo.OriginModelName)
	if !ok {
		return false
	}
	logger.LogInfo(c, fmt.Sprintf("分组自动兜底切换：%s -> %s，model=%s，last_status=%d，last_error=%s",
		primaryGroup, nextGroup, relayInfo.OriginModelName, lastErr.StatusCode, common.LocalLogPreview(lastErr.Error())))
	retryParam.TokenGroup = nextGroup
	retryParam.SetRetry(0)
	retryParam.ResetRetryNextTry()
	common.SetContextKey(c, constant.ContextKeyUsingGroup, nextGroup)
	relayInfo.UsingGroup = nextGroup
	return true
}

func shouldSmartGroupFailover(c *gin.Context, relayInfo *relaycommon.RelayInfo, primaryGroup string, err *types.NewAPIError) bool {
	if c == nil || relayInfo == nil || err == nil || primaryGroup == "" || primaryGroup == "auto" {
		return false
	}
	if common.RetryTimes <= 0 || !common.GetContextKeyBool(c, constant.ContextKeyTokenCrossGroupRetry) {
		return false
	}
	if types.IsDeterministicRequestError(err) {
		return false
	}
	if c.Request != nil && c.Request.Context().Err() != nil {
		return false
	}
	if _, ok := c.Get("specific_channel_id"); ok {
		return false
	}
	if service.ShouldSkipRetryAfterChannelAffinityFailure(c) {
		return false
	}
	switch relayInfo.RelayMode {
	case relayconstant.RelayModeImagesGenerations, relayconstant.RelayModeImagesEdits:
		return false
	}
	if types.IsChannelError(err) {
		return true
	}
	if err.GetErrorCode() == types.ErrorCodeGetChannelFailed {
		return true
	}
	if types.IsSkipRetryError(err) {
		return false
	}
	switch err.GetErrorCode() {
	case types.ErrorCodeInvalidRequest,
		types.ErrorCodeSensitiveWordsDetected,
		types.ErrorCodeViolationFeeGrokCSAM,
		types.ErrorCodeCountTokenFailed,
		types.ErrorCodeModelPriceError,
		types.ErrorCodeInvalidApiType,
		types.ErrorCodeReadRequestBodyFailed,
		types.ErrorCodeConvertRequestFailed,
		types.ErrorCodeAccessDenied,
		types.ErrorCodeInsufficientUserQuota,
		types.ErrorCodePreConsumeTokenQuotaFailed:
		return false
	}
	code := err.StatusCode
	if code >= 200 && code < 300 {
		return false
	}
	if code < 100 || code > 599 {
		return true
	}
	if operation_setting.IsAlwaysSkipRetryCode(err.GetErrorCode()) {
		return false
	}
	return operation_setting.ShouldRetryByStatusCode(code)
}

func shouldRetry(c *gin.Context, openaiErr *types.NewAPIError, retryTimes int) bool {
	if openaiErr == nil {
		return false
	}
	if types.IsDeterministicRequestError(openaiErr) {
		return false
	}
	if c == nil || (c.Request != nil && c.Request.Context().Err() != nil) {
		return false
	}
	if service.ShouldSkipRetryAfterChannelAffinityFailure(c) {
		return false
	}
	if types.IsSkipRetryError(openaiErr) {
		return false
	}
	if retryTimes <= 0 {
		return false
	}
	if types.IsChannelError(openaiErr) {
		return true
	}
	if _, ok := c.Get("specific_channel_id"); ok {
		return false
	}
	code := openaiErr.StatusCode
	if code >= 200 && code < 300 {
		return false
	}
	if code < 100 || code > 599 {
		return true
	}
	if operation_setting.IsAlwaysSkipRetryCode(openaiErr.GetErrorCode()) {
		return false
	}
	return operation_setting.ShouldRetryByStatusCode(code)
}

type relayFailoverPolicy struct {
	bodySize int64
	deadline time.Time
	retries  int
}

func newRelayFailoverPolicy() *relayFailoverPolicy {
	return &relayFailoverPolicy{}
}

func (p *relayFailoverPolicy) setBodySize(size int64) {
	if p != nil && size >= 0 {
		p.bodySize = size
	}
}

func (p *relayFailoverPolicy) expired() bool {
	return p != nil && !p.deadline.IsZero() && time.Now().After(p.deadline)
}

func (p *relayFailoverPolicy) allowRetry(c *gin.Context, relayInfo *relaycommon.RelayInfo, relayErr *types.NewAPIError, remainingRetries int) bool {
	if p == nil || c == nil || relayInfo == nil || relayErr == nil || remainingRetries <= 0 || p.retries >= 1 {
		return false
	}
	if _, specific := c.Get("specific_channel_id"); specific {
		return false
	}
	if c.Request == nil || c.Request.Context().Err() != nil || relayInfo.HasSendResponse() {
		return false
	}
	if types.IsSkipRetryError(relayErr) || types.IsDeterministicRequestError(relayErr) || service.ShouldSkipRetryAfterChannelAffinityFailure(c) {
		return false
	}
	maxBodyMB := common.ModelRequestSmallFailoverBodyMB
	if maxBodyMB <= 0 || p.bodySize > int64(maxBodyMB)<<20 {
		return false
	}
	if !isPreResponseTransportError(relayErr) {
		return false
	}
	timeoutSeconds := common.ModelRequestSmallFailoverTimeoutSeconds
	if timeoutSeconds <= 0 {
		return false
	}
	p.deadline = time.Now().Add(time.Duration(timeoutSeconds) * time.Second)
	p.retries++
	return true
}

func (p *relayFailoverPolicy) applyAttemptDeadline(c *gin.Context) func() {
	if p == nil || c == nil || c.Request == nil || p.deadline.IsZero() {
		return func() {}
	}
	originalRequest := c.Request
	ctx, cancel := context.WithDeadline(originalRequest.Context(), p.deadline)
	c.Request = originalRequest.WithContext(ctx)
	return func() {
		c.Request = originalRequest
		cancel()
	}
}

func isPreResponseTransportError(relayErr *types.NewAPIError) bool {
	if relayErr == nil || relayErr.GetErrorCode() == types.ErrorCodeBadResponseStatusCode {
		return false
	}
	if errors.Is(relayErr, io.EOF) || errors.Is(relayErr, io.ErrUnexpectedEOF) || errors.Is(relayErr, net.ErrClosed) {
		return true
	}
	var netErr net.Error
	if errors.As(relayErr, &netErr) {
		return true
	}
	message := strings.ToLower(strings.TrimSpace(relayErr.Error()))
	if message == "eof" || message == "unexpected eof" {
		return true
	}
	for _, marker := range []string{
		"dial tcp",
		"connection refused",
		"connection reset",
		"broken pipe",
		"server closed idle connection",
		"network is unreachable",
		"no such host",
		"tls handshake",
		"tls:",
	} {
		if strings.Contains(message, marker) {
			return true
		}
	}
	return false
}

func channelCapacityError(channelID int, capacity service.ChannelCapacitySnapshot) *types.NewAPIError {
	label := "渠道"
	limit := capacity.TotalLimit
	if capacity.LimitedBy == "user_channel" {
		label = "用户在该渠道的"
		limit = capacity.PerUserLimit
	}
	return types.NewErrorWithStatusCode(
		fmt.Errorf("渠道 %d 当前%s并发已达上限 %d，请稍后重试", channelID, label, limit),
		types.ErrorCodeConcurrencyLimit,
		http.StatusTooManyRequests,
		types.ErrOptionWithSkipRetry(),
	)
}

func processChannelError(c *gin.Context, relayInfo *relaycommon.RelayInfo, channelError types.ChannelError, err *types.NewAPIError) {
	logger.LogError(c, fmt.Sprintf("channel error (channel #%d, status code: %d): %s", channelError.ChannelId, err.StatusCode, common.LocalLogPreview(err.Error())))
	sharedActionAllowed := true
	sharedActionChecked := false
	if cooldown, cooldownClass := channelCooldownDecision(err); cooldown > 0 && !service.IsImportedAccountQuotaError(c, err) {
		if isTransientCooldownClass(cooldownClass) {
			userCooldown := service.MarkUserChannelCooldown(c, channelError.ChannelId, cooldown)
			if userCooldown > 0 {
				service.ClearChannelAffinityCacheForContext(c)
				logger.LogInfo(c, fmt.Sprintf("channel #%d user cooldown: %s, class=%s, user_id=%d",
					channelError.ChannelId, userCooldown.String(), cooldownClass, c.GetInt("id")))
			}
		}
		applyCooldown, distinctUsers := shouldApplySharedChannelCooldown(channelError.ChannelId, c.GetInt("id"), cooldownClass)
		sharedActionAllowed = applyCooldown
		sharedActionChecked = true
		if applyCooldown {
			model.MarkChannelCooldown(channelError.ChannelId, cooldown, err.ErrorWithStatusCode())
			logger.LogWarn(c, fmt.Sprintf("channel #%d cooldown: %s, class=%s, status=%d, code=%s",
				channelError.ChannelId, cooldown.String(), cooldownClass, err.StatusCode, err.GetErrorCode()))
		} else {
			logger.LogInfo(c, fmt.Sprintf("channel #%d shared cooldown deferred: class=%s, distinct_users=%d/%d",
				channelError.ChannelId, cooldownClass, distinctUsers, transientCooldownUserQuorum))
		}
	}
	// 不要使用context获取渠道信息，异步处理时可能会出现渠道信息不一致的情况
	// do not use context to get channel info, there may be inconsistent channel info when processing asynchronously
	if !service.IsImportedAccountQuotaError(c, err) && service.ShouldDisableChannel(err) && channelError.AutoBan {
		if !sharedActionChecked {
			sharedActionAllowed, _ = shouldApplySharedChannelCooldown(channelError.ChannelId, c.GetInt("id"), "automatic_disable")
		}
		if sharedActionAllowed {
			gopool.Go(func() {
				service.DisableChannel(channelError, err.ErrorWithStatusCode())
			})
		} else {
			logger.LogInfo(c, fmt.Sprintf("channel #%d automatic disable deferred: waiting for distinct-user quorum", channelError.ChannelId))
		}
	}

	if constant.ErrorLogEnabled && types.IsRecordErrorLog(err) {
		// 保存错误日志到mysql中
		userId := c.GetInt("id")
		tokenName := c.GetString("token_name")
		modelName := c.GetString("original_model")
		tokenId := c.GetInt("token_id")
		userGroup := c.GetString("group")
		channelId := c.GetInt("channel_id")
		other := make(map[string]interface{})
		if c.Request != nil && c.Request.URL != nil {
			other["request_path"] = c.Request.URL.Path
		}
		other["error_type"] = err.GetErrorType()
		other["error_code"] = err.GetErrorCode()
		other["status_code"] = err.StatusCode
		other["channel_id"] = channelId
		other["channel_name"] = c.GetString("channel_name")
		other["channel_type"] = c.GetInt("channel_type")
		adminInfo := make(map[string]interface{})
		adminInfo["use_channel"] = c.GetStringSlice("use_channel")
		isMultiKey := common.GetContextKeyBool(c, constant.ContextKeyChannelIsMultiKey)
		if isMultiKey {
			adminInfo["is_multi_key"] = true
			adminInfo["multi_key_index"] = common.GetContextKeyInt(c, constant.ContextKeyChannelMultiKeyIndex)
		}
		service.AppendChannelAffinityAdminInfo(c, adminInfo)
		other["admin_info"] = adminInfo
		startTime := common.GetContextKeyTime(c, constant.ContextKeyRequestStartTime)
		if startTime.IsZero() {
			startTime = time.Now()
		}
		useTimeSeconds := int(time.Since(startTime).Seconds())
		service.AppendRelayTraceLogInfo(c, relayInfo, other)
		model.RecordErrorLog(c, userId, channelId, modelName, tokenName, err.MaskSensitiveErrorWithStatusCode(), tokenId, useTimeSeconds, common.GetContextKeyBool(c, constant.ContextKeyIsStream), userGroup, other)
	}

}

func RelayMidjourney(c *gin.Context) {
	relayInfo, err := relaycommon.GenRelayInfo(c, types.RelayFormatMjProxy, nil, nil)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"description": fmt.Sprintf("failed to generate relay info: %s", err.Error()),
			"type":        "upstream_error",
			"code":        4,
		})
		return
	}

	var mjErr *dto.MidjourneyResponse
	switch relayInfo.RelayMode {
	case relayconstant.RelayModeMidjourneyNotify:
		mjErr = relay.RelayMidjourneyNotify(c)
	case relayconstant.RelayModeMidjourneyTaskFetch, relayconstant.RelayModeMidjourneyTaskFetchByCondition:
		mjErr = relay.RelayMidjourneyTask(c, relayInfo.RelayMode)
	case relayconstant.RelayModeMidjourneyTaskImageSeed:
		mjErr = relay.RelayMidjourneyTaskImageSeed(c)
	case relayconstant.RelayModeSwapFace:
		mjErr = relay.RelaySwapFace(c, relayInfo)
	default:
		mjErr = relay.RelayMidjourneySubmit(c, relayInfo)
	}
	//err = relayMidjourneySubmit(c, relayMode)
	log.Println(mjErr)
	if mjErr != nil {
		statusCode := http.StatusBadRequest
		if mjErr.Code == 30 {
			mjErr.Result = "当前分组负载已饱和，请稍后再试，或升级账户以提升服务质量。"
			statusCode = http.StatusTooManyRequests
		}
		c.JSON(statusCode, gin.H{
			"description": fmt.Sprintf("%s %s", mjErr.Description, mjErr.Result),
			"type":        "upstream_error",
			"code":        mjErr.Code,
		})
		channelId := c.GetInt("channel_id")
		logger.LogError(c, fmt.Sprintf("relay error (channel #%d, status code %d): %s", channelId, statusCode, fmt.Sprintf("%s %s", mjErr.Description, mjErr.Result)))
	}
}

func channelCooldownDecision(err *types.NewAPIError) (time.Duration, string) {
	if err == nil || types.IsSkipRetryError(err) || types.IsDeterministicRequestError(err) {
		return 0, ""
	}
	switch err.GetErrorCode() {
	case types.ErrorCodeChannelInvalidKey, types.ErrorCodeChannelNoAvailableKey:
		return 10 * time.Minute, "credential"
	case types.ErrorCodeChannelResponseTimeExceeded, types.ErrorCodeChannelAwsClientError:
		return 3 * time.Minute, "channel_runtime"
	case types.ErrorCodeDoRequestFailed:
		switch {
		case isTimeoutLikeRelayError(err):
			return 90 * time.Second, "timeout"
		case isConnectionLikeRelayError(err):
			return 45 * time.Second, "connectivity"
		default:
			return 60 * time.Second, "request_failed"
		}
	}
	if types.IsChannelError(err) {
		return 3 * time.Minute, "channel"
	}

	switch err.StatusCode {
	case http.StatusUnauthorized, http.StatusForbidden:
		return 10 * time.Minute, "auth"
	case http.StatusTooManyRequests:
		return 60 * time.Second, "rate_limit"
	case http.StatusRequestTimeout:
		return 90 * time.Second, "timeout"
	case http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout, 522, 524:
		return 90 * time.Second, "upstream_gateway"
	case http.StatusInternalServerError:
		return 60 * time.Second, "upstream_500"
	}
	if err.StatusCode >= 525 && err.StatusCode <= 599 {
		return 2 * time.Minute, "upstream_5xx"
	}
	return 0, ""
}

func channelCooldownDuration(err *types.NewAPIError) time.Duration {
	duration, _ := channelCooldownDecision(err)
	return duration
}

func isTimeoutLikeRelayError(err *types.NewAPIError) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return true
	}
	lower := strings.ToLower(err.Error())
	return strings.Contains(lower, "timeout") ||
		strings.Contains(lower, "deadline exceeded") ||
		strings.Contains(lower, "context deadline")
}

func isConnectionLikeRelayError(err *types.NewAPIError) bool {
	if err == nil {
		return false
	}
	lower := strings.ToLower(err.Error())
	return strings.Contains(lower, "connection refused") ||
		strings.Contains(lower, "connection reset") ||
		strings.Contains(lower, "connection closed") ||
		strings.Contains(lower, "broken pipe") ||
		strings.Contains(lower, "no such host") ||
		strings.Contains(lower, "server misbehaving") ||
		strings.Contains(lower, "tls handshake") ||
		strings.Contains(lower, "eof")
}

func RelayNotImplemented(c *gin.Context) {
	err := types.OpenAIError{
		Message: "API not implemented",
		Type:    "new_api_error",
		Param:   "",
		Code:    "api_not_implemented",
	}
	c.JSON(http.StatusNotImplemented, gin.H{
		"error": err,
	})
}

func RelayNotFound(c *gin.Context) {
	err := types.OpenAIError{
		Message: fmt.Sprintf("Invalid URL (%s %s)", c.Request.Method, c.Request.URL.Path),
		Type:    "invalid_request_error",
		Param:   "",
		Code:    "",
	}
	c.JSON(http.StatusNotFound, gin.H{
		"error": err,
	})
}

func RelayTaskFetch(c *gin.Context) {
	relayInfo, err := relaycommon.GenRelayInfo(c, types.RelayFormatTask, nil, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, &dto.TaskError{
			Code:       "gen_relay_info_failed",
			Message:    err.Error(),
			StatusCode: http.StatusInternalServerError,
		})
		return
	}
	if taskErr := relay.RelayTaskFetch(c, relayInfo.RelayMode); taskErr != nil {
		respondTaskError(c, taskErr)
	}
}

func FetchImageGenerationTask(c *gin.Context) {
	taskID := c.Param("task_id")
	userID := c.GetInt("id")
	if taskID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"message": "task_id is required",
				"type":    "invalid_request_error",
				"code":    "missing_task_id",
			},
		})
		return
	}

	task, exist, err := model.GetByTaskId(userID, taskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"message": err.Error(),
				"type":    "server_error",
				"code":    "get_task_failed",
			},
		})
		return
	}
	if !exist {
		c.JSON(http.StatusNotFound, gin.H{
			"error": gin.H{
				"message": "task not found",
				"type":    "invalid_request_error",
				"code":    "task_not_found",
			},
		})
		return
	}

	status := strings.ToLower(string(task.Status))
	switch task.Status {
	case model.TaskStatusSuccess:
		imageURL := task.GetResultURL()
		if imageURL == "" {
			c.JSON(http.StatusOK, gin.H{
				"id":       task.TaskID,
				"status":   "succeeded",
				"created":  task.CreatedAt,
				"data":     []gin.H{},
				"metadata": task.Data,
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"id":      task.TaskID,
			"status":  "succeeded",
			"created": task.CreatedAt,
			"data": []gin.H{
				{"url": imageURL},
			},
			"metadata": task.Data,
		})
	case model.TaskStatusFailure:
		c.JSON(http.StatusOK, gin.H{
			"id":      task.TaskID,
			"status":  "failed",
			"message": task.FailReason,
			"error": gin.H{
				"message": task.FailReason,
				"type":    "image_generation_error",
				"code":    "task_failed",
			},
		})
	default:
		c.JSON(http.StatusOK, gin.H{
			"id":       task.TaskID,
			"task_id":  task.TaskID,
			"status":   status,
			"progress": task.Progress,
			"created":  task.CreatedAt,
			"updated":  task.UpdatedAt,
		})
	}
}

func RelayTask(c *gin.Context) {
	relayInfo, err := relaycommon.GenRelayInfo(c, types.RelayFormatTask, nil, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, &dto.TaskError{
			Code:       "gen_relay_info_failed",
			Message:    err.Error(),
			StatusCode: http.StatusInternalServerError,
		})
		return
	}

	if taskErr := relay.ResolveOriginTask(c, relayInfo); taskErr != nil {
		respondTaskError(c, taskErr)
		return
	}

	var result *relay.TaskSubmitResult
	var taskErr *dto.TaskError
	defer func() {
		if taskErr != nil && relayInfo.Billing != nil {
			relayInfo.Billing.Refund(c)
		}
	}()

	attemptBudget := newRelayAttemptBudget(common.RetryTimes)
	retryParam := &service.RetryParam{
		Ctx:        c,
		TokenGroup: relayInfo.TokenGroup,
		ModelName:  relayInfo.OriginModelName,
		Retry:      common.GetPointer(0),
	}

	for ; retryParam.GetRetry() <= attemptBudget.retryLimit() && !attemptBudget.exhausted(); retryParam.IncreaseRetry() {
		var channel *model.Channel

		if lockedCh, ok := relayInfo.LockedChannel.(*model.Channel); ok && lockedCh != nil {
			channel = lockedCh
			if retryParam.GetRetry() > 0 {
				if setupErr := middleware.SetupContextForSelectedChannel(c, channel, relayInfo.OriginModelName); setupErr != nil {
					taskErr = service.TaskErrorWrapperLocal(setupErr.Err, "setup_locked_channel_failed", http.StatusInternalServerError)
					break
				}
			}
		} else {
			var channelErr *types.NewAPIError
			channel, channelErr = getChannel(c, relayInfo, retryParam)
			if channelErr != nil {
				logger.LogError(c, channelErr.Error())
				statusCode := http.StatusInternalServerError
				if channelErr.GetErrorCode() == types.ErrorCodeConcurrencyLimit {
					statusCode = http.StatusTooManyRequests
					c.Header("Retry-After", "1")
				}
				taskErr = service.TaskErrorWrapperLocal(channelErr.Err, "get_channel_failed", statusCode)
				break
			}
		}

		channelSettings := channel.GetSetting()
		channelLimit := channelSettings.EffectiveMaxConcurrency(common.ModelRequestDefaultChannelMaxConcurrency)
		channelUserLimit := channelSettings.EffectiveMaxConcurrencyPerUser(common.ModelRequestDefaultChannelMaxConcurrencyPerUser)
		endActiveUse, capacity := service.TryBeginChannelActiveUse(channel.Id, relayInfo.UserId, channelLimit, channelUserLimit)
		if !capacity.Allowed {
			service.MarkChannelCapacityExcluded(c, channel.Id)
			if _, locked := relayInfo.LockedChannel.(*model.Channel); locked {
				c.Header("Retry-After", "1")
				taskErr = service.TaskErrorWrapperLocal(channelCapacityError(channel.Id, capacity), "concurrency_limit", http.StatusTooManyRequests)
				break
			}
			retryParam.ResetRetryNextTry()
			continue
		}

		addUsedChannel(c, channel.Id)
		bodyStorage, bodyErr := common.GetBodyStorage(c)
		if bodyErr != nil {
			if common.IsRequestBodyTooLargeError(bodyErr) || errors.Is(bodyErr, common.ErrRequestBodyTooLarge) {
				taskErr = service.TaskErrorWrapperLocal(bodyErr, "read_request_body_failed", http.StatusRequestEntityTooLarge)
			} else {
				taskErr = service.TaskErrorWrapperLocal(bodyErr, "read_request_body_failed", http.StatusBadRequest)
			}
			endActiveUse()
			break
		}
		c.Request.Body = io.NopCloser(bodyStorage)
		if !attemptBudget.acquire() {
			endActiveUse()
			break
		}

		func() {
			defer endActiveUse()
			result, taskErr = relay.RelayTaskSubmit(c, relayInfo)
		}()
		if taskErr == nil {
			clearChannelTransientFailures(channel.Id)
			service.ClearUserChannelCooldown(c, channel.Id)
			break
		}

		if !taskErr.LocalError {
			processChannelError(c, relayInfo,
				*types.NewChannelError(channel.Id, channel.Type, channel.Name, channel.ChannelInfo.IsMultiKey,
					common.GetContextKeyString(c, constant.ContextKeyChannelKey), channel.GetAutoBan()),
				types.NewOpenAIError(taskErr.Error, types.ErrorCodeBadResponseStatusCode, taskErr.StatusCode))
		}

		if !shouldRetryTaskRelay(c, channel.Id, taskErr, attemptBudget.remainingRetries()) {
			break
		}
	}

	useChannel := c.GetStringSlice("use_channel")
	if len(useChannel) > 1 {
		retryLogStr := fmt.Sprintf("重试：%s", strings.Trim(strings.Join(strings.Fields(fmt.Sprint(useChannel)), "->"), "[]"))
		logger.LogInfo(c, retryLogStr)
	}

	// ── 成功：结算 + 日志 + 插入任务 ──
	if taskErr == nil {
		if settleErr := service.SettleBilling(c, relayInfo, result.Quota); settleErr != nil {
			common.SysError("settle task billing error: " + settleErr.Error())
		}
		service.LogTaskConsumption(c, relayInfo)

		task := model.InitTask(result.Platform, relayInfo)
		task.PrivateData.UpstreamTaskID = result.UpstreamTaskID
		task.PrivateData.BillingSource = relayInfo.BillingSource
		task.PrivateData.SubscriptionId = relayInfo.SubscriptionId
		task.PrivateData.TokenId = relayInfo.TokenId
		task.PrivateData.BillingContext = &model.TaskBillingContext{
			ModelPrice:      relayInfo.PriceData.ModelPrice,
			GroupRatio:      relayInfo.PriceData.GroupRatioInfo.GroupRatio,
			ModelRatio:      relayInfo.PriceData.ModelRatio,
			OtherRatios:     relayInfo.PriceData.OtherRatios,
			OriginModelName: relayInfo.OriginModelName,
			PerCallBilling:  common.StringsContains(constant.TaskPricePatches, relayInfo.OriginModelName) || relayInfo.PriceData.UsePrice,
		}
		task.Quota = result.Quota
		task.Data = result.TaskData
		task.Action = relayInfo.Action
		if insertErr := task.Insert(); insertErr != nil {
			common.SysError("insert task error: " + insertErr.Error())
		}
	}

	if taskErr != nil {
		respondTaskError(c, taskErr)
	}
}

// respondTaskError 统一输出 Task 错误响应（含 429 限流提示改写）
func respondTaskError(c *gin.Context, taskErr *dto.TaskError) {
	if taskErr.StatusCode == http.StatusTooManyRequests {
		taskErr.Message = "当前分组上游负载已饱和，请稍后再试"
	}
	c.JSON(taskErr.StatusCode, taskErr)
}

func shouldRetryTaskRelay(c *gin.Context, channelId int, taskErr *dto.TaskError, retryTimes int) bool {
	if taskErr == nil {
		return false
	}
	if c == nil || (c.Request != nil && c.Request.Context().Err() != nil) {
		return false
	}
	if service.ShouldSkipRetryAfterChannelAffinityFailure(c) {
		return false
	}
	if retryTimes <= 0 {
		return false
	}
	if _, ok := c.Get("specific_channel_id"); ok {
		return false
	}
	if taskErr.LocalError {
		return false
	}
	taskCause := taskErr.Error
	if taskCause == nil {
		taskCause = errors.New(taskErr.Message)
	}
	apiErr := types.NewOpenAIError(taskCause, types.ErrorCodeBadResponseStatusCode, taskErr.StatusCode)
	if types.IsDeterministicRequestError(apiErr) {
		return false
	}
	return operation_setting.ShouldRetryByStatusCode(taskErr.StatusCode)
}

const maxRelayRetryTimes = 10

type relayAttemptBudget struct {
	max  int
	used int
}

func newRelayAttemptBudget(retryTimes int) relayAttemptBudget {
	if retryTimes < 0 {
		retryTimes = 0
	}
	if retryTimes > maxRelayRetryTimes {
		retryTimes = maxRelayRetryTimes
	}
	return relayAttemptBudget{max: retryTimes + 1}
}

func (b *relayAttemptBudget) acquire() bool {
	if b == nil || b.used >= b.max {
		return false
	}
	b.used++
	return true
}

func (b *relayAttemptBudget) exhausted() bool {
	return b == nil || b.used >= b.max
}

func (b *relayAttemptBudget) remainingRetries() int {
	if b == nil || b.used >= b.max {
		return 0
	}
	return b.max - b.used
}

func (b *relayAttemptBudget) retryLimit() int {
	if b == nil || b.max <= 0 {
		return 0
	}
	return b.max - 1
}
