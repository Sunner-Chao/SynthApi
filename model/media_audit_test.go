package model

import (
	"context"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/require"
)

func TestMediaClassificationAndAuditIsolation(t *testing.T) {
	truncateTables(t)
	cases := []struct{ name, path, kind string }{
		{"gpt-image-2.5", "/v1/images/generations", "image"}, {"alias", "/api/playground/images/generations", "image"},
		{"gpt-4o", "/v1/chat/completions", "other"}, {"gemini-3-pro", "", "other"},
		{"gemini-3-pro-image-preview", "/v1/chat/completions", "image"}, {"wan2.7-image", "", "image"},
		{"seedance-1-0-pro", "", "video"}, {"grok-imagine-video", "", "video"}, {"mj_video", "", "video"},
		{"mj_imagine", "/mj/submit/imagine", "image"}, {"alias", "/v1/videos", "video"}, {"nano-banana", "", "image"},
	}
	for _, tc := range cases {
		require.Equal(t, tc.kind, ClassifyMediaLog(tc.name, tc.path), tc.name)
	}
	for _, entry := range []*Log{
		{UserId: 41, Type: LogTypeConsume, ModelName: "gpt-image-2.5", Quota: 100, CreatedAt: 100},
		{UserId: 41, Type: LogTypeRefund, ModelName: "gpt-image-2.5", Quota: 20, CreatedAt: 101},
		{UserId: 41, Type: LogTypeError, ModelName: "gpt-image-2.5", CreatedAt: 102},
		{UserId: 42, Type: LogTypeConsume, ModelName: "gpt-image-2.5", Quota: 999, CreatedAt: 103},
		{UserId: 41, Type: LogTypeConsume, ModelName: "seedance", Quota: 200, CreatedAt: 104},
		{UserId: 41, Type: LogTypeConsume, ModelName: "gpt-4o", Quota: 300, CreatedAt: 105},
	} {
		require.NoError(t, LOG_DB.Create(entry).Error)
	}
	q := MediaAuditQuery{Kind: "image", View: "requests", UserID: 41, Start: 99, End: 110, Limit: 2}
	page, err := GetMediaAuditPage(context.Background(), q)
	require.NoError(t, err)
	require.Equal(t, int64(3), page.Summary.Total)
	require.Equal(t, int64(100), page.Summary.Charged)
	require.Equal(t, int64(20), page.Summary.Refunded)
	require.Equal(t, int64(1), page.Summary.Errors)
	require.Len(t, page.Items, 2)
	first := page.Items[0].ID
	q.Offset = 2
	next, err := GetMediaAuditPage(context.Background(), q)
	require.NoError(t, err)
	require.Len(t, next.Items, 1)
	require.NotEqual(t, first, next.Items[0].ID)
	q.Offset = 0
	q.Status = "REFUND"
	page, err = GetMediaAuditPage(context.Background(), q)
	require.NoError(t, err)
	require.Equal(t, int64(1), page.Summary.Total)
	logs, total, err := GetUserLogs(41, 0, 99, 110, "", "", 0, 20, "", "", "", "other")
	require.NoError(t, err)
	require.Equal(t, int64(1), total)
	require.Equal(t, "gpt-4o", logs[0].ModelName)
	q.Status = ""
	q.UserID = 0
	page, err = GetMediaAuditPage(context.Background(), q)
	require.NoError(t, err)
	require.Equal(t, int64(4), page.Summary.Total)
}

func TestMediaTasksFilterAndPrivateData(t *testing.T) {
	truncateTables(t)
	for _, task := range []*Task{
		{TaskID: "image", UserId: 41, Action: constant.TaskActionImageGenerate, SubmitTime: 100, Properties: Properties{OriginModelName: "gpt-image-2.5", Input: "audit prompt"}, PrivateData: TaskPrivateData{Key: "secret"}, Data: []byte(`{"api_key":"secret"}`)},
		{TaskID: "video", UserId: 41, Action: constant.TaskActionReferenceGenerate, SubmitTime: 101},
		{TaskID: "audio", UserId: 41, Action: constant.TaskActionGenerate, Platform: constant.TaskPlatformSuno, SubmitTime: 101},
		{TaskID: "someone-else", UserId: 42, Action: constant.TaskActionImageGenerate, SubmitTime: 102},
	} {
		require.NoError(t, DB.Create(task).Error)
	}
	q := MediaAuditQuery{Kind: "image", View: "tasks", UserID: 41, Start: 99, End: 110, Limit: 20, Model: "gpt-image-2.5"}
	page, err := GetMediaAuditPage(context.Background(), q)
	require.NoError(t, err)
	require.Len(t, page.Items, 1)
	require.Equal(t, "image", page.Items[0].TaskID)
	encoded, err := common.Marshal(page)
	require.NoError(t, err)
	require.NotContains(t, string(encoded), "secret")
	q.Model = "%"
	page, err = GetMediaAuditPage(context.Background(), q)
	require.NoError(t, err)
	require.Empty(t, page.Items)
	q.Model = ""
	q.Kind = "video"
	page, err = GetMediaAuditPage(context.Background(), q)
	require.NoError(t, err)
	require.Len(t, page.Items, 1)
	require.Equal(t, "video", page.Items[0].TaskID)
}
