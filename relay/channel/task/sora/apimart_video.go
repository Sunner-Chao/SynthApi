package sora

import (
	"strconv"
	"strings"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
)

type apimartVideoPriceSpec struct {
	PerSecond bool
	Base      float64
	Prices    map[string]float64
}

// Prices are APIMart's public discounted USD catalog snapshot. They are used
// only for pre-consume estimation; terminal settlement uses the task's actual
// upstream cost so resolution and model-specific options cannot drift.
var apimartVideoPriceCatalog = map[string]apimartVideoPriceSpec{
	"minimax-h3": {PerSecond: true, Base: 0.09144, Prices: map[string]float64{"default": 0.09144, "2k": 0.09144, "768p": 0.05712}},
	"minimax-h3-context-ir": {Base: 0.08, Prices: map[string]float64{"default": 0.08}},
	"minimax-h3-regeneration": {PerSecond: true, Base: 0.03432, Prices: map[string]float64{"default": 0.03432, "2k": 0.03432}},
	"minimax-hailuo-02": {PerSecond: true, Base: 0.08, Prices: map[string]float64{"1080p": 0.08, "512p": 0.0104, "768p": 0.04}},
	"minimax-hailuo-2.3": {PerSecond: true, Base: 0.0488, Prices: map[string]float64{"default": 0.0488, "1080p": 0.072}},
	"minimax-hailuo-2.3-fast": {PerSecond: true, Base: 0.0248, Prices: map[string]float64{"default": 0.0248, "1080p": 0.0424}},
	"omni-flash-ext": {Base: 0.35, Prices: map[string]float64{"default": 0.35, "720p-4s": 0.25, "720p-6s": 0.3, "720p-8s": 0.35, "720p-10s": 0.4, "1080p-4s": 0.25, "1080p-6s": 0.3, "1080p-8s": 0.35, "1080p-10s": 0.4, "4k-4s": 0.75, "4k-6s": 0.8, "4k-8s": 0.85, "4k-10s": 0.9}},
	"sora-2": {PerSecond: true, Base: 0.08, Prices: map[string]float64{"default": 0.08}},
	"veo3.1-fast": {Base: 0.14, Prices: map[string]float64{"default": 0.14, "4k": 0.64}},
	"veo3.1-quality": {Base: 1, Prices: map[string]float64{"default": 1, "4k": 1.5}},
	"flux-3-video": {PerSecond: true, Base: 0.136, Prices: map[string]float64{"default": 0.136, "draft": 0.048, "hd": 0.136, "fhd": 0.232, "v2v-draft": 0.096, "v2v-hd": 0.328, "v2v-fhd": 0.424}},
	"gemini-omni-flash-preview": {PerSecond: true, Base: 0.088, Prices: map[string]float64{"720p": 0.088}},
	"grok-imagine-1.5-video-apimart": {PerSecond: true, Base: 0.01912, Prices: map[string]float64{"480p": 0.0102, "720p": 0.01912}},
	"grok-imagine-video": {PerSecond: true, Base: 0.04, Prices: map[string]float64{"default": 0.04, "480p": 0.04, "720p": 0.056}},
	"grok-imagine-video-1.5": {PerSecond: true, Base: 0.064, Prices: map[string]float64{"default": 0.064, "480p": 0.064, "720p": 0.112, "1080p": 0.2}},
	"happyhorse-1.0": {PerSecond: true, Base: 0.23, Prices: map[string]float64{"default": 0.23, "720p": 0.13, "1080p": 0.23}},
	"happyhorse-1.1": {PerSecond: true, Base: 0.172, Prices: map[string]float64{"default": 0.172, "720p": 0.13, "1080p": 0.172}},
	"kling-3.0-turbo": {PerSecond: true, Base: 0.1144, Prices: map[string]float64{"720p": 0.1144, "1080p": 0.1432}},
	"kling-v2-6": {PerSecond: true, Base: 0.0368, Prices: map[string]float64{"default": 0.0368, "pro": 0.0625, "pro-sound": 0.125, "pro-sound-voice": 0.15}},
	"kling-v2-6-motion-control": {PerSecond: true, Base: 0.05712, Prices: map[string]float64{"default": 0.05712, "pro": 0.09144}},
	"kling-v3": {PerSecond: true, Base: 0.0672, Prices: map[string]float64{"default": 0.0672, "sound": 0.1008, "pro": 0.0896, "pro-sound": 0.1344, "4k": 0.42856, "4k-sound": 0.42856}},
	"kling-v3-motion-control": {PerSecond: true, Base: 0.10288, Prices: map[string]float64{"default": 0.10288, "pro": 0.13712}},
	"kling-v3-omni": {PerSecond: true, Base: 0.0672, Prices: map[string]float64{"default": 0.0672, "sound": 0.0896, "video": 0.1008, "pro": 0.0896, "pro-sound": 0.112, "pro-video": 0.1344, "4k": 0.42856, "4k-sound": 0.42856}},
	"kling-video-o1": {PerSecond: true, Base: 0.0672, Prices: map[string]float64{"default": 0.0672, "video": 0.1008, "pro": 0.0896, "pro-video": 0.1344}},
	"pixverse-v6": {PerSecond: true, Base: 0.024, Prices: map[string]float64{"default": 0.024, "360p": 0.016, "360p-audio": 0.024, "540p": 0.024, "540p-audio": 0.032, "720p": 0.032, "720p-audio": 0.04, "1080p": 0.064, "1080p-audio": 0.08}},
	"seedance-1-0-pro-fast": {PerSecond: true, Base: 0.02, Prices: map[string]float64{"480p": 0.0088, "720p": 0.02, "1080p": 0.0416}},
	"seedance-1-0-pro-quality": {PerSecond: true, Base: 0.044, Prices: map[string]float64{"480p": 0.0204, "720p": 0.044, "1080p": 0.104}},
	"seedance-1-5-pro": {PerSecond: true, Base: 0.044, Prices: map[string]float64{"480p": 0.0204, "720p": 0.044, "1080p": 0.108}},
	"seedance-2.0": {PerSecond: true, Base: 0.142, Prices: map[string]float64{"480p": 0.066, "720p": 0.142, "1080p": 0.3544, "4k": 0.722}},
	"seedance-2.0-face": {PerSecond: true, Base: 0.2136, Prices: map[string]float64{"480p": 0.0992, "720p": 0.2136, "1080p": 0.5}},
	"seedance-2.0-fast": {PerSecond: true, Base: 0.0856, Prices: map[string]float64{"480p": 0.03984, "720p": 0.0856}},
	"seedance-2.0-fast-face": {PerSecond: true, Base: 0.172, Prices: map[string]float64{"480p": 0.08, "720p": 0.172}},
	"seedance-2.0-mini": {PerSecond: true, Base: 0.02288, Prices: map[string]float64{"480p": 0.01056, "720p": 0.02288}},
	"seedance-2.5": {PerSecond: true, Base: 0.216, Prices: map[string]float64{"default": 0.216, "480p": 0.09608, "720p": 0.216, "1080p": 0.38488}},
	"skyreels-v4-fast": {PerSecond: true, Base: 0.088, Prices: map[string]float64{"480p": 0.064, "720p": 0.088, "1080p": 0.22}},
	"skyreels-v4-std": {PerSecond: true, Base: 0.112, Prices: map[string]float64{"480p": 0.088, "720p": 0.112, "1080p": 0.28}},
	"sora-2-preview": {PerSecond: true, Base: 0.08, Prices: map[string]float64{"default": 0.08}},
	"sora-2-pro": {PerSecond: true, Base: 0.6, Prices: map[string]float64{"default": 0.6}},
	"veo3.1-fast-official": {PerSecond: true, Base: 0.08, Prices: map[string]float64{"default": 0.08, "720p": 0.064, "720p-audio": 0.08, "1080p": 0.08, "1080p-audio": 0.096, "4k": 0.2, "4k-audio": 0.24}},
	"veo3.1-lite": {Base: 0.07, Prices: map[string]float64{"default": 0.07, "4k": 0.57}},
	"veo3.1-quality-official": {PerSecond: true, Base: 0.16, Prices: map[string]float64{"default": 0.16, "720p": 0.16, "1080p": 0.16, "4k": 0.32, "4k-audio": 0.48}},
	"viduq3": {PerSecond: true, Base: 0.08, Prices: map[string]float64{"default": 0.08, "540p": 0.04, "720p": 0.08, "1080p": 0.1}},
	"viduq3-mix": {PerSecond: true, Base: 0.1, Prices: map[string]float64{"default": 0.1, "720p": 0.1, "1080p": 0.12}},
	"viduq3-pro": {PerSecond: true, Base: 0.12, Prices: map[string]float64{"540p": 0.056, "720p": 0.12, "1080p": 0.128}},
	"viduq3-turbo": {PerSecond: true, Base: 0.048, Prices: map[string]float64{"540p": 0.032, "720p": 0.048, "1080p": 0.056}},
	"wan2.5-preview": {PerSecond: true, Base: 0.0664, Prices: map[string]float64{"480p": 0.0336, "720p": 0.0664, "1080p": 0.1096}},
	"wan2.6": {PerSecond: true, Base: 0.05, Prices: map[string]float64{"default": 0.05, "1080p": 0.084}},
	"wan2.6-i2v": {PerSecond: true, Base: 0.0664, Prices: map[string]float64{"720p": 0.0664, "1080p": 0.1096}},
	"wan2.6-i2v-flash": {PerSecond: true, Base: 0.0168, Prices: map[string]float64{"720p": 0.0168, "720p-audio": 0.0336, "1080p": 0.028, "1080p-audio": 0.0552}},
	"wan2.7": {PerSecond: true, Base: 0.0664, Prices: map[string]float64{"default": 0.0664, "1080p": 0.1096}},
	"wan2.7-r2v": {PerSecond: true, Base: 0.0664, Prices: map[string]float64{"default": 0.0664, "1080p": 0.1096}},
	"wan2.7-videoedit": {PerSecond: true, Base: 0.0664, Prices: map[string]float64{"default": 0.0664, "1080p": 0.1096}},
	"wan3.0-video": {PerSecond: true, Base: 0.137144, Prices: map[string]float64{"default": 0.137144, "480p": 0.034288, "720p": 0.068568, "1080p": 0.137144}},
}

