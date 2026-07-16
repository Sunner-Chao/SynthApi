package service

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNormalizePaymentTopUpAmount(t *testing.T) {
	amount, err := NormalizePaymentTopUpAmount(10.99)
	require.NoError(t, err)
	require.Equal(t, 10.99, amount)

	amount, err = NormalizePaymentTopUpAmount(10.999)
	require.NoError(t, err)
	require.Equal(t, 11.0, amount)
	amount, err = NormalizePaymentTopUpAmount(1.005)
	require.NoError(t, err)
	require.Equal(t, 1.01, amount)
	amount, err = NormalizePaymentTopUpAmount(0.005)
	require.NoError(t, err)
	require.Equal(t, 0.01, amount)
	_, err = NormalizePaymentTopUpAmount(0.004)
	require.Error(t, err)
	_, err = NormalizePaymentTopUpAmount(0)
	require.Error(t, err)
}
