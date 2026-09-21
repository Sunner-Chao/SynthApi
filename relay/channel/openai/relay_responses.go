package openai

import (
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

func OaiResponsesHandler(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
	defer service.CloseResponseBodyGracefully(resp)

	// read response body
	var responsesResponse dto.OpenAIResponsesResponse
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeReadResponseBodyFailed, http.StatusInternalServerError)
	}
	err = common.Unmarshal(responseBody, &responsesResponse)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}
	if oaiError := responsesResponse.GetOpenAIError(); oaiError != nil {
		if capacityErr := newRecognizedAutoRouteError(oaiError, resp.StatusCode); capacityErr != nil {
			return nil, capacityErr
		}
		if oaiError.Type != "" {
			return nil, types.WithOpenAIError(*oaiError, resp.StatusCode)
		}
	}

	if responsesResponse.HasImageGenerationCall() {
		c.Set("image_generation_call", true)
		c.Set("image_generation_call_quality", responsesResponse.GetQuality())
		c.Set("image_generation_call_size", responsesResponse.GetSize())
	}
	for _, output := range responsesResponse.Output {
		if service.IsLongContextCompactionType(output.Type) {
			service.MarkLongContextCompactionObserved(c)
			break
		}
	}

	// 写入新的 response body
	service.IOCopyBytesGracefully(c, resp, responseBody)

	// compute usage
	usage := dto.Usage{}
	if responsesResponse.Usage != nil {
		usage.PromptTokens = responsesResponse.Usage.InputTokens
		usage.CompletionTokens = responsesResponse.Usage.OutputTokens
		usage.TotalTokens = responsesResponse.Usage.TotalTokens
		if responsesResponse.Usage.InputTokensDetails != nil {
			usage.PromptTokensDetails.CachedTokens = responsesResponse.Usage.InputTokensDetails.CachedTokens
		}
	}
	if info == nil || info.ResponsesUsageInfo == nil || info.ResponsesUsageInfo.BuiltInTools == nil {
		return &usage, nil
	}
	// 解析 Tools 用量
	for _, tool := range responsesResponse.Tools {
		buildToolinfo, ok := info.ResponsesUsageInfo.BuiltInTools[common.Interface2String(tool["type"])]
		if !ok || buildToolinfo == nil {
			logger.LogError(c, fmt.Sprintf("BuiltInTools not found for tool type: %v", tool["type"]))
			continue
		}
		buildToolinfo.CallCount++
	}
	return &usage, nil
}

