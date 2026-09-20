/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
package controller

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/gin-gonic/gin"
)

const imageHistoryRetention = 7 * 24 * time.Hour

var imageHistoryCleanupOnce sync.Once

func ImageProxy(c *gin.Context) {
	startImageHistoryCleanup()

	taskID := strings.TrimSpace(c.Param("task_id"))
	if taskID == "" {
		imageProxyError(c, http.StatusBadRequest, "task_id is required")
		return
	}

	task, exists, err := model.GetByTaskId(c.GetInt("id"), taskID)
	if err != nil {
		logger.LogError(c, fmt.Sprintf("failed to query image task %s: %s", taskID, err.Error()))
		imageProxyError(c, http.StatusInternalServerError, "failed to query image task")
		return
	}
	if !exists || task == nil {
		imageProxyError(c, http.StatusNotFound, "task not found")
		return
	}
	if task.Status != model.TaskStatusSuccess {
		imageProxyError(c, http.StatusBadRequest,
			fmt.Sprintf("task is not completed yet, current status: %s", task.Status))
		return
	}
	if serveCachedImage(c, taskID) {
		return
	}

	if dataURL := extractImageDataURL(task); dataURL != "" {
		if err := writeImageDataURL(c, dataURL, taskID); err != nil {
			logger.LogError(c, fmt.Sprintf("failed to decode image task %s: %s", taskID, err.Error()))
			imageProxyError(c, http.StatusBadGateway, "failed to decode image content")
		}
		return
	}

	imageURL := strings.TrimSpace(task.GetResultURL())
	if imageURL == "" || isLocalImageProxyURL(imageURL, taskID) {
		imageProxyError(c, http.StatusBadGateway, "image URL is unavailable")
		return
	}

	fetchSetting := system_setting.GetFetchSetting()
	if err := common.ValidateURLWithFetchSetting(
		imageURL,
		fetchSetting.EnableSSRFProtection,
		fetchSetting.AllowPrivateIp,
		fetchSetting.DomainFilterMode,
		fetchSetting.IpFilterMode,
		fetchSetting.DomainList,
		fetchSetting.IpList,
		fetchSetting.AllowedPorts,
		fetchSetting.ApplyIPFilterForDomain,
	); err != nil {
		logger.LogError(c, fmt.Sprintf("image URL blocked for task %s: %v", taskID, err))
		imageProxyError(c, http.StatusForbidden, fmt.Sprintf("request blocked: %v", err))
		return
	}

	channel, err := model.CacheGetChannel(task.ChannelId)
	if err != nil {
		logger.LogError(c, fmt.Sprintf("failed to get channel for image task %s: %s", taskID, err.Error()))
		imageProxyError(c, http.StatusInternalServerError, "failed to retrieve channel information")
		return
	}

	client, err := service.GetHttpClientWithProxy(channel.GetSetting().Proxy)
	if err != nil {
		imageProxyError(c, http.StatusInternalServerError, "failed to create proxy client")
		return
	}

	ctx, cancel := contextWithImageTimeout(c)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, imageURL, nil)
	if err != nil {
		imageProxyError(c, http.StatusInternalServerError, "failed to create proxy request")
		return
	}
	if channel.Type == constant.ChannelTypeOpenAI || channel.Type == constant.ChannelTypeAzure {
		req.Header.Set("Authorization", "Bearer "+channel.Key)
	}

	resp, err := client.Do(req)
	if err != nil {
		logger.LogError(c, fmt.Sprintf("failed to fetch image task %s: %s", taskID, err.Error()))
		imageProxyError(c, http.StatusBadGateway, "failed to fetch image content")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		imageProxyError(c, http.StatusBadGateway, fmt.Sprintf("upstream service returned status %d", resp.StatusCode))
		return
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "image/png"
	}
	c.Header("Content-Type", contentType)
	c.Header("Cache-Control", "private, max-age=86400")
	if c.Query("download") == "1" {
		c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="image-%s.png"`, taskID))
	} else {
		c.Header("Content-Disposition", "inline")
	}
	cacheFile, cachePath := createImageCacheFile(taskID)
	if cacheFile == nil {
		_, _ = io.Copy(c.Writer, resp.Body)
		return
	}
	cacheWriter := &imageCacheWriter{file: cacheFile, remaining: 64 << 20}
	_, copyErr := io.Copy(c.Writer, io.TeeReader(resp.Body, cacheWriter))
	closeErr := cacheFile.Close()
	if copyErr != nil || closeErr != nil || cacheWriter.overflow {
		_ = os.Remove(cacheFile.Name())
		return
	}
	if err := os.Rename(cacheFile.Name(), cachePath); err != nil {
		_ = os.Remove(cacheFile.Name())
	}
}

type imageCacheWriter struct {
	file      *os.File
	remaining int64
	overflow  bool
}

func (w *imageCacheWriter) Write(data []byte) (int, error) {
	if w.overflow || w.file == nil {
		return len(data), nil
	}
	writeData := data
	if int64(len(writeData)) > w.remaining {
		writeData = writeData[:w.remaining]
		w.overflow = true
	}
	if len(writeData) > 0 {
		if _, err := w.file.Write(writeData); err != nil {
			w.overflow = true
			w.file = nil
			return len(data), nil
		}
		w.remaining -= int64(len(writeData))
	}
	return len(data), nil
}

func imageHistoryDir() string {
	// Keep generated images outside the generic request-body cache. When the
	// administrator has configured a disk-cache path, reuse that persistent
	// volume; otherwise resolve relative to the service working directory
	// instead of the operating system temporary directory.
	basePath := strings.TrimSpace(common.GetDiskCachePath())
	if basePath == "" {
		basePath = filepath.Join("data", "cache")
	}
	return filepath.Join(basePath, "synthapi-image-history")
}

func imageCachePath(taskID string) string {
	hash := sha256.Sum256([]byte(taskID))
	return filepath.Join(imageHistoryDir(), fmt.Sprintf("%x.img", hash[:]))
}

func legacyImageCachePath(taskID string) string {
	hash := sha256.Sum256([]byte(taskID))
	return filepath.Join(common.GetDiskCacheDir(), "images", fmt.Sprintf("%x.img", hash[:]))
}

func createImageCacheFile(taskID string) (*os.File, string) {
	cachePath := imageCachePath(taskID)
	if err := os.MkdirAll(filepath.Dir(cachePath), 0755); err != nil {
		return nil, ""
	}
	file, err := os.CreateTemp(filepath.Dir(cachePath), ".image-*.tmp")
	if err != nil {
		return nil, ""
	}
	return file, cachePath
}

func startImageHistoryCleanup() {
	imageHistoryCleanupOnce.Do(func() {
		cleanupImageHistory()
		go func() {
			ticker := time.NewTicker(6 * time.Hour)
			defer ticker.Stop()
			for range ticker.C {
				cleanupImageHistory()
			}
		}()
	})
}

func cleanupImageHistory() {
	dir := imageHistoryDir()
	entries, err := os.ReadDir(dir)
	if err != nil {
		if !os.IsNotExist(err) {
			logger.LogWarn(nil, fmt.Sprintf("failed to scan image history directory: %s", err))
		}
		return
	}

	cutoff := time.Now().Add(-imageHistoryRetention)
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".img") {
			continue
		}
		info, err := entry.Info()
		if err != nil || info.ModTime().After(cutoff) {
			continue
		}
		if err := os.Remove(filepath.Join(dir, entry.Name())); err != nil {
			logger.LogWarn(nil, fmt.Sprintf("failed to remove expired image history %s: %s", entry.Name(), err))
		}
	}
}

func serveCachedImage(c *gin.Context, taskID string) bool {
	cachePath := imageCachePath(taskID)
	file, err := os.Open(cachePath)
	if err != nil {
		// Keep older deployments readable. Their image cache was already on the
		// configured disk volume, but used the generic cache/images directory.
		cachePath = legacyImageCachePath(taskID)
		file, err = os.Open(cachePath)
		if err != nil {
			return false
		}
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || info.Size() <= 0 {
		return false
	}
	header := make([]byte, 512)
	n, _ := file.Read(header)
	_, _ = file.Seek(0, io.SeekStart)
	contentType := http.DetectContentType(header[:n])
	if !strings.HasPrefix(contentType, "image/") {
		return false
	}
	c.Header("Content-Type", contentType)
	c.Header("Content-Length", fmt.Sprintf("%d", info.Size()))
	c.Header("Cache-Control", "private, max-age=604800")
	if c.Query("download") == "1" {
		c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="image-%s"`, taskID))
	} else {
		c.Header("Content-Disposition", "inline")
	}
	_, _ = io.Copy(c.Writer, file)
	return true
}

