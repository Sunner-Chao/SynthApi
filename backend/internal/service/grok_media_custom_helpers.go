package service

import (
	"strings"

	"github.com/tidwall/gjson"
)

func grokMediaJSONImageURL(value gjson.Result) string {
	if imageURL := strings.TrimSpace(value.Get("url").String()); imageURL != "" {
		return imageURL
	}
	return strings.TrimSpace(value.Get("image_url").String())
}
