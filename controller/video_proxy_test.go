package controller

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestVideoProxyPlaybackDownload(t *testing.T) {
	media := strings.Repeat("0123456789", 1024)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "video/mp4")
		w.Header().Set("Cache-Control", "public")
		w.Header().Set("Set-Cookie", "upstream=secret")
		http.ServeContent(w, r, "video.mp4", time.Unix(100, 0), strings.NewReader(media))
	}))
	defer upstream.Close()
	for _, tc := range []struct {
		name, method, byteRange, query string
		status, length                 int
	}{
		{"play", "GET", "bytes=0-1023", "", 206, 1024},
		{"seek", "GET", "bytes=9000-", "", 206, 1240},
		{"suffix", "GET", "bytes=-10", "", 206, 10},
		{"download", "GET", "", "?download=1", 200, len(media)},
		{"head", "HEAD", "", "", 200, 0},
		{"invalid-range", "GET", "bytes=999999-", "", 416, -1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest(tc.method, "/v1/videos/task_test/content"+tc.query, nil)
			c.Params = gin.Params{{Key: "task_id", Value: "task_test"}}
			req, err := http.NewRequest(tc.method, upstream.URL, nil)
			require.NoError(t, err)
			req.Header.Set("Range", tc.byteRange)
			proxyVideoResponse(c, upstream.Client(), req)
			c.Writer.WriteHeaderNow()
			require.Equal(t, tc.status, w.Code)
			if tc.length >= 0 {
				require.Equal(t, tc.length, w.Body.Len())
			}
			if tc.status == 206 {
				require.NotEmpty(t, w.Header().Get("Content-Range"))
			}
			if tc.query != "" {
				require.Contains(t, w.Header().Get("Content-Disposition"), "attachment; filename=video-task_test.mp4")
			}
			require.Contains(t, w.Header().Get("Cache-Control"), "private")
			require.Empty(t, w.Header().Get("Set-Cookie"))
		})
	}
}

func TestVideoCacheSurvivesUpstreamRemoval(t *testing.T) {
	old := common.GetDiskCacheConfig()
	t.Cleanup(func() { common.SetDiskCacheConfig(old) })
	common.SetDiskCacheConfig(common.DiskCacheConfig{Path: t.TempDir()})
	path := videoCachePath("task_saved")
	require.NoError(t, os.MkdirAll(filepath.Dir(path), 0700))
	media := append([]byte{0, 0, 0, 32, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm'}, bytes.Repeat([]byte{0}, 1024)...)
	require.NoError(t, storeVideoCache(path, bytes.NewReader(media), int64(len(media))))
	for _, method := range []string{"GET", "HEAD"} {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(method, "/v1/videos/task_saved/content?download=1", nil)
		c.Request.Header.Set("Range", "bytes=10-19")
		c.Params = gin.Params{{Key: "task_id", Value: "task_saved"}}
		require.True(t, serveCachedVideo(c, "task_saved"))
		c.Writer.WriteHeaderNow()
		require.Equal(t, 206, w.Code)
		require.Equal(t, "video/mp4", w.Header().Get("Content-Type"))
		if method == "GET" {
			require.Equal(t, media[10:20], w.Body.Bytes())
		}
	}
}

func TestVideoCacheRejectsPartialAndEvictsOldest(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "incomplete.video")
	require.Error(t, storeVideoCache(path, strings.NewReader("short"), 100))
	_, err := os.Stat(path)
	require.True(t, os.IsNotExist(err))
	require.Error(t, storeVideoCache(path, io.LimitReader(zeroVideoReader{}, videoCacheFileLimit+1), -1))
	entries, err := os.ReadDir(dir)
	require.NoError(t, err)
	require.Empty(t, entries)
	now := time.Now()
	for i, name := range []string{"old.video", "new.video"} {
		p := filepath.Join(dir, name)
		require.NoError(t, os.WriteFile(p, []byte("12345678"), 0600))
		stamp := now.Add(time.Duration(i-2) * time.Hour)
		require.NoError(t, os.Chtimes(p, stamp, stamp))
	}
	cleanupVideoCache(dir, now, 10)
	entries, err = os.ReadDir(dir)
	require.NoError(t, err)
	require.Len(t, entries, 1)
	require.Equal(t, "new.video", entries[0].Name())
	cleanupVideoCache(dir, now.Add(8*24*time.Hour), 10)
	entries, _ = os.ReadDir(dir)
	require.Empty(t, entries)
}

type zeroVideoReader struct{}

func (zeroVideoReader) Read(p []byte) (int, error) { clear(p); return len(p), nil }
