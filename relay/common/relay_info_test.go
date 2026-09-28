package common

import (
	"testing"

	"github.com/QuantumNous/new-api/types"
	"github.com/stretchr/testify/require"
)

func TestRelayInfoGetFinalRequestRelayFormatPrefersExplicitFinal(t *testing.T) {
	info := &RelayInfo{
		RelayFormat:             types.RelayFormatOpenAI,
		RequestConversionChain:  []types.RelayFormat{types.RelayFormatOpenAI, types.RelayFormatClaude},
		FinalRequestRelayFormat: types.RelayFormatOpenAIResponses,
	}

	require.Equal(t, types.RelayFormat(types.RelayFormatOpenAIResponses), info.GetFinalRequestRelayFormat())
}

func TestRelayInfoGetFinalRequestRelayFormatFallsBackToConversionChain(t *testing.T) {
	info := &RelayInfo{
		RelayFormat:            types.RelayFormatOpenAI,
		RequestConversionChain: []types.RelayFormat{types.RelayFormatOpenAI, types.RelayFormatClaude},
	}

	require.Equal(t, types.RelayFormat(types.RelayFormatClaude), info.GetFinalRequestRelayFormat())
}

func TestRelayInfoGetFinalRequestRelayFormatFallsBackToRelayFormat(t *testing.T) {
	info := &RelayInfo{
		RelayFormat: types.RelayFormatGemini,
	}

	require.Equal(t, types.RelayFormat(types.RelayFormatGemini), info.GetFinalRequestRelayFormat())
}

func TestRelayInfoGetFinalRequestRelayFormatNilReceiver(t *testing.T) {
	var info *RelayInfo
	require.Equal(t, types.RelayFormat(""), info.GetFinalRequestRelayFormat())
}

func TestRelayInfoApplyBillingServiceTier(t *testing.T) {
	info := &RelayInfo{OriginModelName: "gpt-6-astra"}
	info.ApplyBillingServiceTier("fast")
	require.Equal(t, "priority", info.BillingServiceTier)
	require.Equal(t, float64(2), info.BillingMultiplier())
	require.Equal(t, float64(2), info.BillingInputRate())
	require.Equal(t, float64(2), info.BillingOutputRate())
	require.Equal(t, "openai_fast_mode", info.PriceData.BillingMultiplierReason)

	info.ApplyBillingServiceTier("default")
	// The effective upstream tier controls settlement, including downgrade.
	require.Equal(t, float64(1), info.BillingMultiplier())
	require.Equal(t, float64(1), info.BillingOutputRate())

	flex := &RelayInfo{OriginModelName: "gpt-6-astra"}
	flex.ApplyBillingServiceTier("flex")
	require.Equal(t, float64(0.5), flex.BillingInputRate())
	require.Equal(t, float64(0.5), flex.BillingOutputRate())
}
