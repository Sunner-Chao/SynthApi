package model

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// ClassifyMediaLog uses the endpoint first, then known generation model names.
// Vision-capable chat models are not image generation. The classification is
// stored once so audit queries never scan the large raw Other JSON column.
func ClassifyMediaLog(name, requestPath string) string {
	name = strings.ToLower(name)
	requestPath = strings.ToLower(requestPath)
	contains := func(patterns ...string) bool {
		for _, p := range patterns {
			if strings.Contains(name, p) {
				return true
			}
		}
		return false
	}
	if strings.Contains(requestPath, "/videos") || strings.Contains(requestPath, "/video/") || strings.Contains(requestPath, "/mj/submit/video") || strings.HasPrefix(name, "mj_video") {
		return "video"
	}
	if strings.Contains(requestPath, "/images/") || strings.Contains(requestPath, "/mj/submit/") {
		return "image"
	}
	if contains("gpt-image", "chatgpt-image", "dall-e", "flux", "seedream", "imagen-", "qwen-image", "z-image", "nano-banana", "nanobanana", "grok-imagine-image") || strings.HasPrefix(name, "mj_") || strings.HasPrefix(name, "midjourney") || (contains("gemini", "wan") && contains("image")) {
		return "image"
	}
	if contains("video", "sora", "veo", "kling", "vidu", "hailuo", "minimax-h3", "seedance", "skyreels", "pixverse", "happyhorse", "omni-flash", "wan2.5", "wan2.6", "wan2.7", "wan3") {
		return "video"
	}
	return "other"
}

func (log *Log) BeforeCreate(_ *gorm.DB) error {
	var other struct {
		RequestPath string `json:"request_path"`
	}
	_ = common.UnmarshalJsonStr(log.Other, &other)
	log.MediaKind = "other"
	if log.Type == LogTypeConsume || log.Type == LogTypeRefund || log.Type == LogTypeError {
		log.MediaKind = ClassifyMediaLog(log.ModelName, other.RequestPath)
	}
	return nil
}

func mediaLogCondition(kind string) string {
	switch kind {
	case "image", "video", "other":
		return "logs.media_kind = '" + kind + "'"
	default:
		return "1 = 1"
	}
}

func applyMediaLogFilter(tx *gorm.DB, kind []string) *gorm.DB {
	if len(kind) == 0 || kind[0] == "" {
		return tx
	}
	return tx.Where(mediaLogCondition(kind[0]))
}
