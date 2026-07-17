package controller

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestIsSensitiveOptionKeyAllowsTokenConcurrencySetting(t *testing.T) {
	require.False(t, isSensitiveOptionKey("ModelRequestMaxConcurrencyPerToken"))

	for _, key := range []string{
		"SMTPToken",
		"GitHubClientSecret",
		"TurnstileSiteKey",
		"payment.api_key",
	} {
		require.True(t, isSensitiveOptionKey(key), key)
	}
}
