package common

import (
	"net/url"
	"strings"
)

const APIMartAPIHost = "api.apimart.ai"

func IsAPIMartAPIBaseURL(baseURL string) bool {
	parsed, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return false
	}
	return strings.EqualFold(parsed.Hostname(), APIMartAPIHost)
}
