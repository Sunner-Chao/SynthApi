package service

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/Wei-Shaw/sub2api/internal/pkg/cmccseedance"
	"github.com/Wei-Shaw/sub2api/internal/pkg/tlsfingerprint"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func cmccSeedanceTestAccount() *Account {
	return &Account{
		ID:       42,
		Platform: PlatformGrok,
		Type:     AccountTypeAPIKey,
		Credentials: map[string]any{
			"api_key":          "test-key",
			"base_url":         "https://zhenze-huhehaote.cmecloud.cn/api/v3",
			"media_api_format": CMCCSeedanceMediaAPIFormat,
			"service_version":  "2026-07",
			"model_mapping": map[string]any{
				"seedance-2.0": cmccSeedanceVirtualModel,
			},
		},
	}
}

func TestAccountIsCMCCSeedanceMediaAPI(t *testing.T) {
	account := cmccSeedanceTestAccount()
	require.True(t, account.IsCMCCSeedanceMediaAPI())
	account.Type = AccountTypeOAuth
	require.False(t, account.IsCMCCSeedanceMediaAPI())
	account.Type = AccountTypeAPIKey
	account.Credentials["media_api_format"] = "xai"
	require.False(t, account.IsCMCCSeedanceMediaAPI())
}

func TestCMCCSeedanceUsageIsClassifiedAsVideo(t *testing.T) {
	result := &OpenAIForwardResult{
		Model:         "seedance-2.0",
		BillingModel:  "seedance-2.0",
		UpstreamModel: cmccSeedanceVirtualModel,
		VideoCount:    1,
	}

	require.True(t, isGrokVideoUsageResult(result, nil))
	result.VideoCount = 0
	require.False(t, isGrokVideoUsageResult(result, nil))
}

func TestBuildCMCCSeedanceBaseURL(t *testing.T) {
	baseURL, err := buildCMCCSeedanceBaseURL(cmccSeedanceTestAccount(), &config.Config{})
	require.NoError(t, err)
	require.Equal(t, "https://zhenze-huhehaote.cmecloud.cn/api/v3", baseURL)
}

func TestPrepareCMCCSeedanceGenerationBodyConvertsMediaInputs(t *testing.T) {
	body := []byte(`{
		"model":"seedance-2.0",
		"prompt":"waves at sunset",
		"image":{"url":"https://media.example/first.png"},
		"reference_images":["https://media.example/ref.png"],
		"reference_videos":[{"video_url":{"url":"https://media.example/ref.mp4"}}],
		"reference_audios":[{"url":"https://media.example/ref.mp3"}],
		"generate_audio":true,
		"resolution":"1080p",
		"aspect_ratio":"16:9",
		"duration":8,
		"unknown_field":"discarded"
	}`)

	converted, hasVideo, err := prepareCMCCSeedanceGenerationBody(body, "endpoint-123")
	require.NoError(t, err)
	require.True(t, hasVideo)
	require.Equal(t, "endpoint-123", gjson.GetBytes(converted, "model").String())
	require.Equal(t, "waves at sunset", gjson.GetBytes(converted, "content.0.text").String())
	require.Equal(t, "first_frame", gjson.GetBytes(converted, "content.1.role").String())
	require.Equal(t, "https://media.example/first.png", gjson.GetBytes(converted, "content.1.image_url.url").String())
	require.Equal(t, "reference_image", gjson.GetBytes(converted, "content.2.role").String())
	require.Equal(t, "video_url", gjson.GetBytes(converted, "content.3.type").String())
	require.Equal(t, "reference_video", gjson.GetBytes(converted, "content.3.role").String())
	require.Equal(t, "audio_url", gjson.GetBytes(converted, "content.4.type").String())
	require.Equal(t, "true", gjson.GetBytes(converted, "generate_audio").Raw)
	require.Equal(t, "1080p", gjson.GetBytes(converted, "resolution").String())
	require.Equal(t, "16:9", gjson.GetBytes(converted, "ratio").String())
	require.Equal(t, int64(8), gjson.GetBytes(converted, "duration").Int())
	require.False(t, gjson.GetBytes(converted, "unknown_field").Exists())
}

