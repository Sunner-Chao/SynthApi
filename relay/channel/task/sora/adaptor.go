package sora

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel"
	taskcommon "github.com/QuantumNous/new-api/relay/channel/task/taskcommon"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/pkg/errors"
	"github.com/tidwall/sjson"
)

// ============================
// Request / Response structures
// ============================

type ContentItem struct {
	Type     string    `json:"type"`                // "text" or "image_url"
	Text     string    `json:"text,omitempty"`      // for text type
	ImageURL *ImageURL `json:"image_url,omitempty"` // for image_url type
}

type ImageURL struct {
	URL string `json:"url"`
}

type responseTask struct {
	ID                 string `json:"id"`
	TaskID             string `json:"task_id,omitempty"` //兼容旧接口
	Object             string `json:"object"`
	Model              string `json:"model"`
	Status             string `json:"status"`
	Progress           int    `json:"progress"`
	CreatedAt          int64  `json:"created_at"`
	CompletedAt        int64  `json:"completed_at,omitempty"`
	ExpiresAt          int64  `json:"expires_at,omitempty"`
	Seconds            string `json:"seconds,omitempty"`
	Size               string `json:"size,omitempty"`
	RemixedFromVideoID string `json:"remixed_from_video_id,omitempty"`
	Error              *struct {
		Message string `json:"message"`
		Code    string `json:"code"`
	} `json:"error,omitempty"`
}

type responseImageTask struct {
	ID        string `json:"id"`
	TaskID    string `json:"task_id,omitempty"`
	Status    string `json:"status"`
	Progress  int    `json:"progress"`
	CreatedAt int64  `json:"created_at"`
	UpdatedAt int64  `json:"updated_at,omitempty"`
	Data      []struct {
		URL string `json:"url"`
		B64 string `json:"b64_json"`
	} `json:"data,omitempty"`
	Result struct {
		Images []struct {
			URL any `json:"url"`
		} `json:"images,omitempty"`
		Videos []struct {
			URL any `json:"url"`
		} `json:"videos,omitempty"`
	} `json:"result,omitempty"`
	Error *struct {
		Message string `json:"message"`
		Code    string `json:"code"`
	} `json:"error,omitempty"`
	Message string `json:"message,omitempty"`
	Cost    float64 `json:"cost,omitempty"`
	Usage   struct {
		TotalTokens int `json:"total_tokens,omitempty"`
	} `json:"usage,omitempty"`
}

type apimartImageTaskResponse struct {
	Code    int               `json:"code"`
	Message string            `json:"message,omitempty"`
	Data    responseImageTask `json:"data"`
	Error   *struct {
		Message string `json:"message"`
		Code    string `json:"code"`
	} `json:"error,omitempty"`
}

type apimartTaskSubmissionResponse struct {
	Code    int               `json:"code"`
	Data    []responseTask    `json:"data"`
	Message string            `json:"message,omitempty"`
	Error   *struct {
		Message string `json:"message"`
		Code    string `json:"code"`
	} `json:"error,omitempty"`
}

func (r *apimartTaskSubmissionResponse) UnmarshalJSON(data []byte) error {
	var raw struct {
		Code int `json:"code"`
		Data json.RawMessage `json:"data"`
		Message string `json:"message,omitempty"`
		Error *struct { Message string `json:"message"`; Code string `json:"code"` } `json:"error,omitempty"`
	}
	if err := json.Unmarshal(data, &raw); err != nil { return err }
	r.Code, r.Message, r.Error = raw.Code, raw.Message, raw.Error
	if len(raw.Data) == 0 || string(raw.Data) == "null" { return nil }
	if err := json.Unmarshal(raw.Data, &r.Data); err == nil { return nil }
	var single responseTask
	if err := json.Unmarshal(raw.Data, &single); err != nil { return err }
	r.Data = []responseTask{single}
	return nil
}

// ============================
// Adaptor implementation
// ============================

type TaskAdaptor struct {
	taskcommon.BaseBilling
	ChannelType int
	apiKey      string
	baseURL     string
}

