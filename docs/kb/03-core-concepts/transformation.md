# 请求/响应转换

> **摘要**：SynthAPI 的核心能力之一是自动转换不同 AI 提供商的 API 格式。支持 OpenAI ⇄ Claude、OpenAI → Gemini、Gemini → OpenAI 等格式互转，使客户端只需对接一套 API 即可访问所有提供商。

## 转换架构

```
客户端请求 (OpenAI 格式)
    │
    ▼
┌─────────────────────────────────────┐
│         Relay Adaptor               │
│  ConvertOpenAIRequest()             │
│  将 OpenAI 格式转为上游原生格式      │
└──────────────────┬──────────────────┘
                   │
                   ▼
            上游提供商 (原生格式)
                   │
                   ▼
┌─────────────────────────────────────┐
│         Relay Adaptor               │
│  DoResponse()                       │
│  将上游响应转为 OpenAI 格式          │
└──────────────────┬──────────────────┘
                   │
                   ▼
         客户端响应 (OpenAI 格式)
```

## 支持的转换

### OpenAI ⇄ Claude Messages

**文件**：`relay/channel/claude/` 目录

**转换方向**：
- OpenAI Chat Completions → Claude Messages（请求）
- Claude Messages → OpenAI Chat Completions（响应）

**请求转换**：

```json
// OpenAI 格式
{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello!"}
    ],
    "max_tokens": 1000,
    "temperature": 0.7
}

// 转换为 Claude 格式
{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 1000,
    "system": "You are a helpful assistant.",
    "messages": [
        {"role": "user", "content": "Hello!"}
    ],
    "temperature": 0.7
}
```

**响应转换**：

```json
// Claude 响应
{
    "id": "msg_xxx",
    "type": "message",
    "role": "assistant",
    "content": [{"type": "text", "text": "Hello!"}],
    "usage": {"input_tokens": 10, "output_tokens": 5}
}

// 转换为 OpenAI 格式
{
    "id": "chatcmpl-xxx",
    "object": "chat.completion",
    "choices": [{
        "index": 0,
        "message": {"role": "assistant", "content": "Hello!"},
        "finish_reason": "stop"
    }],
    "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}
}
```

### OpenAI → Gemini

**文件**：`relay/channel/gemini/` 目录

**转换方向**：OpenAI Chat Completions → Gemini GenerateContent

**请求转换**：

```json
// OpenAI 格式
{
    "model": "gemini-2.0-flash",
    "messages": [
        {"role": "user", "content": "Hello!"}
    ],
    "temperature": 0.7
}

// 转换为 Gemini 格式
{
    "contents": [{
        "role": "user",
        "parts": [{"text": "Hello!"}]
    }],
    "generationConfig": {
        "temperature": 0.7
    }
}
```

### Gemini → OpenAI

**转换方向**：Gemini 格式 → OpenAI 兼容格式（文本）

**限制**：目前仅支持文本，不支持 Function Calling。

### OpenAI ⇄ OpenAI Responses

**文件**：`service/openai_chat_responses_compat.go`

**转换方向**：
- OpenAI Chat Completions → OpenAI Responses（请求）
- OpenAI Responses → OpenAI Chat Completions（响应）

## 转换器实现

### Adaptor 接口

每个适配器实现以下转换方法：

```go
type Adaptor interface {
    // OpenAI 格式转换
    ConvertOpenAIRequest(c *gin.Context, info *RelayInfo, request *dto.GeneralOpenAIRequest) (any, error)

    // Claude 格式转换
    ConvertClaudeRequest(c *gin.Context, info *RelayInfo, request *dto.ClaudeRequest) (any, error)

    // Gemini 格式转换
    ConvertGeminiRequest(c *gin.Context, info *RelayInfo, request *dto.GeminiChatRequest) (any, error)

    // Embedding 转换
    ConvertEmbeddingRequest(c *gin.Context, info *RelayInfo, request *dto.EmbeddingRequest) (any, error)

    // 图像转换
    ConvertImageRequest(c *gin.Context, info *RelayInfo, request *dto.ImageRequest) (any, error)

    // 音频转换
    ConvertAudioRequest(c *gin.Context, info *RelayInfo, request *dto.AudioRequest) (io.Reader, error)

    // Rerank 转换
    ConvertRerankRequest(c *gin.Context, relayMode int, request dto.RerankRequest) (any, error)

    // Responses 转换
    ConvertOpenAIResponsesRequest(c *gin.Context, info *RelayInfo, request *dto.OpenAIResponsesRequest) (any, error)
}
```

