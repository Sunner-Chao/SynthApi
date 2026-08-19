package middleware

import (
	"reflect"
	"testing"
)

func TestReadOnlyTokenKeyCandidates(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want []string
	}{
		{name: "plain", raw: "tokenvalue", want: []string{"tokenvalue"}},
		{name: "bearer", raw: "Bearer sk-tokenvalue", want: []string{"tokenvalue"}},
		{name: "lowercase bearer", raw: "bearer sk-tokenvalue", want: []string{"tokenvalue"}},
		{name: "duplicate prefix", raw: "Bearer sk-sk-tokenvalue", want: []string{"tokenvalue"}},
		{name: "x api key form", raw: " sk-tokenvalue ", want: []string{"tokenvalue"}},
		{
			name: "complete dashed key before route suffix",
			raw:  "sk-token-value-route",
			want: []string{"token-value-route", "token-value", "token"},
		},
		{name: "whitespace", raw: "   ", want: nil},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := readOnlyTokenKeyCandidates(test.raw); !reflect.DeepEqual(got, test.want) {
				t.Fatalf("readOnlyTokenKeyCandidates(%q) = %#v, want %#v", test.raw, got, test.want)
			}
		})
	}
}
