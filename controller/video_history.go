package controller

import (
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

const videoCacheFileLimit int64 = 64 << 20
const videoCacheTotalLimit int64 = 128 << 20
const videoCacheRetention = 7 * 24 * time.Hour

// One bounded streaming download at a time; never buffer a video in RAM.
var videoArchiveSlot = make(chan struct{}, 1)

func videoHistoryDir() string {
	base := strings.TrimSpace(common.GetDiskCachePath())
	if base == "" {
		base = filepath.Join("data", "cache")
	}
	return filepath.Join(base, "synthapi-video-history")
}

func videoCachePath(taskID string) string {
	hash := sha256.Sum256([]byte(taskID))
	return filepath.Join(videoHistoryDir(), fmt.Sprintf("%x.video", hash[:]))
}

// Must only be called after the task ownership and success checks.
func serveCachedVideo(c *gin.Context, taskID string) bool {
	file, err := os.Open(videoCachePath(taskID))
	if err != nil {
		return false
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || info.Size() == 0 || time.Since(info.ModTime()) > videoCacheRetention {
		return false
	}
	var header [512]byte
	n, _ := file.Read(header[:])
	_, _ = file.Seek(0, io.SeekStart)
	videoResponseHeaders(c, http.DetectContentType(header[:n]))
	http.ServeContent(c.Writer, c.Request, "video", info.ModTime(), file)
	return true
}

// Cache videos on first playback/download so a completed task remains playable
// when its upstream URL expires. This is a capacity-limited cache, not permanent
// object storage. It survives service restarts and never stores partial files.
func archiveVideo(taskID string, client *http.Client, request *http.Request) {
	select {
	case videoArchiveSlot <- struct{}{}:
	default:
		return
	}
	go func() {
		defer func() { <-videoArchiveSlot }()
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
		defer cancel()
		req := request.Clone(ctx)
		for _, header := range []string{"Range", "If-Range", "If-None-Match", "If-Modified-Since"} {
			req.Header.Del(header)
		}
		path := videoCachePath(taskID)
		if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
			return
		}
		cleanupVideoCache(filepath.Dir(path), time.Now(), videoCacheTotalLimit)
		resp, err := client.Do(req)
		if err != nil {
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK || resp.ContentLength > videoCacheFileLimit {
			return
		}
		if err := storeVideoCache(path, resp.Body, resp.ContentLength); err != nil {
			return
		}
		cleanupVideoCache(filepath.Dir(path), time.Now(), videoCacheTotalLimit)
	}()
}

func storeVideoCache(path string, body io.Reader, expected int64) error {
	file, err := os.CreateTemp(filepath.Dir(path), ".video-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	n, copyErr := io.Copy(file, io.LimitReader(body, videoCacheFileLimit+1))
	closeErr := file.Close()
	if copyErr != nil || closeErr != nil || n == 0 || n > videoCacheFileLimit || (expected >= 0 && n != expected) {
		return fmt.Errorf("incomplete or oversized video cache")
	}
	return os.Rename(file.Name(), path)
}

func cleanupVideoCache(dir string, now time.Time, maxBytes int64) {
	entries, _ := os.ReadDir(dir)
	var files []os.FileInfo
	var total int64
	for _, entry := range entries {
		if entry.IsDir() || (!strings.HasSuffix(entry.Name(), ".video") && !strings.HasPrefix(entry.Name(), ".video-")) {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if now.Sub(info.ModTime()) > videoCacheRetention || strings.HasSuffix(info.Name(), ".tmp") {
			_ = os.Remove(filepath.Join(dir, info.Name()))
			continue
		}
		total += info.Size()
		files = append(files, info)
	}
	sort.Slice(files, func(i, j int) bool { return files[i].ModTime().Before(files[j].ModTime()) })
	for _, file := range files {
		if total <= maxBytes {
			break
		}
		if os.Remove(filepath.Join(dir, file.Name())) == nil {
			total -= file.Size()
		}
	}
}
