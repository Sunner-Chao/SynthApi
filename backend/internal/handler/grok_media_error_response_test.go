//go:build unit

package handler

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLocalizeGrokMediaNoAccountError(t *testing.T) {
	t.Run("unsupported model", func(t *testing.T) {
		got := localizeGrokMediaNoAccountError(noAccountErrorClassification{
			Status:        http.StatusNotFound,
			ErrType:       "model_not_found",
			ModelNotFound: true,
		}, "seedance-1.0")

		require.Equal(t, http.StatusNotFound, got.Status)
		require.Equal(t, "model_not_found", got.ErrType)
		require.Contains(t, got.Message, "seedance-1.0")
		require.Contains(t, got.Message, "当前分组未配置模型")
	})

	t.Run("temporary account shortage", func(t *testing.T) {
		got := localizeGrokMediaNoAccountError(noAccountErrorClassification{
			Status:  http.StatusServiceUnavailable,
			ErrType: "api_error",
		}, "seedance-2.0")

		require.Equal(t, http.StatusServiceUnavailable, got.Status)
		require.Equal(t, "grok_media_no_eligible_account", got.ErrType)
		require.Contains(t, got.Message, "请稍后重试")
	})
}