func contextWithImageTimeout(c *gin.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(c.Request.Context(), 60*time.Second)
}

func imageProxyError(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{
		"error": gin.H{
			"message": message,
			"type":    "image_proxy_error",
		},
	})
}

func writeImageDataURL(c *gin.Context, dataURL string, taskID string) error {
	parts := strings.SplitN(dataURL, ",", 2)
	if len(parts) != 2 || !strings.HasPrefix(parts[0], "data:") || !strings.Contains(parts[0], ";base64") {
		return fmt.Errorf("unsupported image data URL")
	}

	contentType := strings.TrimPrefix(parts[0], "data:")
	contentType = strings.TrimSuffix(contentType, ";base64")
	if contentType == "" {
		contentType = "image/png"
	}
	payload, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		payload, err = base64.RawStdEncoding.DecodeString(parts[1])
		if err != nil {
			return err
		}
	}

	c.Header("Content-Type", contentType)
	c.Header("Cache-Control", "private, max-age=86400")
	if c.Query("download") == "1" {
		c.Header("Content-Disposition", `attachment; filename="generated-image.png"`)
	} else {
		c.Header("Content-Disposition", "inline")
	}
	c.Header("Content-Length", fmt.Sprintf("%d", len(payload)))
	persistImageHistory(payload, taskID)
	_, err = c.Writer.Write(payload)
	return err
}

