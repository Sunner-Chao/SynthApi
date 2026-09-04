package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
)

func TestBuildAPIMartImageTaskResponseCompleted(t *testing.T) {
	t.Parallel()
	task := &model.Task{
		TaskID:     "task_public",
		Status:     model.TaskStatusSuccess,
		Progress:   "100%",
		SubmitTime: 100,
		FinishTime: 150,
		PrivateData: model.TaskPrivateData{
			ResultURL: "https://example.test/image.png",
		},
		Data: []byte(`{"code":200,"data":{"id":"task_upstream","status":"completed","progress":100}}`),
	}

	response := buildAPIMartImageTaskResponse(task)
	data, ok := response["data"].(map[string]any)
	if !ok {
		t.Fatalf("data = %T, want map", response["data"])
	}
	if data["id"] != "task_public" || data["task_id"] != "task_public" {
		t.Fatalf("public task identifiers missing: %#v", data)
	}
	if data["status"] != "completed" || data["progress"] != 100 {
		t.Fatalf("unexpected task status: %#v", data)
	}
	result, ok := data["result"].(map[string]any)
	if !ok || result["images"] == nil {
		t.Fatalf("image result missing: %#v", data)
	}
}

func TestBuildAPIMartImageTaskResponsePreservesUpstreamResult(t *testing.T) {
	t.Parallel()
	task := &model.Task{
		TaskID:   "task_public",
		Status:   model.TaskStatusSuccess,
		Progress: "100%",
		Data: []byte(`{
			"code":200,
			"data":{
				"status":"completed",
				"result":{"images":[{"url":["https://example.test/upstream.png"]}]}
			}
		}`),
	}

	response := buildAPIMartImageTaskResponse(task)
	data := response["data"].(map[string]any)
	if !hasAPIMartImageResult(data) {
		t.Fatalf("stored APIMart result missing: %#v", data)
	}
}
