package channel_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relay/channel"
	openaiadapter "github.com/QuantumNous/new-api/relay/channel/openai"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestDoApiRequestCancelsUpstreamWhenClientDisconnects(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service.InitHttpClient()

	upstreamStarted := make(chan struct{})
	releaseUpstream := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(upstreamStarted)
		select {
		case <-r.Context().Done():
		case <-releaseUpstream:
		}
	}))
	defer server.Close()
	defer close(releaseUpstream)

	requestContext, cancel := context.WithCancel(context.Background())
	recorder := httptest.NewRecorder()
	ginContext, _ := gin.CreateTestContext(recorder)
	ginContext.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil).WithContext(requestContext)
	ginContext.Request.Header.Set("Content-Type", "application/json")

	payload := []byte(`{"model":"test","input":"hello"}`)
	info := &relaycommon.RelayInfo{
		RequestURLPath:          "/v1/responses",
		UpstreamRequestBodySize: int64(len(payload)),
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType:    constant.ChannelTypeOpenAI,
			ChannelBaseUrl: server.URL,
		},
	}
	adaptor := &openaiadapter.Adaptor{}
	adaptor.Init(info)

	requestDone := make(chan error, 1)
	go func() {
		_, err := channel.DoApiRequest(adaptor, ginContext, info, bytes.NewReader(payload))
		requestDone <- err
	}()

	select {
	case <-upstreamStarted:
	case <-time.After(2 * time.Second):
		t.Fatal("upstream request did not start")
	}
	cancel()

	select {
	case err := <-requestDone:
		require.Error(t, err)
	case <-time.After(2 * time.Second):
		t.Fatal("upstream request was not canceled")
	}
}
