package controller

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/types"
)

func TestChannelCooldownDecision(t *testing.T) {
	tests := []struct {
		name      string
		err       *types.NewAPIError
		wantClass string
		want      time.Duration
	}{
		{
			name:      "rate limit",
			err:       types.NewErrorWithStatusCode(errors.New("rate limited"), types.ErrorCodeBadResponseStatusCode, http.StatusTooManyRequests),
			wantClass: "rate_limit",
			want:      time.Minute,
		},
		{
			name:      "timeout request failure",
			err:       types.NewError(context.DeadlineExceeded, types.ErrorCodeDoRequestFailed),
			wantClass: "timeout",
			want:      90 * time.Second,
		},
		{
			name:      "connection request failure",
			err:       types.NewError(errors.New("dial tcp: connection refused"), types.ErrorCodeDoRequestFailed),
			wantClass: "connectivity",
			want:      45 * time.Second,
		},
		{
			name:      "credential failure",
			err:       types.NewError(errors.New("invalid key"), types.ErrorCodeChannelInvalidKey),
			wantClass: "credential",
			want:      10 * time.Minute,
		},
		{
			name:      "bad gateway",
			err:       types.NewErrorWithStatusCode(errors.New("bad gateway"), types.ErrorCodeBadResponseStatusCode, http.StatusBadGateway),
			wantClass: "upstream_gateway",
			want:      90 * time.Second,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, gotClass := channelCooldownDecision(tt.err)
			if got != tt.want || gotClass != tt.wantClass {
				t.Fatalf("channelCooldownDecision() = (%s, %q), want (%s, %q)", got, gotClass, tt.want, tt.wantClass)
			}
		})
	}
}
