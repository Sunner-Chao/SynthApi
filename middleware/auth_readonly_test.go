package middleware

import "testing"

func TestNormalizeReadOnlyTokenKey(t *testing.T) {
	tests := map[string]string{
		"plain key":               "tokenvalue",
		"bearer key":              "Bearer sk-tokenvalue",
		"lowercase bearer":        "bearer sk-tokenvalue",
		"legacy duplicate prefix": "Bearer sk-sk-tokenvalue",
		"token suffix":            "sk-tokenvalue-route",
		"x api key style":         " sk-sk-tokenvalue ",
	}

	for name, input := range tests {
		t.Run(name, func(t *testing.T) {
			if got := normalizeReadOnlyTokenKey(input); got != "tokenvalue" {
				t.Fatalf("normalizeReadOnlyTokenKey() = %q, want %q", got, "tokenvalue")
			}
		})
	}
}