### Claude 适配器示例

```go
// relay/channel/claude/adaptor.go
func (a *Adaptor) ConvertOpenAIRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.GeneralOpenAIRequest) (any, error) {
    claudeRequest := dto.ClaudeRequest{
        Model:     request.Model,
        MaxTokens: request.MaxTokens,
    }

    // 提取 system prompt
    for _, msg := range request.Messages {
        if msg.Role == "system" {
            claudeRequest.System = msg.Content
        }
    }

    // 转换消息格式
    for _, msg := range request.Messages {
        if msg.Role != "system" {
            claudeRequest.Messages = append(claudeRequest.Messages, dto.ClaudeMessage{
                Role:    msg.Role,
                Content: msg.Content,
            })
        }
    }

    // 设置温度
    if request.Temperature != nil {
        claudeRequest.Temperature = request.Temperature
    }

    return &claudeRequest, nil
}
```

## 模型映射

模型映射允许将客户端请求的模型名转换为上游实际的模型名：

```json
// 渠道配置中的 model_mapping
{
    "gpt-4": "gpt-4-turbo",
    "gpt-3.5-turbo": "gpt-3.5-turbo-0125"
}
```

**使用场景**：
- 将旧模型名映射到新模型名
- 将通用模型名映射到特定版本
- 多提供商统一模型名

## 参数覆盖

渠道可以配置参数覆盖，在转发时修改请求参数：

```json
// 渠道配置中的 param_override
{
    "temperature": 0.5,
    "max_tokens": 2000
}
```

**配置位置**：渠道管理 → 编辑渠道 → 参数覆盖

## 请求头覆盖

渠道可以配置请求头覆盖：

```json
// 渠道配置中的 header_override
{
    "X-Custom-Header": "custom-value"
}
```

## Thinking 模式转换

SynthAPI 支持将不同提供商的 Thinking/Reasoning 模式统一处理：

### OpenAI Reasoning Effort

```
o3-mini-high    → 高推理努力
o3-mini-medium  → 中推理努力
o3-mini-low     → 低推理努力
gpt-5-high      → 高推理努力
gpt-5-medium    → 中推理努力
gpt-5-low       → 低推理努力
```

### Claude Thinking

```
claude-3-7-sonnet-20250219-thinking → 启用 thinking 模式
```

### Gemini Thinking

```
gemini-2.5-flash-thinking      → 启用 thinking 模式
gemini-2.5-flash-nothinking    → 禁用 thinking 模式
gemini-2.5-pro-thinking-128    → 启用 thinking，budget=128
```

后缀 `-low`、`-medium`、`-high` 对应不同的推理努力级别。

## Thinking-to-Content

SynthAPI 支持将 Thinking 内容转换为普通文本内容，便于客户端统一处理。

## 流式响应转换

流式响应（SSE）的转换在 `relay/helper/` 目录中处理：

```go
// 处理流式响应的 chunk
func processStreamChunk(data []byte, adaptor channel.Adaptor) ([]byte, error) {
    // 1. 解析上游 chunk
    // 2. 转换为统一格式
    // 3. 返回转换后的 chunk
}
```

## 错误格式转换

不同提供商的错误格式不同，SynthAPI 统一转换为 OpenAI 错误格式：

```json
{
    "error": {
        "message": "错误信息",
        "type": "invalid_request_error",
        "code": "model_not_found"
    }
}
```

## 自定义转换

### 添加新的转换器

1. 在 `relay/channel/` 下创建新目录
2. 实现 `channel.Adaptor` 接口
3. 在 `relay/relay_adaptor.go` 中注册

```go
// relay/channel/myprovider/adaptor.go
type Adaptor struct {
    // ...
}

func (a *Adaptor) ConvertOpenAIRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.GeneralOpenAIRequest) (any, error) {
    // 转换逻辑
}

// ... 其他接口方法
```

注册适配器：

```go
// relay/relay_adaptor.go
case constant.APITypeMyProvider:
    return &myprovider.Adaptor{}
```
