//go:build unit

package service

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCMCCSeedancePrivacyErrorClassification(t *testing.T) {
	body := []byte(`{"ErrorCode":"InputImageSensitiveContentDetected.PrivacyInformation","ErrorMessage":"The request failed because the input image 'content[1]' may contain real person."}`)

	require.True(t, isGrokContentPolicyRejection(http.StatusBadRequest, body))
	require.Equal(t, "The request failed because the input image 'content[1]' may contain real person.", ExtractUpstreamErrorMessage(body))
	require.Contains(t, grokContentPolicyClientMessage(body), "真人或隐私信息")
	require.Contains(t, grokContentPolicyClientMessage(body), "更换")
}
