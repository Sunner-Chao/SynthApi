package controller

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/setting/console_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestCompactAnnouncementImagesExternalizesDataURL(t *testing.T) {
	payload := []byte("announcement-image")
	dataURL := "data:image/png;base64," + base64.StdEncoding.EncodeToString(payload)
	compacted := compactAnnouncementImages([]map[string]interface{}{{
		"id":       42,
		"content":  "hello",
		"imageUrl": dataURL,
	}})

	require.Len(t, compacted, 1)
	hash := fmt.Sprintf("%x", sha256.Sum256(payload))
	require.Equal(t, announcementImageEndpoint+hash, compacted[0]["imageUrl"])
}

func TestGetAnnouncementImageServesAndValidatesETag(t *testing.T) {
	payload := []byte("announcement-image")
	dataURL := "data:image/png;base64," + base64.StdEncoding.EncodeToString(payload)
	hash := fmt.Sprintf("%x", sha256.Sum256(payload))
	setting := console_setting.GetConsoleSetting()
	original := setting.Announcements
	setting.Announcements = fmt.Sprintf(`[{"content":"hello","publishDate":"2026-08-07T00:00:00Z","imageUrl":%q}]`, dataURL)
	t.Cleanup(func() { setting.Announcements = original })

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Params = gin.Params{{Key: "hash", Value: hash}}
	GetAnnouncementImage(ctx)
	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, "image/png", recorder.Header().Get("Content-Type"))
	require.Equal(t, payload, recorder.Body.Bytes())
	require.Equal(t, `"`+hash+`"`, recorder.Header().Get("ETag"))
	require.Contains(t, recorder.Header().Get("Cache-Control"), "immutable")

	recorder = httptest.NewRecorder()
	ctx, _ = gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, announcementImageEndpoint+hash, nil)
	ctx.Request.Header.Set("If-None-Match", `"`+hash+`"`)
	ctx.Params = gin.Params{{Key: "hash", Value: hash}}
	GetAnnouncementImage(ctx)
	require.Equal(t, http.StatusNotModified, recorder.Code)
	require.Empty(t, recorder.Body.Bytes())
}

func TestGetAnnouncementImageReturns404ForUnknownHash(t *testing.T) {
	original := console_setting.GetConsoleSetting().Announcements
	console_setting.GetConsoleSetting().Announcements = "[]"
	t.Cleanup(func() { console_setting.GetConsoleSetting().Announcements = original })

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Params = gin.Params{{Key: "hash", Value: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}
	GetAnnouncementImage(ctx)
	require.Equal(t, http.StatusNotFound, recorder.Code)
}