func (a *TaskAdaptor) Init(info *relaycommon.RelayInfo) {
	a.ChannelType = info.ChannelType
	a.baseURL = info.ChannelBaseUrl
	a.apiKey = info.ApiKey
}

func validateRemixRequest(c *gin.Context) *dto.TaskError {
	var req relaycommon.TaskSubmitReq
	if err := common.UnmarshalBodyReusable(c, &req); err != nil {
		return service.TaskErrorWrapperLocal(err, "invalid_request", http.StatusBadRequest)
	}
	if strings.TrimSpace(req.Prompt) == "" {
		return service.TaskErrorWrapperLocal(fmt.Errorf("field prompt is required"), "invalid_request", http.StatusBadRequest)
	}
	// 存储原始请求到 context，与 ValidateMultipartDirect 路径保持一致
	c.Set("task_request", req)
	return nil
}

func (a *TaskAdaptor) ValidateRequestAndSetAction(c *gin.Context, info *relaycommon.RelayInfo) (taskErr *dto.TaskError) {
	if info.Action == constant.TaskActionRemix {
		return validateRemixRequest(c)
	}
	return relaycommon.ValidateMultipartDirect(c, info)
}

// EstimateBilling 根据用户请求的 seconds 和 size 计算 OtherRatios。
func (a *TaskAdaptor) EstimateBilling(c *gin.Context, info *relaycommon.RelayInfo) map[string]float64 {
	// remix 路径的 OtherRatios 已在 ResolveOriginTask 中设置
	if info.Action == constant.TaskActionRemix {
		return nil
	}

	req, err := relaycommon.GetTaskRequest(c)
	if err != nil {
		return nil
	}
	if common.IsAPIMartAPIBaseURL(a.baseURL) && isAPIMartVideoModel(info.OriginModelName) {
		return apimartVideoBillingRatios(info.OriginModelName, req)
	}

	seconds, _ := strconv.Atoi(req.Seconds)
	if seconds == 0 {
		seconds = req.Duration
	}
	if seconds <= 0 {
		seconds = 4
	}

	size := req.Size
	if size == "" {
		size = "720x1280"
	}

	ratios := map[string]float64{
		"seconds": float64(seconds),
		"size":    1,
	}
	if size == "1792x1024" || size == "1024x1792" {
		ratios["size"] = 1.666667
	}
	return ratios
}

func (a *TaskAdaptor) BuildRequestURL(info *relaycommon.RelayInfo) (string, error) {
	if info.Action == constant.TaskActionRemix {
		return fmt.Sprintf("%s/v1/videos/%s/remix", a.baseURL, info.OriginTaskID), nil
	}
	if common.IsAPIMartAPIBaseURL(a.baseURL) && isAPIMartVideoModel(info.OriginModelName) {
		return fmt.Sprintf("%s/v1/videos/generations", a.baseURL), nil
	}
	return fmt.Sprintf("%s/v1/videos", a.baseURL), nil
}

// BuildRequestHeader sets required headers.
func (a *TaskAdaptor) BuildRequestHeader(c *gin.Context, req *http.Request, info *relaycommon.RelayInfo) error {
	req.Header.Set("Authorization", "Bearer "+a.apiKey)
	req.Header.Set("Content-Type", c.Request.Header.Get("Content-Type"))
	return nil
}

