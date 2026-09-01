package openai

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
)

const modelAtCapacityErrorMarker = "selected model is at capacity"
const unsupportedModelInGroupErrorMarker = "not supported by any configured account in this group"
const insufficientAccountBalanceErrorMarker = "insufficient account balance"

var autoRouteStreamFailureMarkers = []string{
	"stream disconnected before completion",
	"upstream request failed",
	"error sending request for url",
	"encrypted function output content could not be decrypted or decoded",
	"transport error",
	"network error",
	"error decoding response body",
}

func newAutoRouteFailureFromText(message string, statusCode int) *types.NewAPIError {
	message = strings.TrimSpace(message)
	if message == "" {
		return nil
	}
	lowerMessage := strings.ToLower(message)
	for _, marker := range autoRouteStreamFailureMarkers {
		if strings.Contains(lowerMessage, marker) {
			if statusCode < http.StatusBadRequest || statusCode > 599 {
				statusCode = http.StatusBadGateway
			}
			return types.NewOpenAIError(errors.New(message), types.ErrorCodeBadResponse, statusCode)
		}
	}
	for _, marker := range []string{
		unsupportedModelInGroupErrorMarker,
		"not supported by any currently configured upstream account",
		"unknown provider for model",
		insufficientAccountBalanceErrorMarker,
	} {
		if strings.Contains(lowerMessage, marker) {
			if statusCode < http.StatusBadRequest || statusCode > 599 {
				statusCode = http.StatusBadGateway
			}
			return types.NewOpenAIError(errors.New(message), types.ErrorCodeBadResponse, statusCode)
		}
	}
	return nil
}

func newUpstreamStreamFailure(info *relaycommon.RelayInfo) *types.NewAPIError {
	if info == nil || info.StreamStatus == nil {
		return nil
	}
	status := info.StreamStatus
	switch status.EndReason {
	case relaycommon.StreamEndReasonScannerErr,
		relaycommon.StreamEndReasonTimeout,
		relaycommon.StreamEndReasonPingFail,
		relaycommon.StreamEndReasonPanic,
		relaycommon.StreamEndReasonEOF:
		message := "stream disconnected before completion: upstream stream ended unexpectedly"
		if status.EndError != nil {
			message = fmt.Sprintf("stream disconnected before completion: %s", status.EndError.Error())
		}
		return newAutoRouteFailureFromText(message, http.StatusBadGateway)
	default:
		return nil
	}
}

// newModelCapacityError recognizes the provider's capacity message even when
// the provider omits the usual error code/type fields. Some compatible
// upstreams emit it inside a 200 SSE event, which otherwise looks like a
// successful stream and never reaches Auto failover.
func newModelCapacityError(errorValue any, statusCode int) *types.NewAPIError {
	oaiError := dto.GetOpenAIError(errorValue)
	if oaiError == nil || !strings.Contains(strings.ToLower(oaiError.Message), modelAtCapacityErrorMarker) {
		return nil
	}
	if statusCode < http.StatusBadRequest || statusCode > 599 {
		statusCode = http.StatusServiceUnavailable
	}
	if strings.TrimSpace(oaiError.Type) == "" {
		oaiError.Type = "upstream_capacity_error"
	}
	return types.WithOpenAIError(*oaiError, statusCode)
}

func newRecognizedAutoRouteError(errorValue any, statusCode int) *types.NewAPIError {
	if capacityErr := newModelCapacityError(errorValue, statusCode); capacityErr != nil {
		return capacityErr
	}
	oaiError := dto.GetOpenAIError(errorValue)
	if oaiError == nil {
		return nil
	}
	return newAutoRouteFailureFromText(oaiError.Message, statusCode)
}
