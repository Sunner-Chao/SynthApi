package openaicompat

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/stretchr/testify/require"
)

func TestChatCompletionsRequestToResponsesAddsWebSearchAndFileDataURL(t *testing.T) {
	req := &dto.GeneralOpenAIRequest{
		Model: "gpt-5.5",
		Messages: []dto.Message{
			{
				Role: "user",
				Content: []any{
					map[string]any{"type": "text", "text": "read this"},
					map[string]any{
						"type": "file",
						"file": map[string]any{
							"filename":  "note.txt",
							"file_data": "aGVsbG8=",
							"mime_type": "text/plain",
						},
					},
				},
			},
		},
		WebSearchOptions: &dto.WebSearchOptions{SearchContextSize: "medium"},
	}

	responsesReq, err := ChatCompletionsRequestToResponsesRequest(req)
	require.NoError(t, err)

	var input []map[string]any
	require.NoError(t, common.Unmarshal(responsesReq.Input, &input))
	require.Len(t, input, 1)
	content, ok := input[0]["content"].([]any)
	require.True(t, ok)
	require.Len(t, content, 2)
	filePart, ok := content[1].(map[string]any)
	require.True(t, ok)
	require.Equal(t, "input_file", filePart["type"])
	require.Equal(t, "data:text/plain;base64,aGVsbG8=", filePart["file_data"])
	require.Equal(t, "note.txt", filePart["filename"])
	require.Equal(t, "text/plain", filePart["mime_type"])

	var tools []map[string]any
	require.NoError(t, common.Unmarshal(responsesReq.Tools, &tools))
	require.Len(t, tools, 1)
	require.Equal(t, dto.BuildInToolWebSearchPreview, tools[0]["type"])
	require.Equal(t, "medium", tools[0]["search_context_size"])
}