func (a *TaskAdaptor) BuildRequestBody(c *gin.Context, info *relaycommon.RelayInfo) (io.Reader, error) {
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return nil, errors.Wrap(err, "get_request_body_failed")
	}
	cachedBody, err := storage.Bytes()
	if err != nil {
		return nil, errors.Wrap(err, "read_body_bytes_failed")
	}
	contentType := c.GetHeader("Content-Type")

	if strings.HasPrefix(contentType, "application/json") {
		var bodyMap map[string]interface{}
		if err := common.Unmarshal(cachedBody, &bodyMap); err == nil {
			bodyMap["model"] = info.UpstreamModelName
			if common.IsAPIMartAPIBaseURL(a.baseURL) && isAPIMartVideoModel(info.OriginModelName) {
				bodyMap = normalizeAPIMartVideoPayload(bodyMap)
			}
			if newBody, err := common.Marshal(bodyMap); err == nil {
				return bytes.NewReader(newBody), nil
			}
		}
		return bytes.NewReader(cachedBody), nil
	}

	if strings.Contains(contentType, "multipart/form-data") {
		formData, err := common.ParseMultipartFormReusable(c)
		if err != nil {
			return bytes.NewReader(cachedBody), nil
		}
		var buf bytes.Buffer
		writer := multipart.NewWriter(&buf)
		writer.WriteField("model", info.UpstreamModelName)
		for key, values := range formData.Value {
			if key == "model" {
				continue
			}
			for _, v := range values {
				writer.WriteField(key, v)
			}
		}
		for fieldName, fileHeaders := range formData.File {
			for _, fh := range fileHeaders {
				f, err := fh.Open()
				if err != nil {
					continue
				}
				ct := fh.Header.Get("Content-Type")
				if ct == "" || ct == "application/octet-stream" {
					buf512 := make([]byte, 512)
					n, _ := io.ReadFull(f, buf512)
					ct = http.DetectContentType(buf512[:n])
					// Re-open after sniffing so the full content is copied below
					f.Close()
					f, err = fh.Open()
					if err != nil {
						continue
					}
				}
				h := make(textproto.MIMEHeader)
				h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"; filename="%s"`, fieldName, fh.Filename))
				h.Set("Content-Type", ct)
				part, err := writer.CreatePart(h)
				if err != nil {
					f.Close()
					continue
				}
				io.Copy(part, f)
				f.Close()
			}
		}
		writer.Close()
		c.Request.Header.Set("Content-Type", writer.FormDataContentType())
		return &buf, nil
	}

	return common.ReaderOnly(storage), nil
}

// normalizeAPIMartVideoPayload converts the OpenAI-compatible task fields
// accepted by the gateway into APIMart's video-generation schema. Unknown
// model-specific options are deliberately retained so new APIMart models do
// not require a gateway release for every parameter addition.
func normalizeAPIMartVideoPayload(body map[string]interface{}) map[string]interface{} {
	if body == nil {
		body = make(map[string]interface{})
	}
	if _, ok := body["duration"]; !ok {
		if value, ok := body["seconds"]; ok {
			switch v := value.(type) {
			case string:
				if duration, err := strconv.Atoi(strings.TrimSpace(v)); err == nil && duration > 0 {
					body["duration"] = duration
				}
			case float64:
				if v > 0 {
					body["duration"] = int(v)
				}
			}
		}
	}
	if _, ok := body["duration"]; !ok {
		body["duration"] = 5
	}

	resolution, aspectRatio := normalizeAPIMartVideoDimensions(body)
	if resolution != "" {
		body["resolution"] = resolution
	}
	if aspectRatio != "" {
		body["aspect_ratio"] = aspectRatio
	}

	// The gateway accepts all common reference aliases. APIMart expects a
	// URL array, so flatten them into image_urls without losing video/audio
	// references used by models that support them.
	if _, ok := body["image_urls"]; !ok {
		refs := make([]string, 0)
		for _, key := range []string{"image", "input_reference"} {
			if value, ok := body[key].(string); ok && strings.TrimSpace(value) != "" {
				refs = append(refs, strings.TrimSpace(value))
			}
		}
		if values, ok := body["images"].([]interface{}); ok {
			for _, value := range values {
				if ref, ok := value.(string); ok && strings.TrimSpace(ref) != "" {
					refs = append(refs, strings.TrimSpace(ref))
				}
			}
		}
		if len(refs) > 0 {
			body["image_urls"] = refs
		}
	}
	delete(body, "seconds")
	delete(body, "size")
	delete(body, "image")
	delete(body, "images")
	delete(body, "input_reference")
	return body
}

