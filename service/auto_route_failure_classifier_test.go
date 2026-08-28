package service

import (
	"errors"
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/types"
	"github.com/stretchr/testify/require"
)

func TestShouldMarkAutoRouteFailureForGroupScopedErrors(t *testing.T) {
	for _, message := range []string{
		`获取分组 auto 下模型 gpt-5.6-sol 的可用渠道失败（retry）: Model "gpt-5.6-sol" is not supported by any configured account in this group`,
		"no available channel for this model",
		"Insufficient account balance",
	} {
		err := types.NewErrorWithStatusCode(errors.New(message), types.ErrorCodeGetChannelFailed, http.StatusNotFound)
		require.True(t, ShouldMarkAutoRouteFailure(err), message)
	}
}

func TestShouldMarkAutoRouteFailureForHigherPricedAutoGroup(t *testing.T) {
	err := types.NewErrorWithStatusCode(
		errors.New("预扣费额度失败, 用户剩余额度: ¥0.000206, 需要预扣费额度: ¥0.010224"),
		types.ErrorCodeInsufficientUserQuota,
		http.StatusForbidden,
	)
	require.True(t, ShouldMarkAutoRouteFailure(err))
}

func TestShouldMarkAutoRouteFailureForWrapped429(t *testing.T) {
	err := types.NewErrorWithStatusCode(
		errors.New("exceeded retry limit, last status: 429 Too Many Requests"),
		types.ErrorCodeBadResponseStatusCode,
		http.StatusTooManyRequests,
	)
	require.True(t, ShouldMarkAutoRouteFailure(err))
}

func TestShouldMarkAutoRouteFailureDoesNotMarkLocalOrOrdinaryErrors(t *testing.T) {
	for _, test := range []struct {
		name string
		err  *types.NewAPIError
	}{
		{"ordinary 404", types.NewErrorWithStatusCode(errors.New("bad response status code 404"), types.ErrorCodeGetChannelFailed, http.StatusNotFound)},
		{"user quota", types.NewErrorWithStatusCode(errors.New("用户额度不足"), types.ErrorCodeInsufficientUserQuota, http.StatusForbidden)},
		{"invalid request", types.NewErrorWithStatusCode(errors.New("invalid parameter"), types.ErrorCodeInvalidRequest, http.StatusBadRequest)},
	} {
		t.Run(test.name, func(t *testing.T) {
			require.False(t, ShouldMarkAutoRouteFailure(test.err))
		})
	}
}
