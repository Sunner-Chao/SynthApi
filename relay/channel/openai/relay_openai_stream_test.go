package openai

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

type firstChunkSignalWriter struct {
	*httptest.ResponseRecorder
	signal chan<- bool
	once   sync.Once
}

func (w *firstChunkSignalWriter) Write(data []byte) (int, error) {
	n, err := w.ResponseRecorder.Write(data)
	if strings.Contains(string(data), "FIRST") {
		w.once.Do(func() { w.signal <- true })
	}
	return n, err
}

func TestOaiStreamHandlerForwardsFirstOpenAIChunkImmediately(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldStreamingTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldStreamingTimeout })
	firstChunkForwarded := make(chan bool, 1)
	ctx, _ := gin.CreateTestContext(&firstChunkSignalWriter{ResponseRecorder: httptest.NewRecorder(), signal: firstChunkForwarded})
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)

	info := &relaycommon.RelayInfo{
		RelayFormat:        types.RelayFormatOpenAI,
		RelayMode:          relayconstant.RelayModeChatCompletions,
		OriginModelName:    "gpt-4o-mini",
		ShouldIncludeUsage: true,
		ChannelMeta:        &relaycommon.ChannelMeta{UpstreamModelName: "gpt-4o-mini"},
	}
	reader, writer := io.Pipe()
	response := &http.Response{Body: reader}
	done := make(chan struct{})
	go func() {
		defer close(done)
		_, _ = OaiStreamHandler(ctx, info, response)
	}()

	firstChunk := "data: {\"choices\":[{\"delta\":{\"content\":\"FIRST\"}}]}\n\n"
	if _, err := io.WriteString(writer, firstChunk); err != nil {
		t.Fatal(err)
	}

	firstChunkArrived := false
	select {
	case firstChunkArrived = <-firstChunkForwarded:
	case <-time.After(2 * time.Second):
	}

	_, _ = io.WriteString(writer, "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":1,\"total_tokens\":11}}\n\n")
	_, _ = io.WriteString(writer, "data: [DONE]\n\n")
	_ = writer.Close()

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("stream handler did not finish")
	}
	if !firstChunkArrived {
		t.Fatal("first content chunk was not forwarded before another upstream chunk arrived")
	}
}