func persistImageHistory(payload []byte, taskID string) {
	if taskID == "" || len(payload) == 0 || len(payload) > 64<<20 {
		return
	}
	cacheFile, cachePath := createImageCacheFile(taskID)
	if cacheFile == nil {
		return
	}
	if _, err := cacheFile.Write(payload); err != nil {
		_ = cacheFile.Close()
		_ = os.Remove(cacheFile.Name())
		return
	}
	if err := cacheFile.Close(); err != nil {
		_ = os.Remove(cacheFile.Name())
		return
	}
	if err := os.Rename(cacheFile.Name(), cachePath); err != nil {
		_ = os.Remove(cacheFile.Name())
	}
}

func extractImageDataURL(task *model.Task) string {
	if task == nil {
		return ""
	}
	if strings.HasPrefix(strings.TrimSpace(task.GetResultURL()), "data:image/") {
		return strings.TrimSpace(task.GetResultURL())
	}

	var payload map[string]any
	if err := common.Unmarshal(task.Data, &payload); err != nil {
		return ""
	}
	if b64 := findImageBase64(payload); b64 != "" {
		return "data:image/png;base64," + b64
	}
	return ""
}

func findImageBase64(value any) string {
	switch typed := value.(type) {
	case map[string]any:
		for _, key := range []string{"b64_json", "base64"} {
			if result, ok := typed[key].(string); ok && strings.TrimSpace(result) != "" {
				return strings.TrimSpace(result)
			}
		}
		for _, child := range typed {
			if result := findImageBase64(child); result != "" {
				return result
			}
		}
	case []any:
		for _, child := range typed {
			if result := findImageBase64(child); result != "" {
				return result
			}
		}
	}
	return ""
}

func isLocalImageProxyURL(imageURL, taskID string) bool {
	parsed, err := url.Parse(imageURL)
	if err != nil {
		return false
	}
	return strings.HasSuffix(parsed.Path, "/v1/images/generations/"+taskID+"/content")
}