func TestPrepareCMCCSeedanceGenerationBodyPreservesNativeContent(t *testing.T) {
	body := []byte(`{
		"model":"doubao-seedance-2.0",
		"content":[
			{"type":"text","text":"native prompt"},
			{"type":"video_url","video_url":{"url":"https://media.example/video.mp4"},"role":"reference_video"}
		],
		"prompt":"must not be duplicated"
	}`)

	converted, hasVideo, err := prepareCMCCSeedanceGenerationBody(body, "endpoint-native")
	require.NoError(t, err)
	require.True(t, hasVideo)
	require.Len(t, gjson.GetBytes(converted, "content").Array(), 2)
	require.Equal(t, "native prompt", gjson.GetBytes(converted, "content.0.text").String())
	parsed := ParseGrokMediaRequest("application/json", body)
	require.Equal(t, "must not be duplicated\nnative prompt", parsed.Prompt)
}

func TestNormalizeCMCCSeedanceResponses(t *testing.T) {
	createBody, err := normalizeCMCCSeedanceCreateResponse([]byte(`{"id":"task-1"}`))
	require.NoError(t, err)
	require.Equal(t, "task-1", gjson.GetBytes(createBody, "id").String())
	require.Equal(t, "task-1", gjson.GetBytes(createBody, "request_id").String())

	statusBody, err := normalizeCMCCSeedanceStatusResponse([]byte(`{
		"id":"task-1",
		"status":"succeeded",
		"content":{"video_url":"https://storage.example/signed.mp4","last_frame_url":"https://storage.example/last.png"},
		"duration":8,
		"resolution":"1080p",
		"usage":{"completion_tokens":120,"total_tokens":120}
	}`), "task-1", "/v1/videos/task-1/content")
	require.NoError(t, err)
	require.Equal(t, "task-1", gjson.GetBytes(statusBody, "request_id").String())
	require.Equal(t, "done", gjson.GetBytes(statusBody, "status").String())
	require.Equal(t, "succeeded", gjson.GetBytes(statusBody, "seedance_status").String())
	require.Equal(t, "/v1/videos/task-1/content", gjson.GetBytes(statusBody, "video.url").String())
	require.Equal(t, "/v1/videos/task-1/content", gjson.GetBytes(statusBody, "content.video_url").String())
	require.Equal(t, "https://storage.example/last.png", gjson.GetBytes(statusBody, "content.last_frame_url").String())
	require.Equal(t, int64(120), gjson.GetBytes(statusBody, "usage.total_tokens").Int())
}

func TestResolveCMCCSeedanceModelUsesMappingEndpointAndCachesResult(t *testing.T) {
	account := cmccSeedanceTestAccount()
	state := &cmccSeedanceAccountState{channel: &cmccseedance.Channel{}, modelMappings: make(map[string]string)}
	service := &OpenAIGatewayService{}
	calls := 0
	do := func(req *http.Request) (*http.Response, error) {
		calls++
		require.Equal(t, "https://zhenze-huhehaote.cmecloud.cn/api/v3/mapping/query", req.URL.String())
		require.Equal(t, "Bearer test-key", req.Header.Get("Authorization"))
		require.Equal(t, "2026-07", req.Header.Get("service-version"))
		requestBody, err := io.ReadAll(req.Body)
		require.NoError(t, err)
		require.JSONEq(t, `{"model":"doubao-seedance-2.0"}`, string(requestBody))
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(`{"endpoint":"ep-seedance-2"}`)),
		}, nil
	}

	for range 2 {
		resolved := service.resolveCMCCSeedanceModel(
			context.Background(), account, state,
			"https://zhenze-huhehaote.cmecloud.cn/api/v3", "test-key",
			"seedance-2.0", do,
		)
		require.Equal(t, "ep-seedance-2", resolved)
	}
	require.Equal(t, 1, calls)
}

func TestCMCCSeedanceVideoContentURLValidation(t *testing.T) {
	url, err := cmccSeedanceVideoContentURL([]byte(`{"content":{"video_url":"https://storage.example/video.mp4?signature=abc"}}`))
	require.NoError(t, err)
	require.Equal(t, "https://storage.example/video.mp4?signature=abc", url)

	_, err = cmccSeedanceVideoContentURL([]byte(`{"content":{"video_url":"http://127.0.0.1/private"}}`))
	require.ErrorContains(t, err, "unsafe video URL")
}

type cmccSeedanceForwardingUpstream struct {
	mu       sync.Mutex
	requests []*http.Request
}

func cmccSeedanceTestContext(method, target string) (*gin.Context, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(method, target, nil)
	return c, recorder
}

func (u *cmccSeedanceForwardingUpstream) Do(req *http.Request, _ string, _ int64, _ int) (*http.Response, error) {
	u.mu.Lock()
	u.requests = append(u.requests, req.Clone(req.Context()))
	u.mu.Unlock()
	return http.DefaultClient.Do(req)
}

