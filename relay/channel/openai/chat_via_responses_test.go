package openai

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
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

func TestOaiResponsesStreamHandlerForwardsExtendedEvents(t *testing.T) {
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	c.Set(common.RequestIdKey, "extended-event")

	body := strings.Join([]string{
		`data: {"type":"response.reasoning.encrypted_content","encrypted_content":"opaque-state","codex.response.metadata":{"turn_id":"turn-1"}}`,
		// Some compatible providers attach an object to delta for an extended
		// event. The gateway must forward that valid JSON instead of failing the
		// entire stream because the stable DTO models delta as a string.
		`data: {"type":"response.custom.delta","delta":{"encrypted_content":"opaque-delta"}}`,
		`data: {"type":"response.completed","response":{"model":"codex-mini","created_at":123,"usage":{"input_tokens":2,"output_tokens":3,"total_tokens":5}},"codex.response.metadata":{"turn_id":"turn-1"}}`,
		`data: [DONE]`,
		``,
	}, "\n")
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader(body)),
	}
	info := &relaycommon.RelayInfo{
		RelayFormat: types.RelayFormatOpenAIResponses,
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "codex-mini"},
	}

	usage, apiErr := OaiResponsesStreamHandler(c, info, resp)
	require.Nil(t, apiErr)
	require.Equal(t, 5, usage.TotalTokens)
	out := recorder.Body.String()
	assert.Contains(t, out, `"encrypted_content":"opaque-state"`)
	assert.Contains(t, out, `"encrypted_content":"opaque-delta"`)
	assert.Contains(t, out, `"codex.response.metadata":{"turn_id":"turn-1"}`)
	assert.Contains(t, out, "event: response.reasoning.encrypted_content")
	assert.Contains(t, out, "event: response.custom.delta")
	assert.Contains(t, out, "event: response.completed")
	assert.Contains(t, out, "data: [DONE]")
	assert.Equal(t, "text/event-stream", recorder.Header().Get("Content-Type"))
	assert.Equal(t, "no-cache, no-store, no-transform", recorder.Header().Get("Cache-Control"))
	assert.Equal(t, "no", recorder.Header().Get("X-Accel-Buffering"))
}

func TestOaiResponsesStreamHandlerRejectsDoneWithoutCompleted(t *testing.T) {
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	c.Set(common.RequestIdKey, "incomplete-event")
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader("data: {\"type\":\"response.output_text.delta\",\"delta\":\"partial\"}\ndata: [DONE]\n")),
	}
	info := &relaycommon.RelayInfo{
		RelayFormat: types.RelayFormatOpenAIResponses,
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "codex-mini"},
	}

	_, apiErr := OaiResponsesStreamHandler(c, info, resp)
	require.Error(t, apiErr)
	assert.Contains(t, apiErr.Error(), "response.completed")
}
