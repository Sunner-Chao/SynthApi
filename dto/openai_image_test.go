package dto

import (
	"encoding/json"
	"math"
	"testing"

	"github.com/QuantumNous/new-api/common"
)

func TestImageRequestPreservesAPIMartParametersForAPIKeys(t *testing.T) {
	input := []byte(`{
		"model":"gpt-image-2",
		"prompt":"a product illustration",
		"size":"16:9",
		"resolution":"2k",
		"image_urls":["https://example.com/reference.png"],
		"official_fallback":false
	}`)

	var request ImageRequest
	if err := common.Unmarshal(input, &request); err != nil {
		t.Fatalf("unmarshal image request: %v", err)
	}
	if len(request.ImageURLs) != 1 || request.ImageURLs[0] == "" {
		t.Fatalf("image_urls not decoded: %#v", request.ImageURLs)
	}
	if request.OfficialFallback == nil || *request.OfficialFallback {
		t.Fatalf("official_fallback not decoded as explicit false: %#v", request.OfficialFallback)
	}

	encoded, err := common.Marshal(request)
	if err != nil {
		t.Fatalf("marshal image request: %v", err)
	}
	var fields map[string]interface{}
	if err := common.Unmarshal(encoded, &fields); err != nil {
		t.Fatalf("decode marshaled image request: %v", err)
	}
	if fields["resolution"] != "2k" {
		t.Fatalf("resolution was not preserved: %#v", fields["resolution"])
	}
	if fields["official_fallback"] != false {
		t.Fatalf("official_fallback was not preserved: %#v", fields["official_fallback"])
	}
}

func TestAPIMartGPTImage2ResolutionPriceRatio(t *testing.T) {
	tests := []struct {
		resolution string
		expected   float64
	}{
		{resolution: "1k", expected: 1},
		{resolution: "2k", expected: 0.014 / 0.0085},
		{resolution: "4k", expected: 0.021 / 0.0085},
		{resolution: "", expected: 1},
	}

	for _, test := range tests {
		actual := APIMartGPTImage2ResolutionPriceRatio(test.resolution)
		if math.Abs(actual-test.expected) > 1e-9 {
			t.Fatalf("resolution %q ratio = %f, expected %f", test.resolution, actual, test.expected)
		}
	}
}

func TestAPIMartImagePriceRatio(t *testing.T) {
	tests := []struct {
		name     string
		request  ImageRequest
		expected float64
	}{
		{
			name:     "gpt image 2 4k",
			request:  ImageRequest{Model: "gpt-image-2", Resolution: json.RawMessage(`"4k"`)},
			expected: apimartGPTImage2Price4K / apimartGPTImage2Price1K,
		},
		{
			name:     "flux pro exact three megapixels",
			request:  ImageRequest{Model: "flux-2-pro", Size: "2000x1500", Resolution: json.RawMessage(`"1MP"`)},
			expected: 4.0 / 3.0,
		},
		{
			name:     "qwen pro 2k",
			request:  ImageRequest{Model: "qwen-image-3.0-pro", Resolution: json.RawMessage(`"2K"`)},
			expected: 2,
		},
		{
			name:     "grok 2 low 1k",
			request:  ImageRequest{Model: "grok-imagine-image-2.0", Resolution: json.RawMessage(`"1K"`), Quality: "low"},
			expected: 2.0 / 3.0,
		},
		{
			name:     "z image prompt extension",
			request:  ImageRequest{Model: "z-image-turbo", Extra: map[string]json.RawMessage{"prompt_extend": json.RawMessage(`true`)}},
			expected: 2,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if actual := test.request.APIMartImagePriceRatio(); math.Abs(actual-test.expected) > 1e-9 {
				t.Fatalf("expected ratio %.9f, got %.9f", test.expected, actual)
			}
		})
	}
}
