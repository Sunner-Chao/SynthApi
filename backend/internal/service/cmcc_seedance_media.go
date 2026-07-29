package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/Wei-Shaw/sub2api/internal/pkg/cmccseedance"
	"github.com/Wei-Shaw/sub2api/internal/util/urlvalidator"
	"github.com/gin-gonic/gin"
)

const (
	CMCCSeedanceMediaAPIFormat = "cmcc_seedance"
	cmccSeedanceVirtualModel   = "doubao-seedance-2.0"
)

type cmccSeedanceAccountState struct {
	channel *cmccseedance.Channel

	mappingMu          sync.Mutex
	mappingFingerprint string
	modelMappings      map[string]string
}

func (a *Account) IsCMCCSeedanceMediaAPI() bool {
	return a != nil && a.IsGrok() && a.Type == AccountTypeAPIKey && strings.EqualFold(
		strings.TrimSpace(a.GetCredential("media_api_format")),
		CMCCSeedanceMediaAPIFormat,
	)
}

func (s *OpenAIGatewayService) forwardCMCCSeedanceMedia(
	ctx context.Context,
	c *gin.Context,
	account *Account,
	endpoint GrokMediaEndpoint,
	requestID string,
	body []byte,
	contentType, token string,
	startTime time.Time,
) (*OpenAIForwardResult, error) {
	if account == nil || !account.IsCMCCSeedanceMediaAPI() {
		return nil, errors.New("cmcc seedance media account is required")
	}
	if endpoint != GrokMediaEndpointVideosGenerations &&
		endpoint != GrokMediaEndpointVideoStatus &&
		endpoint != GrokMediaEndpointVideoContent {
		writeGrokMediaErrorResponse(c, http.StatusBadRequest, "invalid_request_error", "This account only supports video generations and lookups")
		return nil, fmt.Errorf("cmcc seedance does not support media endpoint %s", endpoint)
	}

	baseURL, err := buildCMCCSeedanceBaseURL(account, s.cfg)
	if err != nil {
		return nil, err
	}
	state := s.cmccSeedanceState(account.ID)
	proxyURL := ""
	if account.ProxyID != nil && account.Proxy != nil {
		proxyURL = account.Proxy.URL()
	}
	do := func(req *http.Request) (*http.Response, error) {
		return s.httpUpstream.Do(req, proxyURL, account.ID, account.Concurrency)
	}

	if endpoint == GrokMediaEndpointVideoContent {
		return s.forwardCMCCSeedanceVideoContent(ctx, c, account, state, baseURL, token, requestID, do, proxyURL, startTime)
	}

	requestModel := ""
	upstreamModel := ""
	var targetURL string
	var requestBody []byte
	if endpoint == GrokMediaEndpointVideosGenerations {
		if !strings.Contains(strings.ToLower(contentType), "application/json") && !json.Valid(body) {
			writeGrokMediaErrorResponse(c, http.StatusBadRequest, "invalid_request_error", "China Mobile Seedance requests must use JSON")
			return nil, errors.New("cmcc seedance requires a JSON request body")
		}
		requestInfo := ParseGrokMediaRequest(contentType, body)
		requestModel = requestInfo.Model
		virtualModel := normalizeCMCCSeedanceVirtualModel(account.GetMappedModel(requestModel))
		upstreamModel = s.resolveCMCCSeedanceModel(ctx, account, state, baseURL, token, virtualModel, do)
		requestBody, _, err = prepareCMCCSeedanceGenerationBody(body, upstreamModel)
		if err != nil {
			writeGrokMediaErrorResponse(c, http.StatusBadRequest, "invalid_request_error", err.Error())
			return nil, err
		}
		targetURL = baseURL + "/contents/generations/tasks"
	} else {
		targetURL = baseURL + "/contents/generations/tasks/" + url.PathEscape(strings.TrimSpace(requestID))
	}

	upstreamCtx, releaseUpstreamCtx := detachUpstreamContext(ctx)
	defer releaseUpstreamCtx()
	var bodyReader io.Reader
	if endpoint == GrokMediaEndpointVideosGenerations {
		bodyReader = bytes.NewReader(requestBody)
	}
	req, err := http.NewRequestWithContext(upstreamCtx, endpoint.httpMethod(), targetURL, bodyReader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	if serviceVersion := strings.TrimSpace(account.GetCredential("service_version")); serviceVersion != "" {
		req.Header.Set("service-version", serviceVersion)
	}
	if endpoint == GrokMediaEndpointVideosGenerations && cmccSeedanceBodyHasVideo(requestBody) {
		req.Header.Set("Input-Has-Video", "true")
	}
	account.ApplyHeaderOverrides(req.Header)

	upstreamStart := time.Now()
	resp, err := state.channel.Do(upstreamCtx, req, baseURL, token, do)
	SetOpsLatencyMs(c, OpsUpstreamLatencyMsKey, time.Since(upstreamStart).Milliseconds())
	if err != nil {
		return nil, s.handleOpenAIUpstreamTransportError(ctx, c, account, err, false)
	}
	defer func() { _ = resp.Body.Close() }()
	requestIDHeader := firstNonEmpty(resp.Header.Get("x-request-id"), resp.Header.Get("request-id"))
	if resp.StatusCode >= http.StatusBadRequest {
		return s.handleGrokMediaErrorResponse(ctx, resp, c, account, requestIDHeader, requestModel)
	}
	respBody, err := ReadUpstreamResponseBody(resp.Body, s.cfg, c, openAITooLargeError)
	if err != nil {
		return nil, err
	}
	if endpoint == GrokMediaEndpointVideosGenerations {
		respBody, err = normalizeCMCCSeedanceCreateResponse(respBody)
	} else {
		respBody, err = normalizeCMCCSeedanceStatusResponse(respBody, requestID, grokMediaContentProxyURL(c, requestID))
	}
	if err != nil {
		setOpsUpstreamError(c, http.StatusBadGateway, err.Error(), "")
		return nil, err
	}
	writeGrokMediaResponse(c, resp, respBody, s.responseHeaderFilter)
	requestInfo := ParseGrokMediaRequest("application/json", requestBody)
	usage := grokMediaUsageFromResponse(endpoint, requestInfo, respBody)
	return &OpenAIForwardResult{
		RequestID:            requestIDHeader,
		ResponseID:           usage.ResponseID,
		Usage:                usage.Usage,
		Model:                requestModel,
		BillingModel:         requestModel,
		UpstreamModel:        upstreamModel,
		ResponseHeaders:      resp.Header.Clone(),
		Duration:             time.Since(startTime),
		ImageCount:           usage.ImageCount,
		VideoCount:           usage.VideoCount,
		VideoResolution:      usage.VideoResolution,
		VideoDurationSeconds: usage.VideoDurationSeconds,
	}, nil
}

func (s *OpenAIGatewayService) forwardCMCCSeedanceVideoContent(
	ctx context.Context,
	c *gin.Context,
	account *Account,
	state *cmccSeedanceAccountState,
	baseURL, token, requestID string,
	do cmccseedance.DoFunc,
	proxyURL string,
	startTime time.Time,
) (*OpenAIForwardResult, error) {
	upstreamCtx, releaseUpstreamCtx := detachUpstreamContext(ctx)
	defer releaseUpstreamCtx()
	statusURL := baseURL + "/contents/generations/tasks/" + url.PathEscape(strings.TrimSpace(requestID))
	statusReq, err := http.NewRequestWithContext(WithHTTPUpstreamRedirectsDisabled(upstreamCtx), http.MethodGet, statusURL, nil)
	if err != nil {
		return nil, err
	}
	statusReq.Header.Set("Authorization", "Bearer "+token)
	statusReq.Header.Set("Accept", "application/json")
	statusReq.Header.Set("Content-Type", "application/json")
	if serviceVersion := strings.TrimSpace(account.GetCredential("service_version")); serviceVersion != "" {
		statusReq.Header.Set("service-version", serviceVersion)
	}
	account.ApplyHeaderOverrides(statusReq.Header)

	upstreamStart := time.Now()
	statusResp, err := state.channel.Do(upstreamCtx, statusReq, baseURL, token, do)
	if err != nil {
		SetOpsLatencyMs(c, OpsUpstreamLatencyMsKey, time.Since(upstreamStart).Milliseconds())
		return nil, s.handleOpenAIUpstreamTransportError(ctx, c, account, err, false)
	}
	statusRequestID := firstNonEmpty(statusResp.Header.Get("x-request-id"), statusResp.Header.Get("request-id"))
	if statusResp.StatusCode >= http.StatusBadRequest {
		defer func() { _ = statusResp.Body.Close() }()
		SetOpsLatencyMs(c, OpsUpstreamLatencyMsKey, time.Since(upstreamStart).Milliseconds())
		return s.handleGrokMediaErrorResponse(ctx, statusResp, c, account, statusRequestID, "")
	}
	statusBody, err := ReadUpstreamResponseBody(statusResp.Body, s.cfg, c, openAITooLargeError)
	_ = statusResp.Body.Close()
	if err != nil {
		SetOpsLatencyMs(c, OpsUpstreamLatencyMsKey, time.Since(upstreamStart).Milliseconds())
		return nil, err
	}
	contentURL, err := cmccSeedanceVideoContentURL(statusBody)
	if err != nil {
		SetOpsLatencyMs(c, OpsUpstreamLatencyMsKey, time.Since(upstreamStart).Milliseconds())
		return nil, err
	}

	contentReq, err := http.NewRequestWithContext(WithHTTPUpstreamRedirectsDisabled(upstreamCtx), http.MethodGet, contentURL, nil)
	if err != nil {
		return nil, err
	}
	contentReq.Header.Set("Accept", "*/*")
	if c != nil {
		if rangeHeader := strings.TrimSpace(c.GetHeader("Range")); rangeHeader != "" {
			contentReq.Header.Set("Range", rangeHeader)
		}
	}
	contentResp, err := s.httpUpstream.Do(contentReq, proxyURL, account.ID, account.Concurrency)
	SetOpsLatencyMs(c, OpsUpstreamLatencyMsKey, time.Since(upstreamStart).Milliseconds())
	if err != nil {
		return nil, s.handleOpenAIUpstreamTransportError(ctx, c, account, err, false)
	}
	defer func() { _ = contentResp.Body.Close() }()
	if contentResp.StatusCode >= http.StatusMultipleChoices && contentResp.StatusCode < http.StatusBadRequest {
		return nil, errors.New("cmcc seedance video content redirect is not allowed")
	}
	if contentResp.StatusCode >= http.StatusBadRequest && contentResp.StatusCode != http.StatusRequestedRangeNotSatisfiable {
		return s.handleGrokMediaErrorResponse(ctx, contentResp, c, account, statusRequestID, "")
	}
	if err := writeGrokMediaContentResponse(c, contentResp); err != nil {
		return nil, err
	}
	return &OpenAIForwardResult{
		RequestID:       statusRequestID,
		ResponseHeaders: contentResp.Header.Clone(),
		Duration:        time.Since(startTime),
	}, nil
}

func (s *OpenAIGatewayService) cmccSeedanceState(accountID int64) *cmccSeedanceAccountState {
	state := &cmccSeedanceAccountState{
		channel:       &cmccseedance.Channel{},
		modelMappings: make(map[string]string),
	}
	actual, _ := s.cmccSeedanceAccountStates.LoadOrStore(accountID, state)
	return actual.(*cmccSeedanceAccountState)
}

func buildCMCCSeedanceBaseURL(account *Account, cfg *config.Config) (string, error) {
	validator, err := grokBaseURLValidator(account, cfg)
	if err != nil {
		return "", err
	}
	return validator(account.GetGrokMediaBaseURL())
}

func normalizeCMCCSeedanceVirtualModel(model string) string {
	model = strings.TrimSpace(model)
	switch strings.ToLower(model) {
	case "seedance-2.0", "doubao-seedance-2-0":
		return cmccSeedanceVirtualModel
	default:
		return model
	}
}

func (s *OpenAIGatewayService) resolveCMCCSeedanceModel(
	ctx context.Context,
	account *Account,
	state *cmccSeedanceAccountState,
	baseURL, token, model string,
	do cmccseedance.DoFunc,
) string {
	model = normalizeCMCCSeedanceVirtualModel(model)
	if model == "" || state == nil {
		return model
	}
	fingerprintBytes := sha256.Sum256([]byte(baseURL + "\x00" + token))
	fingerprint := hex.EncodeToString(fingerprintBytes[:])
	state.mappingMu.Lock()
	defer state.mappingMu.Unlock()
	if state.mappingFingerprint != fingerprint {
		state.mappingFingerprint = fingerprint
		state.modelMappings = make(map[string]string)
	}
	if endpoint := strings.TrimSpace(state.modelMappings[model]); endpoint != "" {
		return endpoint
	}

	body, err := json.Marshal(map[string]string{"model": model})
	if err != nil {
		return model
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/mapping/query", bytes.NewReader(body))
	if err != nil {
		return model
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	if account != nil {
		if serviceVersion := strings.TrimSpace(account.GetCredential("service_version")); serviceVersion != "" {
			req.Header.Set("service-version", serviceVersion)
		}
		account.ApplyHeaderOverrides(req.Header)
	}
	resp, err := do(req)
	if err != nil || resp == nil || resp.Body == nil {
		return model
	}
	defer func() { _ = resp.Body.Close() }()
	responseBody, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil || resp.StatusCode != http.StatusOK {
		return model
	}
	var response map[string]any
	if err := json.Unmarshal(responseBody, &response); err != nil {
		return model
	}
	endpoint, _ := response["endpoint"].(string)
	endpoint = strings.TrimSpace(endpoint)
	if endpoint == "" {
		return model
	}
	state.modelMappings[model] = endpoint
	return endpoint
}

func prepareCMCCSeedanceGenerationBody(body []byte, model string) ([]byte, bool, error) {
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	var input map[string]any
	if err := decoder.Decode(&input); err != nil {
		return nil, false, errors.New("invalid JSON request body")
	}

	content, hasContent, err := cmccSeedanceContent(input)
	if err != nil {
		return nil, false, err
	}
	if !hasContent {
		content = make([]any, 0, 8)
		if prompt, _ := input["prompt"].(string); strings.TrimSpace(prompt) != "" {
			content = append(content, map[string]any{"type": "text", "text": strings.TrimSpace(prompt)})
		}
		appendCMCCSeedanceMediaField(&content, input["image"], "image_url", "first_frame")
		for _, field := range []string{"first_frame", "first_frame_image", "first_frame_url"} {
			appendCMCCSeedanceMediaField(&content, input[field], "image_url", "first_frame")
		}
		for _, field := range []string{"last_frame", "last_frame_image", "last_frame_url"} {
			appendCMCCSeedanceMediaField(&content, input[field], "image_url", "last_frame")
		}
		for _, field := range []string{"images", "reference_images"} {
			appendCMCCSeedanceMediaField(&content, input[field], "image_url", "reference_image")
		}
		for _, field := range []string{"video", "videos", "reference_video", "reference_videos"} {
			appendCMCCSeedanceMediaField(&content, input[field], "video_url", "reference_video")
		}
		for _, field := range []string{"audio", "audios", "reference_audio", "reference_audios"} {
			appendCMCCSeedanceMediaField(&content, input[field], "audio_url", "reference_audio")
		}
	}
	if len(content) == 0 {
		return nil, false, errors.New("prompt or content is required")
	}

	payload := make(map[string]any, 18)
	payload["model"] = strings.TrimSpace(model)
	payload["content"] = content
	for _, field := range []string{
		"callback_url", "return_last_frame", "execution_expires_after",
		"generate_audio", "resolution", "ratio", "duration", "frames",
		"framespersecond", "seed", "watermark", "safety_identifier", "tools",
		"service_tier",
	} {
		if value, ok := input[field]; ok && value != nil {
			payload[field] = value
		}
	}
	if _, exists := payload["ratio"]; !exists {
		if ratio, ok := input["aspect_ratio"]; ok && ratio != nil {
			payload["ratio"] = ratio
		}
	}

	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, false, fmt.Errorf("encode cmcc seedance request: %w", err)
	}
	return encoded, cmccSeedanceContentHasVideo(content), nil
}

func cmccSeedanceContent(input map[string]any) ([]any, bool, error) {
	raw, exists := input["content"]
	if !exists || raw == nil {
		return nil, false, nil
	}
	content, ok := raw.([]any)
	if !ok {
		return nil, false, errors.New("content must be an array")
	}
	return content, len(content) > 0, nil
}

func appendCMCCSeedanceMediaField(content *[]any, raw any, mediaType, role string) {
	if content == nil || raw == nil {
		return
	}
	if values, ok := raw.([]any); ok {
		for _, value := range values {
			appendCMCCSeedanceMediaField(content, value, mediaType, role)
		}
		return
	}
	mediaURL := cmccSeedanceMediaURL(raw, mediaType)
	if mediaURL == "" {
		return
	}
	*content = append(*content, map[string]any{
		"type": mediaType,
		mediaType: map[string]any{
			"url": mediaURL,
		},
		"role": role,
	})
}

func cmccSeedanceMediaURL(raw any, mediaType string) string {
	if value, ok := raw.(string); ok {
		return strings.TrimSpace(value)
	}
	object, ok := raw.(map[string]any)
	if !ok {
		return ""
	}
	if value, ok := object["url"].(string); ok && strings.TrimSpace(value) != "" {
		return strings.TrimSpace(value)
	}
	for _, field := range []string{mediaType, "image_url", "video_url", "audio_url"} {
		nested, exists := object[field]
		if !exists {
			continue
		}
		if value, ok := nested.(string); ok && strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
		if nestedObject, ok := nested.(map[string]any); ok {
			if value, ok := nestedObject["url"].(string); ok && strings.TrimSpace(value) != "" {
				return strings.TrimSpace(value)
			}
		}
	}
	return ""
}

func cmccSeedanceBodyHasVideo(body []byte) bool {
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return false
	}
	content, _ := payload["content"].([]any)
	return cmccSeedanceContentHasVideo(content)
}

func cmccSeedanceContentHasVideo(content []any) bool {
	for _, raw := range content {
		part, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		partType, _ := part["type"].(string)
		if strings.EqualFold(strings.TrimSpace(partType), "video_url") {
			return true
		}
	}
	return false
}

func normalizeCMCCSeedanceCreateResponse(body []byte) ([]byte, error) {
	var response map[string]any
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, errors.New("China Mobile Seedance returned an invalid create response")
	}
	id, _ := response["id"].(string)
	id = strings.TrimSpace(id)
	if id == "" {
		return nil, errors.New("China Mobile Seedance returned no task ID")
	}
	response["request_id"] = id
	return json.Marshal(response)
}

