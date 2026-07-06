package openai

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestOaiResponsesStreamToChatHandlerAggregatesJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	c.Set(common.RequestIdKey, "test-request")

	body := strings.Join([]string{
		`data: {"type":"response.created","response":{"model":"codex-mini","created_at":123}}`,
		`data: {"type":"response.output_text.delta","delta":"hello "}`,
		`data: {"type":"response.output_text.delta","delta":"world"}`,
		`data: {"type":"response.completed","response":{"model":"codex-mini","created_at":123,"usage":{"input_tokens":2,"output_tokens":3,"total_tokens":5}}}`,
		`data: [DONE]`,
		``,
	}, "\n")
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader(body)),
	}
	info := &relaycommon.RelayInfo{
		RelayFormat: types.RelayFormatOpenAI,
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: "codex-mini",
		},
	}

	usage, apiErr := OaiResponsesStreamToChatHandler(c, info, resp)
	require.Nil(t, apiErr)
	require.Equal(t, 5, usage.TotalTokens)
	require.NotContains(t, recorder.Header().Get("Content-Type"), "text/event-stream")

	var chatResp dto.OpenAITextResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &chatResp))
	require.Equal(t, "chatcmpl-test-request", chatResp.Id)
	require.Equal(t, "chat.completion", chatResp.Object)
	require.Equal(t, "codex-mini", chatResp.Model)
	require.Equal(t, "hello world", chatResp.Choices[0].Message.Content)
	require.Equal(t, "stop", chatResp.Choices[0].FinishReason)
	require.Equal(t, 5, chatResp.TotalTokens)
}
