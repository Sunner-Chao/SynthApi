package dto

import (
	"math"
	"testing"

	"github.com/QuantumNous/new-api/common"
)

func TestAPIMartGPTImage25Variants(t *testing.T) {
	for _, name := range []string{"gpt-image-2.5-ext", "gpt-image-2.5-flare", "gpt-image-2.5-sunburst"} {
		var request ImageRequest
		body := `{"model":"` + name + `","prompt":"test","resolution":"2K","version":"sunburst","output_compression":0}`
		if err := common.Unmarshal([]byte(body), &request); err != nil {
			t.Fatal(err)
		}
		if !request.IsAPIMartImageModel() || !request.IsAPIMartGPTImage2() || !request.IsAPIMartGPTImage25() {
			t.Fatalf("unrecognized model %s", name)
		}
		encoded, err := common.Marshal(request)
		if err != nil {
			t.Fatal(err)
		}
		var payload map[string]any
		if err := common.Unmarshal(encoded, &payload); err != nil {
			t.Fatal(err)
		}
		if payload["model"] != name || payload["version"] != "sunburst" || payload["output_compression"] != float64(0) {
			t.Fatalf("lost request fields: %s", encoded)
		}
	}
}

func TestAPIMartGPTImage25Reservations(t *testing.T) {
	for _, tt := range []struct {
		model, quality, resolution string
		want                       float64
	}{
		{"gpt-image-2.5-ext", "", "2k", 0.014 / 0.0085},
		{"gpt-image-2.5-ext", "", "4k", 0.021 / 0.0085},
		{"gpt-image-2.5-flare", "medium", "1k", 1},
		{"gpt-image-2.5-sunburst", "high", "2k", 0.10704 / 0.01317},
		{"gpt-image-2.5-flare", "auto", "4k", 0.71157 / 0.01317},
	} {
		r := ImageRequest{Model: tt.model, Quality: tt.quality}
		r.Resolution, _ = common.Marshal(tt.resolution)
		if got := r.APIMartImagePriceRatio(); math.Abs(got-tt.want) > 1e-9 {
			t.Errorf("%+v: got %g", tt, got)
		}
	}
}