func isAPIMartVideoModel(modelName string) bool {
	_, ok := apimartVideoPriceCatalog[strings.ToLower(strings.TrimSpace(modelName))]
	return ok
}

func apimartVideoBillingRatios(modelName string, req relaycommon.TaskSubmitReq) map[string]float64 {
	spec, ok := apimartVideoPriceCatalog[strings.ToLower(strings.TrimSpace(modelName))]
	if !ok || spec.Base <= 0 {
		return nil
	}

	duration := req.Duration
	if duration <= 0 {
		duration, _ = strconv.Atoi(req.Seconds)
	}
	if duration <= 0 {
		duration = 5
	}

	resolution := strings.ToLower(strings.TrimSpace(req.Resolution))
	if resolution == "" {
		resolution = resolutionFromVideoSize(req.Size)
	}
	if resolution == "" {
		resolution = "720p"
	}

	key := resolution
	if strings.EqualFold(modelName, "omni-flash-ext") {
		key = resolution + "-" + strconv.Itoa(duration) + "s"
	} else if strings.HasPrefix(strings.ToLower(modelName), "kling-") {
		key = klingPriceKey(resolution, req)
	} else if req.GenerateAudio != nil && *req.GenerateAudio {
		if _, exists := spec.Prices[resolution+"-audio"]; exists {
			key = resolution + "-audio"
		}
	} else if mode := strings.ToLower(strings.TrimSpace(req.Mode)); mode != "" {
		if _, exists := spec.Prices[mode]; exists {
			key = mode
		}
	}

	selected := spec.Base
	if value, exists := spec.Prices[key]; exists {
		selected = value
	} else if value, exists := spec.Prices[resolution]; exists {
		selected = value
	}

	ratios := map[string]float64{"specification": selected / spec.Base}
	if spec.PerSecond {
		ratios["duration_seconds"] = float64(duration)
	}
	return ratios
}

func resolutionFromVideoSize(size string) string {
	size = strings.ToLower(strings.TrimSpace(size))
	parts := strings.SplitN(size, "x", 2)
	if len(parts) != 2 {
		return ""
	}
	width, _ := strconv.Atoi(parts[0])
	height, _ := strconv.Atoi(parts[1])
	maxDimension := width
	if height > maxDimension {
		maxDimension = height
	}
	switch {
	case maxDimension >= 3840:
		return "4k"
	case maxDimension >= 1920:
		return "1080p"
	case maxDimension >= 1280:
		return "720p"
	default:
		return "480p"
	}
}

func klingPriceKey(resolution string, req relaycommon.TaskSubmitReq) string {
	key := "default"
	if resolution == "1080p" {
		key = "pro"
	} else if resolution == "4k" {
		key = "4k"
	}
	if req.GenerateAudio != nil && *req.GenerateAudio {
		key += "-sound"
	} else if req.VideoURL != "" || len(req.VideoURLs) > 0 {
		key += "-video"
	}
	return key
}
