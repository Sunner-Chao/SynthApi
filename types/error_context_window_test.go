package types

import (
	"errors"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestIsContextWindowExceededError(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		err     *NewAPIError
		expects bool
	}{
		{
			name: "upstream wraps context error in 502",
			err: WithOpenAIError(OpenAIError{
				Message: "Your input exceeds the context window of this model. Please adjust your input and try again.",
				Code:    "unknown_error",
			}, http.StatusBadGateway),
			expects: true,
		},
		{
			name: "standard OpenAI error code",
			err: WithOpenAIError(OpenAIError{
				Message: "request rejected",
				Code:    "context_length_exceeded",
			}, http.StatusBadRequest),
			expects: true,
		},
		{
			name: "invalid request wrapped in gateway error",
			err: WithOpenAIError(OpenAIError{
				Message: "Invalid request: unsupported parameter reasoning_mode",
				Code:    "unknown_error",
			}, http.StatusBadGateway),
			expects: true,
		},
		{
			name: "transient invalid upstream response",
			err: WithOpenAIError(OpenAIError{
				Message: "The origin web server returned an invalid or incomplete response",
				Code:    "bad_response_status_code",
			}, http.StatusBadGateway),
			expects: false,
		},
		{
			name:    "ordinary gateway error",
			err:     NewErrorWithStatusCode(errors.New("bad gateway"), ErrorCodeBadResponseStatusCode, http.StatusBadGateway),
			expects: false,
		},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, test.expects, IsDeterministicRequestError(test.err))
		})
	}
}