func (u *cmccSeedanceForwardingUpstream) DoWithTLS(
	req *http.Request,
	proxyURL string,
	accountID int64,
	accountConcurrency int,
	_ *tlsfingerprint.Profile,
) (*http.Response, error) {
	return u.Do(req, proxyURL, accountID, accountConcurrency)
}

func TestForwardCMCCSeedanceMediaCreateAndStatus(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	publicDER, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	require.NoError(t, err)
	publicPEM := string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: publicDER}))

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v3/mapping/query":
			_, _ = w.Write([]byte(`{"endpoint":"endpoint-seedance-2"}`))
		case "/v1/security/token":
			_, _ = w.Write([]byte(`{"Result":{"node":{"key_info":{"pub_key_info":`))
			encodedPEM, marshalErr := json.Marshal(publicPEM)
			require.NoError(t, marshalErr)
			_, _ = w.Write(encodedPEM)
			_, _ = w.Write([]byte(`}}}}`))
		case "/api/v3/contents/generations/tasks":
			require.Equal(t, http.MethodPost, r.Method)
			require.Equal(t, "true", r.Header.Get("Input-Has-Video"))
			require.Equal(t, "true", r.Header.Get("X-AICC-Encryption-Enable"))
			encryptedBody, readErr := io.ReadAll(r.Body)
			require.NoError(t, readErr)
			require.NotContains(t, string(encryptedBody), "waves")
			_, _ = w.Write([]byte(`{"id":"task-1"}`))
		case "/api/v3/contents/generations/tasks/task-1":
			require.Equal(t, http.MethodGet, r.Method)
			require.Equal(t, "true", r.Header.Get("X-AICC-Encryption-Enable"))
			_, _ = w.Write([]byte(`{
				"id":"task-1",
				"status":"succeeded",
				"content":{"video_url":"https://storage.example/task-1.mp4"},
				"duration":8,
				"resolution":"1080p"
			}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	account := cmccSeedanceTestAccount()
	account.Credentials["base_url"] = server.URL + "/api/v3"
	upstream := &cmccSeedanceForwardingUpstream{}
	svc := &OpenAIGatewayService{
		cfg: &config.Config{Security: config.SecurityConfig{
			URLAllowlist: config.URLAllowlistConfig{AllowInsecureHTTP: true},
		}},
		httpUpstream: upstream,
	}
	createContext, createRecorder := cmccSeedanceTestContext(http.MethodPost, "/v1/videos/generations")
	createBody := []byte(`{
		"model":"seedance-2.0",
		"prompt":"waves",
		"reference_videos":["https://media.example/reference.mp4"],
		"duration":8,
		"resolution":"1080p"
	}`)
	createResult, err := svc.ForwardGrokMedia(
		context.Background(), createContext, account,
		GrokMediaEndpointVideosGenerations, "", createBody, "application/json",
	)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, createRecorder.Code)
	require.Equal(t, "task-1", gjson.Get(createRecorder.Body.String(), "request_id").String())
	require.Equal(t, "task-1", createResult.ResponseID)
	require.Equal(t, "endpoint-seedance-2", createResult.UpstreamModel)
	require.Equal(t, 8, createResult.VideoDurationSeconds)
	require.Equal(t, "1080p", createResult.VideoResolution)

	statusContext, statusRecorder := cmccSeedanceTestContext(http.MethodGet, "/v1/videos/task-1")
	statusResult, err := svc.ForwardGrokMedia(
		context.Background(), statusContext, account,
		GrokMediaEndpointVideoStatus, "task-1", nil, "",
	)
	require.NoError(t, err)
	require.NotNil(t, statusResult)
	require.Equal(t, "done", gjson.Get(statusRecorder.Body.String(), "status").String())
	require.Equal(t, "/v1/videos/task-1/content", gjson.Get(statusRecorder.Body.String(), "video.url").String())

	upstream.mu.Lock()
	defer upstream.mu.Unlock()
	paths := make([]string, 0, len(upstream.requests))
	for _, request := range upstream.requests {
		paths = append(paths, request.URL.Path)
	}
	require.Equal(t, []string{
		"/api/v3/mapping/query",
		"/v1/security/token",
		"/api/v3/contents/generations/tasks",
		"/api/v3/contents/generations/tasks/task-1",
	}, paths)
}

var _ HTTPUpstream = (*cmccSeedanceForwardingUpstream)(nil)
