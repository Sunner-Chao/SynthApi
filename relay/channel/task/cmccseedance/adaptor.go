package cmccseedance

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel"
	"github.com/QuantumNous/new-api/relay/channel/task/taskcommon"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/pkg/errors"
)

const (
	ChannelName  = "cmcc-seedance"
	VirtualModel = "doubao-seedance-2.0"
)

var ModelList = []string{"seedance-2.0"}

var secureChannels sync.Map

func secureChannelFor(baseURL, apiKey string) *Channel {
	digest := sha256.Sum256([]byte(normalizeBaseURL(baseURL) + "\x00" + apiKey))
	cacheKey := hex.EncodeToString(digest[:])
	channel := &Channel{}
	actual, _ := secureChannels.LoadOrStore(cacheKey, channel)
	return actual.(*Channel)
}

type responseTask struct {
	ID        string `json:"id"`
	RequestID string `json:"request_id"`
	Status    string `json:"status"`
	Model     string `json:"model"`
	Content   struct {
		VideoURL string `json:"video_url"`
	} `json:"content"`
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

type TaskAdaptor struct {
	taskcommon.BaseBilling
	ChannelType    int
	apiKey         string
	baseURL        string
	proxy          string
	secure         *Channel
	upstreamModel  string
	inputHasVideo  bool
	headerOverride map[string]string
}

func (a *TaskAdaptor) Init(info *relaycommon.RelayInfo) {
	if info == nil {
		return
	}
	a.ChannelType = info.ChannelType
	a.apiKey = info.ApiKey
	a.baseURL = normalizeBaseURL(info.ChannelBaseUrl)
	a.proxy = info.ChannelSetting.Proxy
	a.secure = secureChannelFor(a.baseURL, a.apiKey)
}

func (a *TaskAdaptor) ValidateRequestAndSetAction(c *gin.Context, info *relaycommon.RelayInfo) *dto.TaskError {
	var req relaycommon.TaskSubmitReq
	if err := common.UnmarshalBodyReusable(c, &req); err != nil {
		return service.TaskErrorWrapperLocal(err, "invalid_json", http.StatusBadRequest)
	}
	if strings.TrimSpace(req.Model) == "" {
		return service.TaskErrorWrapperLocal(errors.New("model field is required"), "missing_model", http.StatusBadRequest)
	}
	if strings.TrimSpace(req.Prompt) == "" && len(req.Content) == 0 {
		return service.TaskErrorWrapperLocal(errors.New("prompt or content is required"), "invalid_request", http.StatusBadRequest)
	}
	info.Action = constant.TaskActionTextGenerate
	if req.Image != "" || req.FirstFrame != "" || req.FirstFrameImage != "" || req.FirstFrameURL != "" ||
		req.LastFrame != "" || req.LastFrameImage != "" || req.LastFrameURL != "" ||
		len(req.Images) > 0 || len(req.ReferenceImages) > 0 ||
		req.Video != "" || len(req.Videos) > 0 || req.ReferenceVideo != "" || len(req.ReferenceVideos) > 0 {
		info.Action = constant.TaskActionGenerate
	}
	c.Set("task_request", req)
	return nil
}

func (a *TaskAdaptor) EstimateBilling(c *gin.Context, _ *relaycommon.RelayInfo) map[string]float64 {
	req, err := relaycommon.GetTaskRequest(c)
	if err != nil {
		return nil
	}
	seconds := req.Duration
	if seconds <= 0 {
		seconds, _ = strconv.Atoi(req.Seconds)
	}
	if seconds <= 0 {
		return nil
	}
	return map[string]float64{"seconds": float64(seconds)}
}

func (a *TaskAdaptor) AdjustBillingOnSubmit(*relaycommon.RelayInfo, []byte) map[string]float64 {
	return nil
}

func (a *TaskAdaptor) AdjustBillingOnComplete(*model.Task, *relaycommon.TaskInfo) int {
	return 0
}

func (a *TaskAdaptor) BuildRequestURL(_ *relaycommon.RelayInfo) (string, error) {
	if a.baseURL == "" {
		return "", errors.New("cmcc seedance base URL is required")
	}
	return a.baseURL + "/contents/generations/tasks", nil
}

func (a *TaskAdaptor) BuildRequestHeader(_ *gin.Context, req *http.Request, _ *relaycommon.RelayInfo) error {
	req.Header.Set("Authorization", "Bearer "+a.apiKey)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	return nil
}

func (a *TaskAdaptor) BuildRequestBody(c *gin.Context, info *relaycommon.RelayInfo) (io.Reader, error) {
	req, err := relaycommon.GetTaskRequest(c)
	if err != nil {
		return nil, errors.Wrap(err, "get task request")
	}
	modelName := req.Model
	if info != nil && info.IsModelMapped && info.UpstreamModelName != "" {
		modelName = info.UpstreamModelName
	}
	if strings.EqualFold(strings.TrimSpace(modelName), "seedance-2.0") ||
		strings.EqualFold(strings.TrimSpace(modelName), VirtualModel) {
		modelName = a.resolveModel(c.Request.Context(), modelName, info, c)
	}
	a.upstreamModel = modelName

	payload := make(map[string]any, 24)
	payload["model"] = modelName
	content := make([]map[string]any, 0, 8)
	for _, item := range req.Content {
		if item != nil {
			content = append(content, item)
		}
	}
	if len(content) == 0 {
		if strings.TrimSpace(req.Prompt) != "" {
			content = append(content, map[string]any{"type": "text", "text": req.Prompt})
		}
		appendMedia(&content, []string{req.Image}, "image_url", "first_frame")
		appendMedia(&content, []string{req.FirstFrame}, "image_url", "first_frame")
		appendMedia(&content, []string{req.FirstFrameImage}, "image_url", "first_frame")
		appendMedia(&content, []string{req.FirstFrameURL}, "image_url", "first_frame")
		appendMedia(&content, []string{req.LastFrame}, "image_url", "last_frame")
		appendMedia(&content, []string{req.LastFrameImage}, "image_url", "last_frame")
		appendMedia(&content, []string{req.LastFrameURL}, "image_url", "last_frame")
		appendMedia(&content, req.Images, "image_url", "reference_image")
		appendMedia(&content, req.ReferenceImages, "image_url", "reference_image")
		appendMedia(&content, []string{req.Video}, "video_url", "reference_video")
		appendMedia(&content, req.Videos, "video_url", "reference_video")
		appendMedia(&content, []string{req.ReferenceVideo}, "video_url", "reference_video")
		appendMedia(&content, req.ReferenceVideos, "video_url", "reference_video")
		appendMedia(&content, []string{req.Audio}, "audio_url", "reference_audio")
		appendMedia(&content, req.Audios, "audio_url", "reference_audio")
		appendMedia(&content, []string{req.ReferenceAudio}, "audio_url", "reference_audio")
		appendMedia(&content, req.ReferenceAudios, "audio_url", "reference_audio")
	}
	if len(content) == 0 {
		return nil, errors.New("prompt or content is required")
	}
	payload["content"] = content
	a.inputHasVideo = contentHasVideo(content)
	if req.Resolution != "" {
		payload["resolution"] = req.Resolution
	}
	if req.Ratio != "" {
		payload["ratio"] = req.Ratio
	} else if req.AspectRatio != "" {
		payload["ratio"] = req.AspectRatio
	}
	if req.Duration > 0 {
		payload["duration"] = req.Duration
	} else if seconds, parseErr := strconv.Atoi(req.Seconds); parseErr == nil && seconds > 0 {
		payload["duration"] = seconds
	}
	if req.GenerateAudio != nil {
		payload["generate_audio"] = *req.GenerateAudio
	}
	if req.ReturnLastFrame != nil {
		payload["return_last_frame"] = *req.ReturnLastFrame
	}
	if req.ExpiresAfter != nil {
		payload["execution_expires_after"] = *req.ExpiresAfter
	}
	if req.Frames != nil {
		payload["frames"] = *req.Frames
	}
	if req.FramesPerSecond != nil {
		payload["framespersecond"] = *req.FramesPerSecond
	}
	if req.Seed != nil {
		payload["seed"] = *req.Seed
	}
	if req.Watermark != nil {
		payload["watermark"] = *req.Watermark
	}
	if req.CallbackURL != "" {
		payload["callback_url"] = req.CallbackURL
	}
	if len(req.SafetyID) > 0 {
		payload["safety_identifier"] = req.SafetyID
	}
	if len(req.Tools) > 0 {
		payload["tools"] = req.Tools
	}
	if len(req.ServiceTier) > 0 {
		payload["service_tier"] = req.ServiceTier
	}
	for key, value := range req.Metadata {
		if key == "model" || key == "content" || value == nil {
			continue
		}
		if _, exists := payload[key]; !exists {
			payload[key] = value
		}
	}
	body, err := common.Marshal(payload)
	if err != nil {
		return nil, errors.Wrap(err, "marshal cmcc seedance request")
	}
	return bytes.NewReader(body), nil
}

func appendMedia(content *[]map[string]any, values []string, mediaType, role string) {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		*content = append(*content, map[string]any{
			"type":    mediaType,
			mediaType: map[string]any{"url": value},
			"role":    role,
		})
	}
}

