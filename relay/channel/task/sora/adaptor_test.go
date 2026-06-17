package sora

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/model"
)

func TestFetchTaskUsesImageEndpointForGPTImageModels(t *testing.T) {
	var gotPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		_, _ = w.Write([]byte(`{"status":"succeeded","data":[{"url":"https://example.test/image.png"}]}`))
	}))
	defer server.Close()

	adaptor := &TaskAdaptor{}
	resp, err := adaptor.FetchTask(server.URL, "test-key", map[string]any{
		"task_id":      "task_test",
		"origin_model": "gpt-image-2",
	}, "")
	if err != nil {
		t.Fatalf("FetchTask returned error: %v", err)
	}
	_ = resp.Body.Close()

	if gotPath != "/v1/tasks/task_test" {
		t.Fatalf("expected image task endpoint, got %q", gotPath)
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
