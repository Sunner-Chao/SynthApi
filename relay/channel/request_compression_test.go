package channel

import (
	"bytes"
	"compress/gzip"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/require"
)

func TestApplyPreparedUpstreamRequestCompression(t *testing.T) {
	t.Parallel()

	payload := bytes.Repeat([]byte("compressed"), 128)
	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	req.Header.Set("Content-Length", "999999")
	info := &relaycommon.RelayInfo{UpstreamRequestBodyCompressedSize: int64(len(payload))}

	err := applyPreparedUpstreamRequestCompression(req, info)
	require.NoError(t, err)
	require.Equal(t, "gzip", req.Header.Get("Content-Encoding"))
	require.Empty(t, req.Header.Get("Content-Length"))
	require.Equal(t, int64(len(payload)), req.ContentLength)
	require.Nil(t, req.GetBody)
}

func TestPreparedUpstreamGzipUsesExactWireLength(t *testing.T) {
	t.Parallel()

	payload := bytes.Repeat([]byte(`{"message":"large repeated context"}`), 4096)
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType: constant.ChannelTypeOpenAI,
			ChannelSetting: dto.ChannelSettings{
				UpstreamRequestGzipEnabled:  common.GetPointer(true),
				UpstreamRequestGzipMinBytes: 1,
			},
		},
	}
	body, size, closer, err := relaycommon.NewOutboundJSONBody(context.Background(), payload, info)
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, closer.Close()) })
	info.UpstreamRequestBodySize = size

	type observedRequest struct {
		contentEncoding  string
		contentLength    int64
		transferEncoding []string
		wireBytes        int
		decodedBody      []byte
		err              error
	}
	observed := make(chan observedRequest, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		wireBody, readErr := io.ReadAll(r.Body)
		result := observedRequest{
			contentEncoding:  r.Header.Get("Content-Encoding"),
			contentLength:    r.ContentLength,
			transferEncoding: append([]string(nil), r.TransferEncoding...),
			wireBytes:        len(wireBody),
			err:              readErr,
		}
		if readErr == nil {
			reader, gzipErr := gzip.NewReader(bytes.NewReader(wireBody))
			if gzipErr != nil {
				result.err = gzipErr
			} else {
				result.decodedBody, result.err = io.ReadAll(reader)
				_ = reader.Close()
			}
		}
		observed <- result
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	req, err := http.NewRequest(http.MethodPost, server.URL, body)
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.ContentLength = info.UpstreamRequestBodySize
	require.NoError(t, applyPreparedUpstreamRequestCompression(req, info))

	resp, err := server.Client().Do(req)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())
	result := <-observed
	require.NoError(t, result.err)
	require.Equal(t, "gzip", result.contentEncoding)
	require.Equal(t, size, result.contentLength)
	require.Equal(t, int(size), result.wireBytes)
	require.Empty(t, result.transferEncoding)
	require.Equal(t, payload, result.decodedBody)
}

func TestApplyPreparedUpstreamRequestCompressionNoopWithoutPreparedBody(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", bytes.NewReader([]byte(`{"message":"plain"}`)))
	req.Header.Set("Content-Type", "application/json")

	err := applyPreparedUpstreamRequestCompression(req, &relaycommon.RelayInfo{})
	require.NoError(t, err)
	require.Empty(t, req.Header.Get("Content-Encoding"))
}

func TestApplyPreparedUpstreamRequestCompressionRejectsConflicts(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		contentType string
		encoding    string
	}{
		{name: "non json", contentType: "multipart/form-data; boundary=test"},
		{name: "existing encoding", contentType: "application/json", encoding: "br"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", bytes.NewReader([]byte("compressed")))
			req.Header.Set("Content-Type", test.contentType)
			if test.encoding != "" {
				req.Header.Set("Content-Encoding", test.encoding)
			}
			info := &relaycommon.RelayInfo{UpstreamRequestBodyCompressedSize: int64(len("compressed"))}

			err := applyPreparedUpstreamRequestCompression(req, info)
			require.Error(t, err)
			require.NotEqual(t, "gzip", req.Header.Get("Content-Encoding"))
		})
	}
}
