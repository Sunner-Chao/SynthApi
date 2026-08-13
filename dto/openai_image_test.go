package dto

import (
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