func (a *TaskAdaptor) resolveModel(ctx context.Context, requested string, info *relaycommon.RelayInfo, c *gin.Context) string {
	fallback := VirtualModel
	body, err := common.Marshal(map[string]string{"model": fallback})
	if err != nil {
		return fallback
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.baseURL+"/mapping/query", bytes.NewReader(body))
	if err != nil {
		return fallback
	}
	req.Header.Set("Authorization", "Bearer "+a.apiKey)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	if overrides, resolveErr := channel.ResolveHeaderOverride(info, c); resolveErr == nil {
		applyHeaderMap(req, overrides)
	}
	client, err := service.GetHttpClientWithProxy(a.proxy)
	if err != nil {
		return fallback
	}
	resp, err := client.Do(service.MarkRelayRequestSingleHop(req))
	if err != nil || resp == nil || resp.Body == nil {
		return fallback
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return fallback
	}
	responseBody, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return fallback
	}
	var response any
	if err := common.Unmarshal(responseBody, &response); err != nil {
		return fallback
	}
	if endpoint := findMappingStringField(response, "endpoint"); endpoint != "" {
		return endpoint
	}
	_ = requested
	return fallback
}

func findMappingStringField(value any, target string) string {
	switch typed := value.(type) {
	case map[string]any:
		if raw, ok := typed[target].(string); ok && strings.TrimSpace(raw) != "" {
			return strings.TrimSpace(raw)
		}
		for _, child := range typed {
			if result := findMappingStringField(child, target); result != "" {
				return result
			}
		}
	case []any:
		for _, child := range typed {
			if result := findMappingStringField(child, target); result != "" {
				return result
			}
		}
	}
	return ""
}

