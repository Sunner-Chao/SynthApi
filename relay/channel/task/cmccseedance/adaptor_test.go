package cmccseedance

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/pem"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestTaskAdaptorSendsVideoAndHeaderOverridesThroughSecureChannel(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	publicDER, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	require.NoError(t, err)
	publicPEM := string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: publicDER}))

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v3/mapping/query":
			require.Equal(t, "2026-08", r.Header.Get("service-version"))
			var request map[string]string
			require.NoError(t, common.DecodeJson(r.Body, &request))
			require.Equal(t, VirtualModel, request["model"])
			writeJSON(t, w, map[string]any{"data": map[string]any{"endpoint": "endpoint-1"}})
		case "/v1/security/token":
			require.Empty(t, r.Header.Get("service-version"))
			writeJSON(t, w, map[string]any{"pub_key_info": publicPEM})
		case "/api/v3/contents/generations/tasks":
			require.Equal(t, "2026-08", r.Header.Get("service-version"))
			require.Equal(t, "true", r.Header.Get("Input-Has-Video"))
			var envelope encryptedMessage
			require.NoError(t, common.DecodeJson(r.Body, &envelope))
			key, decryptErr := rsa.DecryptOAEP(sha256.New(), rand.Reader, privateKey, envelope.Key, nil)
			require.NoError(t, decryptErr)
			plaintext, decryptErr := open(key, envelope.Nonce, envelope.Ciphertext, envelope.MAC)
			require.NoError(t, decryptErr)
			var payload map[string]any
			require.NoError(t, common.Unmarshal(plaintext, &payload))
			require.Equal(t, "endpoint-1", payload["model"])
			require.Equal(t, "16:9", payload["ratio"])
			require.Equal(t, false, payload["return_last_frame"])
			require.EqualValues(t, 0, payload["execution_expires_after"])
			require.Equal(t, "https://example.com/callback", payload["callback_url"])
			require.Equal(t, "tenant-1", payload["safety_identifier"])
			require.Equal(t, "default", payload["service_tier"])
			content, ok := payload["content"].([]any)
			require.True(t, ok)
			require.Len(t, content, 6)

			nonce, ciphertext, mac, encryptErr := seal(key, []byte(`{"id":"task-1"}`))
			require.NoError(t, encryptErr)
			writeJSON(t, w, encryptedMessage{Nonce: nonce, MAC: mac, Ciphertext: ciphertext})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	gin.SetMode(gin.TestMode)
	request := httptest.NewRequest(http.MethodPost, "/v1/videos/generations", strings.NewReader(`{
		"model":"seedance-2.0",
		"prompt":"waves",
		"image":{"url":"https://example.com/first.png"},
		"last_frame":{"image_url":{"url":"https://example.com/last.png"}},
		"reference_images":[
			{"url":"https://example.com/reference.png"},
			"https://example.com/reference-2.png"
		],
		"video":{"url":"https://example.com/reference.mp4"},
		"aspect_ratio":"16:9",
		"return_last_frame":false,
		"execution_expires_after":0,
		"callback_url":"https://example.com/callback",
		"safety_identifier":"tenant-1",
		"tools":[],
		"service_tier":"default"
	}`))
	request.Header.Set("Content-Type", "application/json")
	request = request.WithContext(context.Background())
	contextRecorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(contextRecorder)
	c.Request = request
	info := &relaycommon.RelayInfo{
		TaskRelayInfo: &relaycommon.TaskRelayInfo{},
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType:    constant.ChannelTypeCMCCSeedance,
			ChannelBaseUrl: server.URL + "/api/v3",
			ApiKey:         "test-key",
			HeadersOverride: map[string]any{
				"service-version": "2026-08",
			},
		},
	}
	adaptor := &TaskAdaptor{}
	adaptor.Init(info)
	require.Nil(t, adaptor.ValidateRequestAndSetAction(c, info))
	body, err := adaptor.BuildRequestBody(c, info)
	require.NoError(t, err)
	resp, err := adaptor.DoRequest(c, info, body)
	require.NoError(t, err)
	defer resp.Body.Close()
	responseBody, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.JSONEq(t, `{"id":"task-1"}`, string(responseBody))
}
