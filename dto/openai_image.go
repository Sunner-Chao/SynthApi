package dto

import (
	"encoding/json"
	"math"
	"reflect"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

type ImageRequest struct {
	Model             string          `json:"model"`
	Group             string          `json:"group,omitempty"`
	Prompt            string          `json:"prompt" binding:"required"`
	N                 *uint           `json:"n,omitempty"`
	Size              string          `json:"size,omitempty"`
	Quality           string          `json:"quality,omitempty"`
	Resolution        json.RawMessage `json:"resolution,omitempty"`
	ResponseFormat    string          `json:"response_format,omitempty"`
	Style             json.RawMessage `json:"style,omitempty"`
	User              json.RawMessage `json:"user,omitempty"`
	ExtraFields       json.RawMessage `json:"extra_fields,omitempty"`
	Background        json.RawMessage `json:"background,omitempty"`
	Moderation        json.RawMessage `json:"moderation,omitempty"`
	OutputFormat      json.RawMessage `json:"output_format,omitempty"`
	OutputCompression json.RawMessage `json:"output_compression,omitempty"`
	PartialImages     json.RawMessage `json:"partial_images,omitempty"`
	// Stream            bool            `json:"stream,omitempty"`
	Images json.RawMessage `json:"images,omitempty"`
	// APIMart GPT Image 2 parameters. Keep these typed so API-key clients can
	// use the same contract as the workbench without relying on Extra.
	ImageURLs        []string        `json:"image_urls,omitempty"`
	OfficialFallback *bool           `json:"official_fallback,omitempty"`
	Mask             json.RawMessage `json:"mask,omitempty"`
	InputFidelity    json.RawMessage `json:"input_fidelity,omitempty"`
	Watermark        *bool           `json:"watermark,omitempty"`
	// zhipu 4v
	WatermarkEnabled json.RawMessage `json:"watermark_enabled,omitempty"`
	UserId           json.RawMessage `json:"user_id,omitempty"`
	Image            json.RawMessage `json:"image,omitempty"`
	// 用匿名参数接收额外参数
	Extra map[string]json.RawMessage `json:"-"`
}

const (
	apimartGPTImage2Price1K = 0.0085
	apimartGPTImage2Price2K = 0.014
	apimartGPTImage2Price4K = 0.021
)

func (i *ImageRequest) IsAPIMartGPTImage2() bool {
	modelName := strings.ToLower(strings.TrimSpace(i.Model))
	return modelName == "gpt-image-2" || modelName == "gpt-image-2-ext"
}

func (i *ImageRequest) IsAPIMartImageModel() bool {
	_, ok := apimartImageModels[strings.ToLower(strings.TrimSpace(i.Model))]
	return ok
}

var apimartImageModels = map[string]struct{}{
	"flux-2-flex":                    {},
	"flux-2-max":                     {},
	"flux-2-pro":                     {},
	"flux-kontext-max":               {},
	"flux-kontext-pro":               {},
	"gemini-2.5-flash-image-preview": {},
	"gemini-3-pro-image-preview":     {},
	"gemini-3.1-flash-image-preview": {},
	"gemini-3.1-flash-lite-image":    {},
	"gpt-image-2":                    {},
	"gpt-image-2-ext":                {},
	"gpt-image-2-official":           {},
	"grok-imagine-1.5-apimart":       {},
	"grok-imagine-2.0-ext":           {},
	"grok-imagine-image":             {},
	"grok-imagine-image-2.0":         {},
	"grok-imagine-image-quality":     {},
	"imagen-4.0-apimart":             {},
	"qwen-image-2.0":                 {},
	"qwen-image-2.0-pro":             {},
	"qwen-image-3.0":                 {},
	"qwen-image-3.0-pro":             {},
	"seedream-4.0":                   {},
	"seedream-4.5":                   {},
	"seedream-5-0-lite":              {},
	"seedream-5-0-pro":               {},
	"wan2.7-image":                   {},
	"wan2.7-image-pro":               {},
	"z-image-turbo":                  {},
}

func (i *ImageRequest) GetResolution() string {
	if len(i.Resolution) == 0 {
		return ""
	}
	var resolution string
	if err := common.Unmarshal(i.Resolution, &resolution); err != nil {
		return ""
	}
	return strings.ToLower(strings.TrimSpace(resolution))
}

func (i *ImageRequest) GetExtraString(key string) string {
	raw, ok := i.Extra[key]
	if !ok || len(raw) == 0 {
		return ""
	}
	var value string
	if err := common.Unmarshal(raw, &value); err != nil {
		return ""
	}
	return strings.ToLower(strings.TrimSpace(value))
}

func (i *ImageRequest) GetExtraBool(key string) bool {
	raw, ok := i.Extra[key]
	if !ok || len(raw) == 0 {
		return false
	}
	var value bool
	return common.Unmarshal(raw, &value) == nil && value
}

func APIMartGPTImage2ResolutionPriceRatio(resolution string) float64 {
	switch strings.ToLower(strings.TrimSpace(resolution)) {
	case "2k":
		return apimartGPTImage2Price2K / apimartGPTImage2Price1K
	case "4k":
		return apimartGPTImage2Price4K / apimartGPTImage2Price1K
	default:
		return 1
	}
}

func (i *ImageRequest) APIMartImagePriceRatio() float64 {
	modelName := strings.ToLower(strings.TrimSpace(i.Model))
	resolution := i.GetResolution()
	if resolution == "" {
		resolution = defaultAPIMartResolution(modelName)
	}

	switchRatio := func(values map[string]float64) float64 {
		if ratio, ok := values[resolution]; ok {
			return ratio
		}
		return 1
	}

	switch modelName {
	case "gpt-image-2", "gpt-image-2-ext":
		return APIMartGPTImage2ResolutionPriceRatio(resolution)
	case "gemini-3.1-flash-image-preview":
		return switchRatio(map[string]float64{"0.5k": 1, "1k": 1, "2k": 4.0 / 3.0, "4k": 5.0 / 3.0})
	case "flux-2-flex":
		resolution = effectiveMegapixelResolution(i.Size, resolution)
		return switchRatio(map[string]float64{"1mp": 0.5, "2mp": 1, "3mp": 1.5, "4mp": 2})
	case "flux-2-max":
		resolution = effectiveMegapixelResolution(i.Size, resolution)
		return switchRatio(map[string]float64{"1mp": 0.7, "2mp": 1, "3mp": 1.3, "4mp": 1.6})
	case "flux-2-pro":
		resolution = effectiveMegapixelResolution(i.Size, resolution)
		return switchRatio(map[string]float64{"1mp": 2.0 / 3.0, "2mp": 1, "3mp": 4.0 / 3.0, "4mp": 5.0 / 3.0})
	case "grok-imagine-image-2.0":
		quality := strings.ToLower(strings.TrimSpace(i.Quality))
		if quality == "" || quality == "auto" {
			quality = "medium"
		}
		return switchRatio(map[string]float64{
			"1k": map[bool]float64{true: 2.0 / 3.0, false: 1}[quality == "low"],
			"2k": map[bool]float64{true: 1, false: 4.0 / 3.0}[quality == "low"],
		})
	case "grok-imagine-image-quality":
		return switchRatio(map[string]float64{"1k": 1, "2k": 1.4})
	case "qwen-image-3.0-pro":
		if pixelCount(i.Size) > 2_250_000 || resolution == "2k" {
			return 2
		}
	case "seedream-5-0-pro":
		if pixelCount(i.Size) > 2_601_124 || resolution == "2k" {
			return 2
		}
	case "z-image-turbo":
		if i.GetExtraBool("prompt_extend") {
			return 2
		}
	}
	return 1
}

func defaultAPIMartResolution(modelName string) string {
	switch modelName {
	case "flux-2-flex", "flux-2-max", "flux-2-pro":
		return "2mp"
	case "seedream-4.0", "seedream-4.5", "seedream-5-0-lite", "wan2.7-image", "wan2.7-image-pro":
		return "2k"
	default:
		return "1k"
	}
}

func effectiveMegapixelResolution(size string, fallback string) string {
	pixels := pixelCount(size)
	if pixels <= 0 {
		return fallback
	}
	tier := int(math.Ceil(float64(pixels) / 1_000_000))
	if tier < 1 {
		tier = 1
	}
	if tier > 4 {
		tier = 4
	}
	return strconv.Itoa(tier) + "mp"
}

func pixelCount(size string) int64 {
	parts := strings.Split(strings.ToLower(strings.TrimSpace(size)), "x")
	if len(parts) != 2 {
		return 0
	}
	width, err := strconv.ParseInt(strings.TrimSpace(parts[0]), 10, 64)
	if err != nil || width <= 0 {
		return 0
	}
	height, err := strconv.ParseInt(strings.TrimSpace(parts[1]), 10, 64)
	if err != nil || height <= 0 {
		return 0
	}
	return width * height
}

func (i *ImageRequest) UnmarshalJSON(data []byte) error {
	// 先解析成 map[string]interface{}
	var rawMap map[string]json.RawMessage
	if err := common.Unmarshal(data, &rawMap); err != nil {
		return err
	}

	// 用 struct tag 获取所有已定义字段名
	knownFields := GetJSONFieldNames(reflect.TypeOf(*i))

	// 再正常解析已定义字段
	type Alias ImageRequest
	var known Alias
	if err := common.Unmarshal(data, &known); err != nil {
		return err
	}
	*i = ImageRequest(known)

	// 提取多余字段
	i.Extra = make(map[string]json.RawMessage)
	for k, v := range rawMap {
		if _, ok := knownFields[k]; !ok {
			i.Extra[k] = v
		}
	}
	return nil
}

// 序列化时需要重新把字段平铺
func (r ImageRequest) MarshalJSON() ([]byte, error) {
	// 将已定义字段转为 map
	type Alias ImageRequest
	alias := Alias(r)
	base, err := common.Marshal(alias)
	if err != nil {
		return nil, err
	}

	var baseMap map[string]json.RawMessage
	if err := common.Unmarshal(base, &baseMap); err != nil {
		return nil, err
	}

	// Preserve provider-specific parameters from the workbench while keeping
	// typed fields authoritative. The gateway-only group selector must not be
	// forwarded to the upstream provider.
	for k, v := range r.Extra {
		if _, exists := baseMap[k]; !exists {
			baseMap[k] = v
		}
	}
	delete(baseMap, "group")

	return common.Marshal(baseMap)
}

func GetJSONFieldNames(t reflect.Type) map[string]struct{} {
	fields := make(map[string]struct{})
	for i := 0; i < t.NumField(); i++ {
		field := t.Field(i)

		// 跳过匿名字段（例如 ExtraFields）
		if field.Anonymous {
			continue
		}

		tag := field.Tag.Get("json")
		if tag == "-" || tag == "" {
			continue
		}

		// 取逗号前字段名（排除 omitempty 等）
		name := tag
		if commaIdx := indexComma(tag); commaIdx != -1 {
			name = tag[:commaIdx]
		}
		fields[name] = struct{}{}
	}
	return fields
}

func indexComma(s string) int {
	for i := 0; i < len(s); i++ {
		if s[i] == ',' {
			return i
		}
	}
	return -1
}

func (i *ImageRequest) GetTokenCountMeta() *types.TokenCountMeta {
	var sizeRatio = 1.0
	var qualityRatio = 1.0

	if strings.HasPrefix(i.Model, "dall-e") {
		// Size
		if i.Size == "256x256" {
			sizeRatio = 0.4
		} else if i.Size == "512x512" {
			sizeRatio = 0.45
		} else if i.Size == "1024x1024" {
			sizeRatio = 1
		} else if i.Size == "1024x1792" || i.Size == "1792x1024" {
			sizeRatio = 2
		}

		if i.Model == "dall-e-3" && i.Quality == "hd" {
			qualityRatio = 2.0
			if i.Size == "1024x1792" || i.Size == "1792x1024" {
				qualityRatio = 1.5
			}
		}
	}
	// n is NOT included here; it is handled via OtherRatio("n") in
	// image_handler.go (default) or channel adaptors (actual count).
	// Including n here caused double-counting for channels that also
	// set OtherRatio("n") (e.g. Ali/Bailian).
	return &types.TokenCountMeta{
		CombineText:     i.Prompt,
		MaxTokens:       1584,
		ImagePriceRatio: sizeRatio * qualityRatio,
	}
}

func (i *ImageRequest) IsStream(c *gin.Context) bool {
	return false
}

func (i *ImageRequest) SetModelName(modelName string) {
	if modelName != "" {
		i.Model = modelName
	}
}

type ImageResponse struct {
	Data     []ImageData     `json:"data"`
	Created  int64           `json:"created"`
	Metadata json.RawMessage `json:"metadata,omitempty"`
}
type ImageData struct {
	Url           string `json:"url"`
	B64Json       string `json:"b64_json"`
	RevisedPrompt string `json:"revised_prompt"`
}
