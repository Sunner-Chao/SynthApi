package controller

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/setting/console_setting"
	"github.com/gin-gonic/gin"
)

const announcementImageEndpoint = "/api/status/announcement-image/"

var announcementImageHashPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

// compactAnnouncementImages keeps the public status payload small while
// preserving imageUrl as a normal browser-loadable URL for existing clients.
func compactAnnouncementImages(announcements []map[string]interface{}) []map[string]interface{} {
	if len(announcements) == 0 {
		return announcements
	}

	compacted := make([]map[string]interface{}, 0, len(announcements))
	for _, announcement := range announcements {
		item := make(map[string]interface{}, len(announcement))
		for key, value := range announcement {
			item[key] = value
		}

		imageURL, ok := item["imageUrl"].(string)
		if ok {
			if _, payload, valid := decodeAnnouncementImageDataURL(imageURL); valid {
				hash := sha256.Sum256(payload)
				item["imageUrl"] = announcementImageEndpoint + fmt.Sprintf("%x", hash)
			}
		}
		compacted = append(compacted, item)
	}
	return compacted
}

// GetAnnouncementImage serves an announcement's embedded image on demand.
// The hash is content-addressed so the response can be cached indefinitely.
func GetAnnouncementImage(c *gin.Context) {
	hash := strings.ToLower(strings.TrimSpace(c.Param("hash")))
	if !announcementImageHashPattern.MatchString(hash) {
		c.Status(http.StatusNotFound)
		return
	}

	for _, announcement := range console_setting.GetAnnouncements() {
		imageURL, ok := announcement["imageUrl"].(string)
		if !ok {
			continue
		}
		contentType, payload, valid := decodeAnnouncementImageDataURL(imageURL)
		if !valid {
			continue
		}
		digest := sha256.Sum256(payload)
		if fmt.Sprintf("%x", digest) != hash {
			continue
		}

		etag := `"` + hash + `"`
		c.Header("ETag", etag)
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
		c.Header("Content-Disposition", "inline")
		c.Header("Content-Length", strconv.Itoa(len(payload)))
		if strings.TrimSpace(c.GetHeader("If-None-Match")) == etag {
			c.Status(http.StatusNotModified)
			return
		}
		c.Data(http.StatusOK, contentType, payload)
		return
	}

	c.Status(http.StatusNotFound)
}

func decodeAnnouncementImageDataURL(imageURL string) (string, []byte, bool) {
	parts := strings.SplitN(strings.TrimSpace(imageURL), ",", 2)
	if len(parts) != 2 || !strings.HasPrefix(strings.ToLower(parts[0]), "data:") ||
		!strings.Contains(strings.ToLower(parts[0]), ";base64") {
		return "", nil, false
	}

	header := strings.TrimPrefix(strings.ToLower(parts[0]), "data:")
	header = strings.TrimSuffix(header, ";base64")
	switch header {
	case "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif":
	default:
		return "", nil, false
	}

	payload, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		payload, err = base64.RawStdEncoding.DecodeString(parts[1])
		if err != nil {
			return "", nil, false
		}
	}
	if len(payload) == 0 {
		return "", nil, false
	}
	return header, payload, true
}
