package claude

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
)

type responsesCompatInput struct {
	Type      string          `json:"type,omitempty"`
	Role      string          `json:"role,omitempty"`
	Content   json.RawMessage `json:"content,omitempty"`
	Text      string          `json:"text,omitempty"`
	ImageURL  any             `json:"image_url,omitempty"`
	FileURL   any             `json:"file_url,omitempty"`
	CallID    string          `json:"call_id,omitempty"`
	Output    any             `json:"output,omitempty"`
	Name      string          `json:"name,omitempty"`
	Arguments json.RawMessage `json:"arguments,omitempty"`
}

func rawMessageString(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	if common.GetJsonType(raw) == "string" {
		var s string
		_ = common.Unmarshal(raw, &s)
		return s
	}
	return string(raw)
}

func responsesCompatImageURL(v any) any {
	switch vv := v.(type) {
	case string:
		return vv
	case map[string]any:
		if url := common.Interface2String(vv["url"]); url != "" {
			return url
		}
		return v
	default:
		return v
	}
}

func responsesCompatContentFromParts(raw json.RawMessage, role string) (any, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return "", nil
	}
	if common.GetJsonType(raw) == "string" {
		return rawMessageString(raw), nil
	}
	if common.GetJsonType(raw) != "array" {
		return rawMessageString(raw), nil
	}

	var parts []responsesCompatInput
	if err := common.Unmarshal(raw, &parts); err != nil {
		return nil, err
	}
	content := make([]dto.MediaContent, 0, len(parts))
	for _, part := range parts {
		switch part.Type {
		case "input_text", "output_text", "text":
			content = append(content, dto.MediaContent{
				Type: dto.ContentTypeText,
				Text: part.Text,
			})
		case "input_image":
			content = append(content, dto.MediaContent{
				Type:     dto.ContentTypeImageURL,
				ImageUrl: responsesCompatImageURL(part.ImageURL),
			})
		case "input_file":
			content = append(content, dto.MediaContent{
				Type: dto.ContentTypeFile,
				File: map[string]any{"file_data": common.Interface2String(part.FileURL)},
			})
		default:
			if part.Text != "" {
				content = append(content, dto.MediaContent{
					Type: dto.ContentTypeText,
					Text: part.Text,
				})
			}
		}
	}
	if len(content) == 0 {
		return "", nil
	}
	if len(content) == 1 && content[0].Type == dto.ContentTypeText {
		return content[0].Text, nil
	}
	if role == "assistant" {
		for i := range content {
			if content[i].Type == "input_text" {
				content[i].Type = dto.ContentTypeText
			}
		}
	}
	return content, nil
}

func responsesCompatMessagesFromInput(raw json.RawMessage) ([]dto.Message, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	if common.GetJsonType(raw) == "string" {
		return []dto.Message{{Role: "user", Content: rawMessageString(raw)}}, nil
	}
	if common.GetJsonType(raw) != "array" {
		return []dto.Message{{Role: "user", Content: rawMessageString(raw)}}, nil
	}

	var inputs []responsesCompatInput
	if err := common.Unmarshal(raw, &inputs); err != nil {
		return nil, err
	}

	messages := make([]dto.Message, 0, len(inputs))
	for _, item := range inputs {
		switch item.Type {
		case "function_call_output":
			output := common.Interface2String(item.Output)
			if output == "" && item.Output != nil {
				if b, err := common.Marshal(item.Output); err == nil {
					output = string(b)
				}
			}
			messages = append(messages, dto.Message{
				Role:       "tool",
				Content:    output,
				ToolCallId: item.CallID,
			})
			continue
		case "function_call":
			toolCall := []dto.ToolCallRequest{{
				ID:   item.CallID,
				Type: "function",
				Function: dto.FunctionRequest{
					Name:      item.Name,
					Arguments: rawMessageString(item.Arguments),
				},
			}}
			toolCallRaw, _ := common.Marshal(toolCall)
			messages = append(messages, dto.Message{
				Role:      "assistant",
				Content:   "",
				ToolCalls: toolCallRaw,
			})
			continue
		}

		role := strings.TrimSpace(item.Role)
		if role == "" {
			role = "user"
		}
		content, err := responsesCompatContentFromParts(item.Content, role)
		if err != nil {
			return nil, err
		}
		if content == "" && item.Text != "" {
			content = item.Text
		}
		messages = append(messages, dto.Message{
			Role:    role,
			Content: content,
		})
	}
	return messages, nil
}

func responsesCompatInstructions(raw json.RawMessage) string {
	return strings.TrimSpace(rawMessageString(raw))
}

func responsesCompatTools(raw json.RawMessage) []dto.ToolCallRequest {
	if len(raw) == 0 || common.GetJsonType(raw) != "array" {
		return nil
	}
	var tools []map[string]any
	if err := common.Unmarshal(raw, &tools); err != nil {
		return nil
	}
	out := make([]dto.ToolCallRequest, 0, len(tools))
	for _, tool := range tools {
		if common.Interface2String(tool["type"]) != "function" {
			continue
		}
		out = append(out, dto.ToolCallRequest{
			Type: "function",
			Function: dto.FunctionRequest{
				Name:        common.Interface2String(tool["name"]),
				Description: common.Interface2String(tool["description"]),
				Parameters:  tool["parameters"],
			},
		})
	}
	return out
}

func responsesCompatToolChoice(raw json.RawMessage) any {
	if len(raw) == 0 {
		return nil
	}
	if common.GetJsonType(raw) == "string" {
		return rawMessageString(raw)
	}
	var choice map[string]any
	if err := common.Unmarshal(raw, &choice); err != nil {
		return nil
	}
	if common.Interface2String(choice["type"]) == "function" {
		name := common.Interface2String(choice["name"])
		if name != "" {
			return map[string]any{
				"type": "function",
				"function": map[string]any{
					"name": name,
				},
			}
		}
	}
	return choice
}

func responsesCompatParallelToolCalls(raw json.RawMessage) *bool {
	if len(raw) == 0 || common.GetJsonType(raw) != "bool" {
		return nil
	}
	var b bool
	if err := common.Unmarshal(raw, &b); err != nil {
		return nil
	}
	return &b
}

func responsesRequestToOpenAIChatRequest(request dto.OpenAIResponsesRequest) (*dto.GeneralOpenAIRequest, error) {
	if strings.TrimSpace(request.Model) == "" {
		return nil, fmt.Errorf("model is required")
	}
	messages, err := responsesCompatMessagesFromInput(request.Input)
	if err != nil {
		return nil, err
	}
	if instructions := responsesCompatInstructions(request.Instructions); instructions != "" {
		messages = append([]dto.Message{{
			Role:    "system",
			Content: instructions,
		}}, messages...)
	}

	chatRequest := &dto.GeneralOpenAIRequest{
		Model:            request.Model,
		Messages:         messages,
		Stream:           request.Stream,
		MaxTokens:        request.MaxOutputTokens,
		Temperature:      request.Temperature,
		TopP:             request.TopP,
		Tools:            responsesCompatTools(request.Tools),
		ToolChoice:       responsesCompatToolChoice(request.ToolChoice),
		ParallelTooCalls: responsesCompatParallelToolCalls(request.ParallelToolCalls),
		User:             request.User,
		Store:            request.Store,
		Metadata:         request.Metadata,
	}
	if request.Reasoning != nil {
		chatRequest.ReasoningEffort = request.Reasoning.Effort
	}
	return chatRequest, nil
}