func OaiResponsesStreamHandler(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
	if resp == nil || resp.Body == nil {
		logger.LogError(c, "invalid response or response body")
		return nil, types.NewError(fmt.Errorf("invalid response"), types.ErrorCodeBadResponse)
	}

	defer service.CloseResponseBodyGracefully(resp)

	var usage = &dto.Usage{}
	var responseTextBuilder strings.Builder
	streamCompleted := false
	var streamErr *types.NewAPIError

	helper.StreamScannerHandler(c, resp, info, func(data string, sr *helper.StreamResult) {
		// Decode the envelope first.  Responses is an extensible event stream and
		// providers may add fields (or use a non-string delta) that are not yet in
		// our DTO.  A valid event must still be forwarded byte-for-byte instead of
		// being turned into a scanner/handler failure merely because its optional
		// shape is newer than this gateway.
		var envelope struct {
			Type  string `json:"type"`
			Error any    `json:"error,omitempty"`
		}
		if err := common.UnmarshalJsonStr(data, &envelope); err != nil {
			sr.Stop(err)
			return
		}
		eventType := strings.TrimSpace(envelope.Type)

		// Decode the known fields for billing/tool accounting when possible.  If
		// a provider adds a field with an incompatible type, retain the raw event
		// and continue; completion detection below is based on the envelope type.
		var streamResponse dto.ResponsesStreamResponse
		decoded := common.UnmarshalJsonStr(data, &streamResponse) == nil
		if !decoded {
			streamResponse.Type = eventType
		}
		if capacityErr := newRecognizedAutoRouteError(envelope.Error, http.StatusServiceUnavailable); capacityErr != nil {
			streamErr = capacityErr
			sr.Stop(streamErr)
			return
		}
		if decoded && streamResponse.Response != nil {
			if capacityErr := newRecognizedAutoRouteError(streamResponse.Response.Error, http.StatusServiceUnavailable); capacityErr != nil {
				streamErr = capacityErr
				sr.Stop(streamErr)
				return
			}
		} else if !decoded {
			// Preserve Auto failover for an error event whose optional response
			// fields have a newer shape than the DTO.  Decode only a generic map;
			// this path never changes the bytes sent to the client.
			var generic map[string]any
			if err := common.UnmarshalJsonStr(data, &generic); err == nil {
				if response, ok := generic["response"].(map[string]any); ok {
					if capacityErr := newRecognizedAutoRouteError(response["error"], http.StatusServiceUnavailable); capacityErr != nil {
						streamErr = capacityErr
						sr.Stop(streamErr)
						return
					}
				}
			}
		}
		if err := sendResponsesStreamData(c, streamResponse, data); err != nil {
			sr.Stop(err)
			return
		}
		switch eventType {
		case "response.completed":
			streamCompleted = true
			if decoded && streamResponse.Response != nil {
				if streamResponse.Response.Usage != nil {
					if streamResponse.Response.Usage.InputTokens != 0 {
						usage.PromptTokens = streamResponse.Response.Usage.InputTokens
					}
					if streamResponse.Response.Usage.OutputTokens != 0 {
						usage.CompletionTokens = streamResponse.Response.Usage.OutputTokens
					}
					if streamResponse.Response.Usage.TotalTokens != 0 {
						usage.TotalTokens = streamResponse.Response.Usage.TotalTokens
					}
					if streamResponse.Response.Usage.InputTokensDetails != nil {
						usage.PromptTokensDetails.CachedTokens = streamResponse.Response.Usage.InputTokensDetails.CachedTokens
					}
				}
				if streamResponse.Response.HasImageGenerationCall() {
					c.Set("image_generation_call", true)
					c.Set("image_generation_call_quality", streamResponse.Response.GetQuality())
					c.Set("image_generation_call_size", streamResponse.Response.GetSize())
				}
			}
			// response.completed is the protocol terminal event. Stop reading
			// before a proxy can close the trailing connection and report a
			// transport error after the response was already complete.
			sr.Done()
		case "response.output_text.delta":
			// 处理输出文本
			responseTextBuilder.WriteString(streamResponse.Delta)
		case dto.ResponsesOutputTypeItemDone:
			// 函数调用处理
			if streamResponse.Item != nil {
				switch streamResponse.Item.Type {
				case dto.BuildInCallWebSearchCall:
					if info != nil && info.ResponsesUsageInfo != nil && info.ResponsesUsageInfo.BuiltInTools != nil {
						if webSearchTool, exists := info.ResponsesUsageInfo.BuiltInTools[dto.BuildInToolWebSearchPreview]; exists && webSearchTool != nil {
							webSearchTool.CallCount++
						}
					}
				}
			}
		}
		if service.IsLongContextCompactionType(streamResponse.Type) ||
			(streamResponse.Item != nil && service.IsLongContextCompactionType(streamResponse.Item.Type)) {
			service.MarkLongContextCompactionObserved(c)
		}
	})
	if streamErr != nil {
		return nil, streamErr
	}
	if !streamCompleted {
		if info != nil && info.StreamStatus != nil && info.StreamStatus.EndReason == relaycommon.StreamEndReasonDone {
			return nil, newAutoRouteFailureFromText(
				"stream disconnected before completion: upstream sent [DONE] before response.completed",
				http.StatusBadGateway,
			)
		}
		if streamFailure := newUpstreamStreamFailure(info); streamFailure != nil {
			return nil, streamFailure
		}
	}

	if usage.CompletionTokens == 0 {
		// 计算输出文本的 token 数量
		tempStr := responseTextBuilder.String()
		if len(tempStr) > 0 {
			// 非正常结束，使用输出文本的 token 数量
			completionTokens := service.CountTextToken(tempStr, info.UpstreamModelName)
			usage.CompletionTokens = completionTokens
		}
	}

	if usage.PromptTokens == 0 && usage.CompletionTokens != 0 {
		usage.PromptTokens = info.GetEstimatePromptTokens()
	}

	usage.TotalTokens = usage.PromptTokens + usage.CompletionTokens
	if streamCompleted && c.Request.Context().Err() == nil {
		helper.Done(c)
	}

	return usage, nil
}