func normalizeAPIMartVideoDimensions(body map[string]interface{}) (string, string) {
	resolution, _ := body["resolution"].(string)
	resolution = strings.ToLower(strings.TrimSpace(resolution))
	aspectRatio, _ := body["aspect_ratio"].(string)
	aspectRatio = strings.TrimSpace(aspectRatio)
	size, _ := body["size"].(string)
	size = strings.ToLower(strings.TrimSpace(size))
	if strings.Contains(size, "x") {
		parts := strings.SplitN(size, "x", 2)
		if len(parts) == 2 {
			width, _ := strconv.Atoi(parts[0])
			height, _ := strconv.Atoi(parts[1])
			if width > 0 && height > 0 {
				aspectRatio = fmt.Sprintf("%d:%d", width/gcd(width, height), height/gcd(width, height))
			}
		}
		if resolution == "" {
			resolution = resolutionFromVideoSize(size)
		}
	}
	if resolution == "" {
		resolution = "720p"
	}
	return resolution, aspectRatio
}

func gcd(a, b int) int {
	for b != 0 {
		a, b = b, a%b
	}
	if a < 1 {
		return 1
	}
	return a
}

// DoRequest delegates to common helper.
func (a *TaskAdaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (*http.Response, error) {
	return channel.DoTaskApiRequest(a, c, info, requestBody)
}

// DoResponse handles upstream response, returns taskID etc.
func (a *TaskAdaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (taskID string, taskData []byte, taskErr *dto.TaskError) {
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		taskErr = service.TaskErrorWrapper(err, "read_response_body_failed", http.StatusInternalServerError)
		return
	}
	_ = resp.Body.Close()
	if common.IsAPIMartAPIBaseURL(a.baseURL) && isAPIMartVideoModel(info.OriginModelName) {
		var submission apimartTaskSubmissionResponse
		if err := common.Unmarshal(responseBody, &submission); err != nil {
			return "", nil, service.TaskErrorWrapper(errors.Wrapf(err, "body: %s", responseBody), "unmarshal_response_body_failed", http.StatusInternalServerError)
		}
		if submission.Error != nil && strings.TrimSpace(submission.Error.Message) != "" {
			return "", nil, service.TaskErrorWrapper(fmt.Errorf("%s", submission.Error.Message), submission.Error.Code, http.StatusBadGateway)
		}
		if len(submission.Data) == 0 {
			return "", nil, service.TaskErrorWrapper(fmt.Errorf("task data is empty: %s", submission.Message), "invalid_response", http.StatusBadGateway)
		}
		upstreamID := strings.TrimSpace(submission.Data[0].TaskID)
		if upstreamID == "" {
			upstreamID = strings.TrimSpace(submission.Data[0].ID)
		}
		if upstreamID == "" {
			return "", nil, service.TaskErrorWrapper(fmt.Errorf("task_id is empty"), "invalid_response", http.StatusBadGateway)
		}
		video := dto.NewOpenAIVideo()
		video.ID = info.PublicTaskID
		video.TaskID = info.PublicTaskID
		video.Model = info.OriginModelName
		video.CreatedAt = time.Now().Unix()
		c.JSON(http.StatusOK, video)
		return upstreamID, responseBody, nil
	}

	// Parse Sora response
	var dResp responseTask
	if err := common.Unmarshal(responseBody, &dResp); err != nil {
		taskErr = service.TaskErrorWrapper(errors.Wrapf(err, "body: %s", responseBody), "unmarshal_response_body_failed", http.StatusInternalServerError)
		return
	}

	upstreamID := dResp.ID
	if upstreamID == "" {
		upstreamID = dResp.TaskID
	}
	if upstreamID == "" {
		taskErr = service.TaskErrorWrapper(fmt.Errorf("task_id is empty"), "invalid_response", http.StatusInternalServerError)
		return
	}

	// 使用公开 task_xxxx ID 返回给客户端
	dResp.ID = info.PublicTaskID
	dResp.TaskID = info.PublicTaskID
	c.JSON(http.StatusOK, dResp)
	return upstreamID, responseBody, nil
}

// FetchTask fetch task status
func (a *TaskAdaptor) FetchTask(baseUrl, key string, body map[string]any, proxy string) (*http.Response, error) {
	taskID, ok := body["task_id"].(string)
	if !ok {
		return nil, fmt.Errorf("invalid task_id")
	}

	modelName, _ := body["origin_model"].(string)
	action, _ := body["action"].(string)
	uri := buildTaskFetchURL(baseUrl, taskID, modelName, action)

	req, err := http.NewRequest(http.MethodGet, uri, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+key)

	client, err := service.GetHttpClientWithProxy(proxy)
	if err != nil {
		return nil, fmt.Errorf("new proxy http client failed: %w", err)
	}
	return client.Do(req)
}

// buildTaskFetchURL keeps task polling on the same provider endpoint used for
// submission. APIMart exposes both image and video jobs through /v1/tasks;
// other Sora-compatible providers continue using /v1/videos.
func buildTaskFetchURL(baseURL, taskID, modelName, action string) string {
	if common.IsAPIMartAPIBaseURL(baseURL) &&
		(action == constant.TaskActionImageGenerate || isOpenAIImageTaskModel(modelName) || isAPIMartVideoModel(modelName)) {
		return fmt.Sprintf("%s/v1/tasks/%s", strings.TrimRight(baseURL, "/"), taskID)
	}
	return fmt.Sprintf("%s/v1/videos/%s", strings.TrimRight(baseURL, "/"), taskID)
}

func (a *TaskAdaptor) GetModelList() []string {
	return ModelList
}

func (a *TaskAdaptor) GetChannelName() string {
	return ChannelName
}

func (a *TaskAdaptor) ParseTaskResult(respBody []byte) (*relaycommon.TaskInfo, error) {
	if taskResult, ok := parseAPIMartTaskResult(respBody); ok {
		return taskResult, nil
	}

	resTask := responseTask{}
	if err := common.Unmarshal(respBody, &resTask); err != nil {
		return nil, errors.Wrap(err, "unmarshal task result failed")
	}

	taskResult := relaycommon.TaskInfo{
		Code: 0,
	}

	switch resTask.Status {
	case "queued", "pending":
		taskResult.Status = model.TaskStatusQueued
	case "processing", "in_progress":
		taskResult.Status = model.TaskStatusInProgress
	case "completed":
		taskResult.Status = model.TaskStatusSuccess
		// Url intentionally left empty — the caller constructs the proxy URL using the public task ID
	case "failed", "cancelled":
		taskResult.Status = model.TaskStatusFailure
		if resTask.Error != nil {
			taskResult.Reason = resTask.Error.Message
		} else {
			taskResult.Reason = "task failed"
		}
	default:
	}
	if resTask.Progress > 0 && resTask.Progress < 100 {
		taskResult.Progress = fmt.Sprintf("%d%%", resTask.Progress)
	}

	return &taskResult, nil
}

func (a *TaskAdaptor) AdjustBillingOnComplete(task *model.Task, taskResult *relaycommon.TaskInfo) int {
	if task == nil || taskResult == nil || taskResult.SourceCostUSD <= 0 {
		return 0
	}
	if !common.IsAPIMartAPIBaseURL(a.baseURL) {
		return 0
	}
	const sellingMarkup = 1.15
	return int(math.Round(taskResult.SourceCostUSD * sellingMarkup * common.QuotaPerUnit))
}

func isOpenAIImageTaskModel(modelName string) bool {
	modelName = strings.ToLower(strings.TrimSpace(modelName))
	if strings.HasPrefix(modelName, "gpt-image-") || strings.HasPrefix(modelName, "chatgpt-image-") {
		return true
	}
	_, ok := apimartImageTaskModels[modelName]
	return ok
}

var apimartImageTaskModels = map[string]struct{}{
	"flux-2-flex":                    {},
	"flux-2-max":                     {},
	"flux-2-pro":                     {},
	"flux-kontext-max":               {},
	"flux-kontext-pro":               {},
	"gemini-2.5-flash-image-preview": {},
	"gemini-3-pro-image-preview":     {},
	"gemini-3.1-flash-image-preview": {},
	"gemini-3.1-flash-lite-image":    {},
	"grok-imagine-1.5-apimart":       {},
	"grok-imagine-2.0-ext":           {},
	"grok-imagine-image":             {},
	"grok-imagine-image-2.0":         {},
	"grok-imagine-image-quality":     {},
	"imagen-4.0-apimart":             {},
	"qwen-image-2.0":                 {},
	"qwen-image-2.0-pro":             {},
	"qwen-image-3.0":                 {},
	"qwen-image-3.0-pro":             {},
	"seedream-4.0":                   {},
	"seedream-4.5":                   {},
	"seedream-5-0-lite":              {},
	"seedream-5-0-pro":               {},
	"wan2.7-image":                   {},
	"wan2.7-image-pro":               {},
	"z-image-turbo":                  {},
}

func parseAPIMartTaskResult(respBody []byte) (*relaycommon.TaskInfo, bool) {
	// APIMart uses {code,data:{...}} for task queries, while some compatible
	// gateways return data as a one-item array. Decode the envelope separately
	// so an array cannot make the whole response look invalid.
	var envelope struct {
		Code    int             `json:"code"`
		Data    json.RawMessage `json:"data"`
		Error   *struct {
			Message string `json:"message"`
			Code    string `json:"code"`
		} `json:"error,omitempty"`
		Message string `json:"message,omitempty"`
	}
	if err := common.Unmarshal(respBody, &envelope); err == nil && len(envelope.Data) > 0 {
		var task responseImageTask
		if err := common.Unmarshal(envelope.Data, &task); err != nil {
			var items []responseImageTask
			if arrayErr := common.Unmarshal(envelope.Data, &items); arrayErr == nil && len(items) > 0 {
				task = items[0]
			} else {
				var generic map[string]any
				if common.Unmarshal(envelope.Data, &generic) == nil {
					if nested, ok := generic["task"].(map[string]any); ok {
						if nestedBytes, marshalErr := common.Marshal(nested); marshalErr == nil {
							_ = common.Unmarshal(nestedBytes, &task)
						}
					}
				}
			}
		}
		if result, ok := buildOpenAIImageTaskInfo(task); ok {
			return result, true
		}
	}
	if envelope.Error != nil && strings.TrimSpace(envelope.Error.Message) != "" {
		return &relaycommon.TaskInfo{
			Code:     0,
			Status:   model.TaskStatusFailure,
			Progress: "100%",
			Reason:   strings.TrimSpace(envelope.Error.Message),
		}, true
	}

	var resTask responseImageTask
	if err := common.Unmarshal(respBody, &resTask); err != nil {
		return nil, false
	}
	return buildOpenAIImageTaskInfo(resTask)
}

func buildOpenAIImageTaskInfo(resTask responseImageTask) (*relaycommon.TaskInfo, bool) {
	status := strings.ToLower(strings.TrimSpace(resTask.Status))
	if status == "" {
		return nil, false
	}

	taskResult := relaycommon.TaskInfo{
		Code:          0,
		SourceCostUSD: resTask.Cost,
		TotalTokens:   resTask.Usage.TotalTokens,
	}
	switch status {
	case "submitted", "queued", "pending":
		taskResult.Status = model.TaskStatusQueued
		taskResult.Progress = "10%"
	case "processing", "in_progress", "running":
		taskResult.Status = model.TaskStatusInProgress
		taskResult.Progress = "50%"
	case "succeeded", "completed", "success":
		taskResult.Status = model.TaskStatusSuccess
		taskResult.Progress = "100%"
		for _, item := range resTask.Data {
			if strings.TrimSpace(item.URL) != "" {
				taskResult.Url = strings.TrimSpace(item.URL)
				break
			}
			if strings.TrimSpace(item.B64) != "" {
				taskResult.Url = "data:image/png;base64," + strings.TrimSpace(item.B64)
				break
			}
		}
		if taskResult.Url == "" {
			taskResult.Url = firstImageResultURL(resTask.Result.Images)
		}
		if taskResult.Url == "" {
			taskResult.Url = firstVideoResultURL(resTask.Result.Videos)
		}
	case "failed", "cancelled", "canceled":
		taskResult.Status = model.TaskStatusFailure
		taskResult.Progress = "100%"
		if resTask.Error != nil && strings.TrimSpace(resTask.Error.Message) != "" {
			taskResult.Reason = strings.TrimSpace(resTask.Error.Message)
		} else if strings.TrimSpace(resTask.Message) != "" {
			taskResult.Reason = strings.TrimSpace(resTask.Message)
		} else {
			taskResult.Reason = "task failed"
		}
	default:
		return nil, false
	}

	if resTask.Progress > 0 && resTask.Progress < 100 {
		taskResult.Progress = fmt.Sprintf("%d%%", resTask.Progress)
	}

	return &taskResult, true
}

func firstImageResultURL(images []struct {
	URL any `json:"url"`
}) string {
	for _, image := range images {
		switch value := image.URL.(type) {
		case string:
			if strings.TrimSpace(value) != "" {
				return strings.TrimSpace(value)
			}
		case []any:
			for _, item := range value {
				if url, ok := item.(string); ok && strings.TrimSpace(url) != "" {
					return strings.TrimSpace(url)
				}
			}
		case []string:
			for _, url := range value {
				if strings.TrimSpace(url) != "" {
					return strings.TrimSpace(url)
				}
			}
		}
	}
	return ""
}

func firstVideoResultURL(videos []struct {
	URL any `json:"url"`
}) string {
	for _, video := range videos {
		switch value := video.URL.(type) {
		case string:
			if strings.TrimSpace(value) != "" {
				return strings.TrimSpace(value)
			}
		case []any:
			for _, item := range value {
				if url, ok := item.(string); ok && strings.TrimSpace(url) != "" {
					return strings.TrimSpace(url)
				}
			}
		case []string:
			for _, url := range value {
				if strings.TrimSpace(url) != "" {
					return strings.TrimSpace(url)
				}
			}
		}
	}
	return ""
}

func (a *TaskAdaptor) ConvertToOpenAIVideo(task *model.Task) ([]byte, error) {
	if isAPIMartVideoTask(task) {
		video := dto.NewOpenAIVideo()
		video.ID = task.TaskID
		video.TaskID = task.TaskID
		video.Model = task.Properties.OriginModelName
		video.CreatedAt = task.SubmitTime
		video.Status = task.Status.ToVideoStatus()
		video.SetProgressStr(task.Progress)
		if task.Status == model.TaskStatusSuccess {
			video.SetMetadata("url", task.GetResultURL())
		}
		if task.Status == model.TaskStatusFailure {
			video.Error = &dto.OpenAIVideoError{Message: task.FailReason, Code: "task_failed"}
		}
		return common.Marshal(video)
	}
	data := task.Data
	var err error
	if data, err = sjson.SetBytes(data, "id", task.TaskID); err != nil {
		return nil, errors.Wrap(err, "set id failed")
	}
	return data, nil
}

func isAPIMartVideoTask(task *model.Task) bool {
	if task == nil {
		return false
	}
	modelName := strings.ToLower(strings.TrimSpace(task.Properties.OriginModelName))
	if isAPIMartVideoModel(modelName) {
		return true
	}
	var envelope struct {
		Code int `json:"code"`
		Data json.RawMessage `json:"data"`
	}
	return common.Unmarshal(task.Data, &envelope) == nil && envelope.Code == 200 && len(envelope.Data) > 0 && strings.Contains(strings.ToLower(string(envelope.Data)), "video")
}
