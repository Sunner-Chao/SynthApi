package common

import "testing"

func TestIsAPIMartAPIBaseURL(t *testing.T) {
	tests := []struct {
		baseURL  string
		expected bool
	}{
		{baseURL: "https://api.apimart.ai", expected: true},
		{baseURL: "https://API.APIMART.AI/v1", expected: true},
		{baseURL: "https://api.apimart.ai.evil.example", expected: false},
		{baseURL: "https://yujianwudi.top", expected: false},
		{baseURL: "", expected: false},
	}

	for _, test := range tests {
		if actual := IsAPIMartAPIBaseURL(test.baseURL); actual != test.expected {
			t.Fatalf("IsAPIMartAPIBaseURL(%q) = %t, expected %t", test.baseURL, actual, test.expected)
		}
	}
}
