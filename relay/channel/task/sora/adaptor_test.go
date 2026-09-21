package sora

import (
	"bytes"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
)

func TestNormalizeAPIMartVideoPayload(t *testing.T) {
	body := normalizeAPIMartVideoPayload(map[string]interface{}{
		"model":   "sora-2",
		"prompt":  "A quiet ocean at dawn",
		"seconds": "8",
		"size":    "1920x1080",
		"image":   "https://example.test/frame.png",
	})
	if got := body["duration"]; got != 8 {
		t.Fatalf("expected duration 8, got %#v", got)
	}
	if got := body["resolution"]; got != "1080p" {
		t.Fatalf("expected 1080p resolution, got %#v", got)
	}
	if got := body["aspect_ratio"]; got != "16:9" {
		t.Fatalf("expected 16:9 aspect ratio, got %#v", got)
	}
	refs, ok := body["image_urls"].([]string)
	if !ok || len(refs) != 1 || refs[0] == "" {
		t.Fatalf("expected one image URL, got %#v", body["image_urls"])
	}
	for _, key := range []string{"seconds", "size", "image"} {
		if _, exists := body[key]; exists {
			t.Fatalf("legacy field %s should be removed", key)
		}
	}
}

func TestBuildRequestBodyAPIMartVideoJSON(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	body := []byte(`{"model":"sora-2","prompt":"test","seconds":"6","size":"1280x720"}`)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/videos/generations", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		t.Fatalf("storage: %v", err)
	}
	defer storage.Close()
	adaptor := &TaskAdaptor{baseURL: "https://api.apimart.ai"}
	info := &relaycommon.RelayInfo{
		OriginModelName: "sora-2",
		ChannelMeta:     &relaycommon.ChannelMeta{UpstreamModelName: "sora-2"},
	}
	reader, err := adaptor.BuildRequestBody(c, info)
	if err != nil {
		t.Fatalf("BuildRequestBody: %v", err)
	}
	var payload map[string]interface{}
	if err := json.NewDecoder(reader).Decode(&payload); err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	if payload["duration"] != float64(6) || payload["resolution"] != "720p" || payload["aspect_ratio"] != "16:9" {
		t.Fatalf("unexpected APIMart payload: %#v", payload)
	}
}

func TestBuildTaskFetchURLUsesImageEndpointForGPTImageModels(t *testing.T) {
	got := buildTaskFetchURL("https://api.apimart.ai", "task_test", "gpt-image-2", "")
	if got != "https://api.apimart.ai/v1/tasks/task_test" {
		t.Fatalf("expected image task endpoint, got %q", got)
	}
}

func TestAPIMartImageTaskCostSettlement(t *testing.T) {
	adaptor := &TaskAdaptor{baseURL: "https://api.apimart.ai"}
	task := &model.Task{Action: constant.TaskActionImageGenerate}
	result := &relaycommon.TaskInfo{SourceCostUSD: 0.08}
	expected := int(math.Round(0.08 * 1.15 * common.QuotaPerUnit))
	if actual := adaptor.AdjustBillingOnComplete(task, result); actual != expected {
		t.Fatalf("expected quota %d, got %d", expected, actual)
	}
}

func TestBuildTaskFetchURLUsesImageEndpointForAPIMartImageModels(t *testing.T) {
	models := []string{
		"seedream-5-0-pro",
		"flux-2-max",
		"qwen-image-3.0-pro",
		"grok-imagine-image-2.0",
		"wan2.7-image-pro",
	}
	for _, modelName := range models {
		t.Run(modelName, func(t *testing.T) {
			got := buildTaskFetchURL("https://api.apimart.ai", "task_test", modelName, "")
			if got != "https://api.apimart.ai/v1/tasks/task_test" {
				t.Fatalf("expected image task endpoint, got %q", got)
			}
		})
	}
}

func TestParseTaskResultParsesOpenAIImageURL(t *testing.T) {
	adaptor := &TaskAdaptor{}
	result, err := adaptor.ParseTaskResult([]byte(`{
		"id":"task_test",
		"status":"succeeded",
		"data":[{"url":"https://example.test/image.png"}]
	}`))
	if err != nil {
		t.Fatalf("ParseTaskResult returned error: %v", err)
	}

	if result.Status != model.TaskStatusSuccess {
		t.Fatalf("expected success status, got %q", result.Status)
	}
	if result.Url != "https://example.test/image.png" {
		t.Fatalf("expected image URL, got %q", result.Url)
	}
}

func TestParseTaskResultParsesAPIMartImageURL(t *testing.T) {
	adaptor := &TaskAdaptor{}
	result, err := adaptor.ParseTaskResult([]byte(`{
		"code": 200,
		"data": {
			"id": "task_test",
			"status": "completed",
			"progress": 100,
			"result": {
				"images": [
					{"url": ["https://example.test/apimart.png"]}
				]
			}
		}
	}`))
	if err != nil {
		t.Fatalf("ParseTaskResult returned error: %v", err)
	}

	if result.Status != model.TaskStatusSuccess {
		t.Fatalf("expected success status, got %q", result.Status)
	}
	if result.Url != "https://example.test/apimart.png" {
		t.Fatalf("expected APIMart image URL, got %q", result.Url)
	}
}

func TestParseTaskResultParsesAPIMartSubmittedArray(t *testing.T) {
	adaptor := &TaskAdaptor{}
	result, err := adaptor.ParseTaskResult([]byte(`{
		"code": 200,
		"data": [{"task_id":"task_array","status":"submitted"}]
	}`))
	if err != nil {
		t.Fatalf("ParseTaskResult returned error: %v", err)
	}
	if result.Status != model.TaskStatusQueued {
		t.Fatalf("expected queued status, got %q", result.Status)
	}
}
