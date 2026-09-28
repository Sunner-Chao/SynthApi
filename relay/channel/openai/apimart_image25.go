package openai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func prepareAPIMartGPTImage25(c *gin.Context, info *relaycommon.RelayInfo, request *dto.ImageRequest) error {
	if request.N != nil && (*request.N < 1 || *request.N > 4) {
		return fmt.Errorf("n must be between 1 and 4 for %s", request.Model)
	}
	if len(request.ImageURLs) > 16 {
		return fmt.Errorf("image_urls exceeds max 16")
	}
	// Legacy JSON clients use images or image; send only APIMart's field.
	if len(request.ImageURLs) == 0 && len(request.Image) > 0 {
		var reference string
		if common.Unmarshal(request.Image, &reference) == nil && reference != "" {
			request.ImageURLs = []string{reference}
		}
	}
	request.Images, request.Image = nil, nil
	if strings.EqualFold(request.Model, "gpt-image-2.5-ext") {
		version := request.GetExtraString("version")
		if version == "" {
			version = "flare"
		}
		if version != "flare" && version != "sunburst" {
			return fmt.Errorf("version must be flare or sunburst")
		}
		if request.Extra == nil {
			request.Extra = make(map[string]json.RawMessage)
		}
		request.Extra["version"], _ = common.Marshal(version)
		request.Resolution, _ = common.Marshal(strings.ToUpper(common.GetStringIfEmpty(request.GetResolution(), "1k")))
		return nil // Ext explicitly supports Data URLs and version=flare/sunburst.
	}
	if request.Quality != "" {
		request.Quality = strings.ToLower(strings.TrimSpace(request.Quality))
		switch request.Quality {
		case "auto", "low", "medium", "high", "xhigh", "max":
		default:
			return fmt.Errorf("quality must be auto, low, medium, high, xhigh or max")
		}
	}
	for index, reference := range request.ImageURLs {
		if !strings.HasPrefix(reference, "data:") {
			continue
		}
		imageURL, err := uploadAPIMartReference(c.Request.Context(), info, reference)
		if err != nil {
			return fmt.Errorf("reference image %d: %w", index+1, err)
		}
		request.ImageURLs[index] = imageURL
	}
	return nil
}

func uploadAPIMartReference(ctx context.Context, info *relaycommon.RelayInfo, reference string) (string, error) {
	const maxImageBytes = 20 * 1024 * 1024
	header, encoded, ok := strings.Cut(reference, ",")
	if !ok || !strings.HasSuffix(header, ";base64") || len(encoded) > base64.StdEncoding.EncodedLen(maxImageBytes) {
		return "", fmt.Errorf("reference must be a base64 image of at most 20 MiB")
	}
	mediaType, _, err := mime.ParseMediaType(strings.TrimSuffix(strings.TrimPrefix(header, "data:"), ";base64"))
	if err != nil {
		return "", fmt.Errorf("invalid reference image type")
	}
	extensions := map[string]string{"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif"}
	extension, ok := extensions[mediaType]
	if !ok {
		return "", fmt.Errorf("reference must be PNG, JPEG, WebP or GIF")
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(data) == 0 || len(data) > maxImageBytes {
		return "", fmt.Errorf("invalid base64 reference image")
	}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "reference"+extension)
	if err != nil {
		return "", err
	}
	if _, err = part.Write(data); err != nil {
		return "", err
	}
	if err = writer.Close(); err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(info.ChannelBaseUrl, "/")+"/v1/uploads/images", &body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+info.ApiKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	client, err := service.GetHttpClientWithProxy(info.ChannelSetting.Proxy)
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("APIMart reference upload failed")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("APIMart reference upload returned HTTP %d", resp.StatusCode)
	}
	var result struct {
		URL string `json:"url"`
	}
	if err := common.DecodeJson(io.LimitReader(resp.Body, 1024*1024), &result); err != nil {
		return "", fmt.Errorf("invalid APIMart upload response")
	}
	u, err := url.Parse(result.URL)
	if err != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") {
		return "", fmt.Errorf("APIMart upload response has no image URL")
	}
	return result.URL, nil
}