func (a *TaskAdaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (*http.Response, error) {
	targetURL, err := a.BuildRequestURL(info)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, targetURL, requestBody)
	if err != nil {
		return nil, err
	}
	if err := a.BuildRequestHeader(c, req, info); err != nil {
		return nil, err
	}
	a.headerOverride, err = channel.ResolveHeaderOverride(info, c)
	if err != nil {
		return nil, err
	}
	applyHeaderMap(req, a.headerOverride)
	if a.inputHasVideo {
		req.Header.Set("Input-Has-Video", "true")
	}
	client, err := service.GetHttpClientWithProxy(a.proxy)
	if err != nil {
		return nil, err
	}
	secure := a.secure
	if secure == nil {
		secure = secureChannelFor(a.baseURL, a.apiKey)
	}
	return secure.Do(c.Request.Context(), service.MarkRelayRequestSingleHop(req), a.baseURL, a.apiKey, func(request *http.Request) (*http.Response, error) {
		return client.Do(request)
	})
}

func (a *TaskAdaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (string, []byte, *dto.TaskError) {
	if resp == nil || resp.Body == nil {
		return "", nil, service.TaskErrorWrapperLocal(errors.New("empty cmcc seedance response"), "invalid_response", http.StatusBadGateway)
	}
	responseBody, err := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	if err != nil {
		return "", nil, service.TaskErrorWrapper(err, "read_response_body_failed", http.StatusBadGateway)
	}
	var task responseTask
	if err := common.Unmarshal(responseBody, &task); err != nil {
		return "", nil, service.TaskErrorWrapper(errors.Wrap(err, "unmarshal cmcc seedance response"), "invalid_response", http.StatusBadGateway)
	}
	upstreamID := strings.TrimSpace(task.ID)
	if upstreamID == "" {
		upstreamID = strings.TrimSpace(task.RequestID)
	}
	if upstreamID == "" {
		return "", nil, service.TaskErrorWrapperLocal(errors.New("cmcc seedance returned no task id"), "invalid_response", http.StatusBadGateway)
	}
	video := dto.NewOpenAIVideo()
	video.ID = info.PublicTaskID
	video.TaskID = video.ID
	video.Model = info.OriginModelName
	video.CreatedAt = time.Now().Unix()
	c.JSON(http.StatusOK, video)
	return upstreamID, responseBody, nil
}

func (a *TaskAdaptor) FetchTask(baseURL, key string, body map[string]any, proxy string) (*http.Response, error) {
	taskID, ok := body["task_id"].(string)
	if !ok || strings.TrimSpace(taskID) == "" {
		return nil, errors.New("invalid task_id")
	}
	baseURL = normalizeBaseURL(baseURL)
	targetURL := baseURL + "/contents/generations/tasks/" + url.PathEscape(taskID)
	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, targetURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	applyStoredHeaderOverrides(req, body["header_override"])
	client, err := service.GetHttpClientWithProxy(proxy)
	if err != nil {
		return nil, err
	}
	secure := a.secure
	if secure == nil {
		secure = secureChannelFor(baseURL, key)
	}
	return secure.Do(context.Background(), service.MarkRelayRequestSingleHop(req), baseURL, key, func(request *http.Request) (*http.Response, error) {
		return client.Do(request)
	})
}

func contentHasVideo(content []map[string]any) bool {
	for _, item := range content {
		if item == nil {
			continue
		}
		if kind, ok := item["type"].(string); ok && strings.EqualFold(strings.TrimSpace(kind), "video_url") {
			return true
		}
	}
	return false
}

func applyHeaderMap(req *http.Request, headers map[string]string) {
	if req == nil {
		return
	}
	for key, value := range headers {
		if strings.TrimSpace(key) != "" {
			req.Header.Set(key, value)
		}
	}
}

func applyStoredHeaderOverrides(req *http.Request, raw any) {
	values, ok := raw.(map[string]any)
	if !ok {
		return
	}
	for key, value := range values {
		if stringValue, ok := value.(string); ok && strings.TrimSpace(key) != "" {
			req.Header.Set(key, stringValue)
		}
	}
}

func (a *TaskAdaptor) ParseTaskResult(respBody []byte) (*relaycommon.TaskInfo, error) {
	var task responseTask
	if err := common.Unmarshal(respBody, &task); err != nil {
		return nil, errors.Wrap(err, "unmarshal cmcc seedance task result")
	}
	result := &relaycommon.TaskInfo{}
	switch strings.ToLower(strings.TrimSpace(task.Status)) {
	case "queued", "pending", "submitted":
		result.Status = model.TaskStatusQueued
		result.Progress = "20%"
	case "running", "processing", "in_progress":
		result.Status = model.TaskStatusInProgress
		result.Progress = "50%"
	case "succeeded", "success", "completed", "done":
		result.Status = model.TaskStatusSuccess
		result.Progress = "100%"
		result.Url = strings.TrimSpace(task.Content.VideoURL)
	case "failed", "cancelled", "canceled":
		result.Status = model.TaskStatusFailure
		result.Progress = "100%"
		result.Reason = task.Error.Message
		if result.Reason == "" {
			result.Reason = "cmcc seedance task failed"
		}
	default:
		result.Status = model.TaskStatusInProgress
		result.Progress = "30%"
	}
	return result, nil
}

func (a *TaskAdaptor) GetModelList() []string { return ModelList }
func (a *TaskAdaptor) GetChannelName() string { return ChannelName }

func (a *TaskAdaptor) ConvertToOpenAIVideo(task *model.Task) ([]byte, error) {
	video := dto.NewOpenAIVideo()
	video.ID = task.TaskID
	video.TaskID = task.TaskID
	video.Model = task.Properties.OriginModelName
	video.Status = task.Status.ToVideoStatus()
	video.SetProgressStr(task.Progress)
	video.CreatedAt = task.CreatedAt
	video.CompletedAt = task.UpdatedAt
	if resultURL := task.GetResultURL(); resultURL != "" {
		video.SetMetadata("url", resultURL)
	}
	if task.Status == model.TaskStatusFailure {
		video.Error = &dto.OpenAIVideoError{Code: "task_failed", Message: task.FailReason}
	}
	return common.Marshal(video)
}

func normalizeBaseURL(raw string) string {
	base := strings.TrimRight(strings.TrimSpace(raw), "/")
	if base == "" {
		base = "https://zhenze-huhehaote.cmecloud.cn/api/v3"
	}
	if !strings.HasSuffix(strings.ToLower(base), "/api/v3") {
		base += "/api/v3"
	}
	return base
}