func normalizeCMCCSeedanceStatusResponse(body []byte, fallbackID, proxyURL string) ([]byte, error) {
	var response map[string]any
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	if err := decoder.Decode(&response); err != nil {
		return nil, errors.New("China Mobile Seedance returned an invalid task response")
	}
	id, _ := response["id"].(string)
	if strings.TrimSpace(id) == "" {
		id = strings.TrimSpace(fallbackID)
	}
	response["request_id"] = id
	if status, ok := response["status"].(string); ok {
		response["seedance_status"] = status
		response["status"] = cmccSeedancePublicStatus(status)
	}

	content, _ := response["content"].(map[string]any)
	if content == nil {
		content = make(map[string]any)
	}
	videoURL, _ := content["video_url"].(string)
	if strings.TrimSpace(videoURL) != "" {
		video, _ := response["video"].(map[string]any)
		if video == nil {
			video = make(map[string]any)
		}
		video["url"] = proxyURL
		for _, field := range []string{"duration", "resolution", "ratio", "frames", "framespersecond"} {
			if value, ok := response[field]; ok {
				video[field] = value
			}
		}
		response["video"] = video
		content["video_url"] = proxyURL
		response["content"] = content
	}
	return json.Marshal(response)
}

func cmccSeedancePublicStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "queued", "running":
		return "pending"
	case "succeeded":
		return "done"
	case "cancelled", "canceled":
		return "failed"
	default:
		return strings.ToLower(strings.TrimSpace(status))
	}
}

func cmccSeedanceVideoContentURL(body []byte) (string, error) {
	var response map[string]any
	if err := json.Unmarshal(body, &response); err != nil {
		return "", errors.New("China Mobile Seedance returned an invalid task response")
	}
	content, _ := response["content"].(map[string]any)
	rawURL, _ := content["video_url"].(string)
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return "", errors.New("China Mobile Seedance task has no downloadable video")
	}
	_, err := urlvalidator.ValidateHTTPSURL(rawURL, urlvalidator.ValidationOptions{AllowPrivate: false})
	if err != nil {
		return "", errors.New("China Mobile Seedance returned an unsafe video URL")
	}
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.User != nil {
		return "", errors.New("China Mobile Seedance returned an unsafe video URL")
	}
	return rawURL, nil
}
