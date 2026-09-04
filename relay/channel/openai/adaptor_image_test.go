package openai

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"

	"github.com/gin-gonic/gin"
)

func TestNormalizeAPIMartImageTaskResponse(t *testing.T) {
	t.Parallel()

	normalized := normalizeOpenAIImageTaskResponse([]byte(`{
		"code": 200,
		"data": [{"status":"submitted","task_id":"task_test"}]
	}`))
	var payload map[string]any
	if err := json.Unmarshal(normalized, &payload); err != nil {
		t.Fatal(err)
	}
	if payload["task_id"] != "task_test" || payload["id"] != "task_test" {
		t.Fatalf("normalized task identifiers missing: %#v", payload)
	}
	if payload["status"] != "submitted" {
		t.Fatalf("normalized status = %#v", payload["status"])
	}
	if _, ok := payload["data"].([]any); !ok {
		t.Fatalf("upstream data wrapper was not preserved: %#v", payload["data"])
	}
}

func TestConvertAPIMartGPTImage2MultipartEditToGeneration(t *testing.T) {
	t.Parallel()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("model", "gpt-image-2"); err != nil {
		t.Fatal(err)
	}
	if err := writer.WriteField("prompt", "use the reference"); err != nil {
		t.Fatal(err)
	}
	if err := writer.WriteField("resolution", "2k"); err != nil {
		t.Fatal(err)
	}
	part, err := writer.CreateFormFile("image", "reference.png")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = part.Write([]byte("image-data")); err != nil {
		t.Fatal(err)
	}
	if err = writer.Close(); err != nil {
		t.Fatal(err)
	}

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/images/edits", &body)
	c.Request.Header.Set("Content-Type", writer.FormDataContentType())
	if err = c.Request.ParseMultipartForm(32 << 20); err != nil {
		t.Fatal(err)
	}

	info := &relaycommon.RelayInfo{
		RelayMode:      relayconstant.RelayModeImagesEdits,
		RequestURLPath: "/v1/images/edits",
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelBaseUrl: "https://api.apimart.ai",
		},
	}
	converted, err := (&Adaptor{}).ConvertImageRequest(c, info, dto.ImageRequest{
		Model:  "gpt-image-2",
		Prompt: "use the reference",
	})
	if err != nil {
		t.Fatalf("ConvertImageRequest returned error: %v", err)
	}

	request, ok := converted.(dto.ImageRequest)
	if !ok {
		t.Fatalf("converted request type = %T, want dto.ImageRequest", converted)
	}
	if info.RelayMode != relayconstant.RelayModeImagesGenerations {
		t.Fatalf("relay mode = %d, want image generations", info.RelayMode)
	}
	if info.RequestURLPath != "/v1/images/generations" {
		t.Fatalf("request path = %q", info.RequestURLPath)
	}
	if contentType := c.Request.Header.Get("Content-Type"); contentType != "application/json" {
		t.Fatalf("content type = %q, want application/json", contentType)
	}
	if request.GetResolution() != "2k" {
		t.Fatalf("resolution = %q, want 2k", request.GetResolution())
	}
	if len(request.ImageURLs) != 1 || !strings.HasPrefix(request.ImageURLs[0], "data:image/png;base64,") {
		t.Fatalf("image_urls = %#v", request.ImageURLs)
	}
	url, err := (&Adaptor{}).GetRequestURL(info)
	if err != nil {
		t.Fatal(err)
	}
	if url != "https://api.apimart.ai/v1/images/generations" {
		t.Fatalf("upstream URL = %q", url)
	}
}

func TestConvertAPIMartGPTImage2JSONEditKeepsImageURLs(t *testing.T) {
	t.Parallel()

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/images/edits", strings.NewReader(`{}`))
	c.Request.Header.Set("Content-Type", "application/json")
	info := &relaycommon.RelayInfo{
		RelayMode:      relayconstant.RelayModeImagesEdits,
		RequestURLPath: "/v1/images/edits",
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelBaseUrl: "https://api.apimart.ai",
		},
	}

	converted, err := (&Adaptor{}).ConvertImageRequest(c, info, dto.ImageRequest{
		Model:     "gpt-image-2",
		Prompt:    "use the reference",
		ImageURLs: []string{"https://example.test/reference.png"},
	})
	if err != nil {
		t.Fatalf("ConvertImageRequest returned error: %v", err)
	}
	request := converted.(dto.ImageRequest)
	if len(request.ImageURLs) != 1 || request.ImageURLs[0] != "https://example.test/reference.png" {
		t.Fatalf("image_urls = %#v", request.ImageURLs)
	}
	if info.RequestURLPath != "/v1/images/generations" {
		t.Fatalf("request path = %q", info.RequestURLPath)
	}
}

func TestConvertNonAPIMartImageEditKeepsNativeRoute(t *testing.T) {
	t.Parallel()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	_ = writer.WriteField("model", "grok-imagine-image")
	_ = writer.WriteField("prompt", "edit")
	part, err := writer.CreateFormFile("image", "reference.png")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = part.Write([]byte("image-data"))
	_ = writer.Close()

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/images/edits", &body)
	c.Request.Header.Set("Content-Type", writer.FormDataContentType())
	if err = c.Request.ParseMultipartForm(32 << 20); err != nil {
		t.Fatal(err)
	}
	info := &relaycommon.RelayInfo{
		RelayMode:      relayconstant.RelayModeImagesEdits,
		RequestURLPath: "/v1/images/edits",
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelBaseUrl: "https://api.x.ai",
		},
	}

	converted, err := (&Adaptor{}).ConvertImageRequest(c, info, dto.ImageRequest{
		Model:  "grok-imagine-image",
		Prompt: "edit",
	})
	if err != nil {
		t.Fatalf("ConvertImageRequest returned error: %v", err)
	}
	if _, ok := converted.(*bytes.Buffer); !ok {
		t.Fatalf("converted request type = %T, want multipart buffer", converted)
	}
	if info.RelayMode != relayconstant.RelayModeImagesEdits || info.RequestURLPath != "/v1/images/edits" {
		t.Fatalf("native edit route changed: mode=%d path=%q", info.RelayMode, info.RequestURLPath)
	}
}
