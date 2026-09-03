package openai

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNewModelCapacityErrorWithoutCode(t *testing.T) {
	err := newModelCapacityError(map[string]interface{}{
		"message": "Selected model is at capacity. Please try a different model.",
	}, http.StatusOK)
	require.NotNil(t, err)
	require.Equal(t, http.StatusServiceUnavailable, err.StatusCode)
}

func TestNewAutoRouteFailureFromText(t *testing.T) {
	for _, message := range []string{
		"stream disconnected before completion: Upstream request failed",
		"stream disconnected before completion: error sending request for url (https://upstream.invalid/v1/responses)",
		"Encrypted function output content could not be decrypted or decoded",
		"stream disconnected before completion: Transport error: network error: error decoding response body",
		`Model "gpt-5.6-sol" is not supported by any configured account in this group`,
		`The requested model is not supported by any currently configured upstream account.`,
		`unknown provider for model gpt-5.6-sol`,
		"Insufficient account balance",
	} {
		err := newAutoRouteFailureFromText(message, http.StatusOK)
		require.NotNil(t, err)
		require.Equal(t, http.StatusBadGateway, err.StatusCode)
	}
}

func TestNewRecognizedAutoRouteErrorFromSSEErrorField(t *testing.T) {
	for _, message := range []string{
		"Selected model is at capacity. Please try a different model.",
		"stream disconnected before completion: Upstream request failed",
		"stream disconnected before completion: error sending request for url",
		"Encrypted function output content could not be decrypted or decoded",
		"stream disconnected before completion: Transport error: network error: error decoding response body",
		`Model "gpt-5.6-sol" is not supported by any configured account in this group`,
		`The requested model is not supported by any currently configured upstream account.`,
		`unknown provider for model gpt-5.6-sol`,
		"Insufficient account balance",
	} {
		err := newRecognizedAutoRouteError(map[string]interface{}{"message": message}, http.StatusOK)
		require.NotNil(t, err)
	}
}

func TestNewAutoRouteFailureFromTextDoesNotMatchNormalContent(t *testing.T) {
	require.Nil(t, newAutoRouteFailureFromText("the model completed normally", http.StatusOK))
}
