package dto

import (
	"strings"
)

func (i *ImageRequest) IsAPIMartGPTImage25() bool {
	switch strings.ToLower(strings.TrimSpace(i.Model)) {
	case "gpt-image-2.5-ext", "gpt-image-2.5-flare", "gpt-image-2.5-sunburst":
		return true
	}
	return false
}

// APIMart's 2026-09-22 square-image output reservations, in USD before its
// account discount. The 1K/medium baseline is configured in ModelPrice.
// Auto reserves max quality; exact pixels use the largest tier. These are
// reservations only: task.cost settles the actual input and output at +15%.
func (i *ImageRequest) apimartGPTImage25PriceRatio() float64 {
	prices := map[string][3]float64{
		"low":    {0.00588, 0.01191, 0.01977},
		"medium": {0.01317, 0.02676, 0.04449},
		"high":   {0.05268, 0.10704, 0.17790},
		"xhigh":  {0.09366, 0.19029, 0.31626},
		"max":    {0.21072, 0.42816, 0.71157},
	}
	quality := strings.ToLower(strings.TrimSpace(i.Quality))
	values, ok := prices[quality]
	if !ok {
		values = prices["max"]
	}
	tier := 0
	switch i.GetResolution() {
	case "2k":
		tier = 1
	case "4k":
		tier = 2
	}
	if pixelCount(i.Size) > 0 {
		tier = 2
	}
	return values[tier] / prices["medium"][0]
}
