# 代理转发 API

> **摘要**：SynthAPI 提供 OpenAI 兼容的统一 API 接口，支持 Chat Completions、Responses、Image、Audio、Embedding、Rerank、Realtime 等多种接口。客户端使用标准 OpenAI SDK 即可调用所有上游提供商的模型。

## 基础信息

- **Base URL**：`http://your-domain:3000/v1`
- **认证方式**：`Authorization: Bearer sk-your-token`
- **内容类型**：`application/json`
- **流式支持**：SSE（Server-Sent Events）

## Chat Completions

### 请求

```bash
POST /v1/chat/completions
```

**请求体**：

```json
{
    "model": "gpt-4o",
    "messages": [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello!"}
    ],
    "temperature": 0.7,
    "max_tokens": 1000,
    "stream": false
}
```

**参数说明**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | 是 | 模型名称 |
| `messages` | array | 是 | 消息列表 |
| `temperature` | float | 否 | 温度（0-2） |
| `max_tokens` | int | 否 | 最大生成 Token 数 |
| `stream` | bool | 否 | 是否流式输出 |
| `top_p` | float | 否 | 核采样 |
| `frequency_penalty` | float | 否 | 频率惩罚 |
| `presence_penalty` | float | 否 | 存在惩罚 |
| `stop` | string/array | 否 | 停止序列 |
| `tools` | array | 否 | 工具定义 |
| `tool_choice` | string/object | 否 | 工具选择策略 |

**响应**：

```json
{
    "id": "chatcmpl-xxx",
    "object": "chat.completion",
    "created": 1234567890,
    "model": "gpt-4o",
    "choices": [{
        "index": 0,
        "message": {
            "role": "assistant",
            "content": "Hello! How can I help you today?"
        },
        "finish_reason": "stop"
    }],
    "usage": {
        "prompt_tokens": 10,
        "completion_tokens": 8,
        "total_tokens": 18
    }
}
```

### 流式请求

```bash
curl http://your-domain:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

**流式响应**：

```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"!"},"finish_reason":null}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

## Claude Messages

### 请求

```bash
POST /v1/messages
```

**请求体**：

```json
{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 1000,
    "messages": [
        {"role": "user", "content": "Hello!"}
    ],
    "system": "You are a helpful assistant."
}
```

**响应**：

```json
{
    "id": "msg_xxx",
    "type": "message",
    "role": "assistant",
    "content": [{"type": "text", "text": "Hello! How can I help you?"}],
    "model": "claude-3-5-sonnet-20241022",
    "stop_reason": "end_turn",
    "usage": {"input_tokens": 10, "output_tokens": 8}
}
```

## OpenAI Responses

### 请求

```bash
POST /v1/responses
```

**请求体**：

```json
{
    "model": "gpt-4o",
    "input": "Hello!",
    "stream": false
}
```

**响应**：

```json
{
    "id": "resp_xxx",
    "object": "response",
    "model": "gpt-4o",
    "output": [{
        "type": "message",
        "role": "assistant",
        "content": [{"type": "output_text", "text": "Hello!"}]
    }],
    "usage": {"input_tokens": 10, "output_tokens": 5}
}
```

## Image Generation

### 请求

```bash
POST /v1/images/generations
```

**请求体**：

```json
{
    "model": "dall-e-3",
    "prompt": "A cute cat wearing a hat",
    "n": 1,
    "size": "1024x1024"
}
```

**响应**：

```json
{
    "created": 1234567890,
    "data": [{
        "url": "https://..."
    }]
}
```

APIMart GPT Image 2 兼容参数也可以直接通过 API Key 传入：

```json
{
    "model": "gpt-image-2",
    "prompt": "A clean product illustration",
    "n": 1,
    "size": "16:9",
    "resolution": "2k",
    "image_urls": ["https://example.com/reference.png"],
    "official_fallback": false
}
```

`image_urls` 支持公网 URL 或 Base64 Data URI，最多 16 张；`size` 支持文档中的比例或 `WIDTHxHEIGHT` 自定义尺寸，`resolution` 支持 `1k`、`2k`、`4k`。请求仍受 API Key 的模型限制和分组限制约束。

当请求路由到 APIMart 可配置生图线路时，GPT Image 2 按分辨率档位计费：1K 为基础价，2K 为 `1.6471x`，4K 为 `2.4706x`；`n` 会继续按图片张数相乘。`size` 只控制画面比例和实际像素尺寸，不额外改变价格档位。其他生图线路仍使用各自渠道的定价规则。

## Audio

### 音频转写

```bash
POST /v1/audio/transcriptions
```

**请求体**（multipart/form-data）：

```bash
curl http://your-domain:3000/v1/audio/transcriptions \
  -H "Authorization: Bearer sk-your-token" \
  -F file="@audio.mp3" \
  -F model="whisper-1"
```

### 语音合成

```bash
POST /v1/audio/speech
```

**请求体**：

```json
{
    "model": "tts-1",
    "input": "Hello, world!",
    "voice": "alloy"
}
```

## Embedding

### 请求

```bash
POST /v1/embeddings
```

**请求体**：

```json
{
    "model": "text-embedding-3-small",
    "input": "Hello, world!"
}
```

**响应**：

```json
{
    "object": "list",
    "data": [{
        "object": "embedding",
        "embedding": [0.0023064255, -0.009327292, ...],
        "index": 0
    }],
    "model": "text-embedding-3-small",
    "usage": {"prompt_tokens": 4, "total_tokens": 4}
}
```

## Rerank

### 请求

```bash
POST /v1/rerank
```

**请求体**：

```json
{
    "model": "rerank-v3.5",
    "query": "What is AI?",
    "documents": [
        "AI is artificial intelligence",
        "Machine learning is a subset of AI"
    ],
    "top_n": 2
}
```

## Realtime (WebSocket)

### 连接

```bash
wss://your-domain:3000/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01
```

**认证**：通过 `Sec-WebSocket-Protocol` 头传递 API Key。

## Gemini API

### 请求

```bash
POST /v1beta/models/gemini-2.0-flash:generateContent?key=sk-your-token
```

**请求体**：

```json
{
    "contents": [{
        "parts": [{"text": "Hello!"}]
    }]
}
```

## 模型列表

### 获取所有模型

```bash
GET /v1/models
```

**响应**：

```json
{
    "object": "list",
    "data": [
        {
            "id": "gpt-4o",
            "object": "model",
            "owned_by": "openai"
        },
        {
            "id": "claude-3-5-sonnet-20241022",
            "object": "model",
            "owned_by": "anthropic"
        }
    ]
}
```

### 获取模型详情

```bash
GET /v1/models/:model
```

## 指定渠道

管理员可以在请求中指定使用特定渠道：

```bash
curl http://your-domain:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-your-token-123" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4o", "messages": [...]}'
```

其中 `123` 是渠道 ID。

## 错误处理

### 错误响应格式

```json
{
    "error": {
        "message": "错误信息",
        "type": "invalid_request_error",
        "code": "model_not_found"
    }
}
```

### 常见错误码

| HTTP 状态码 | 错误类型 | 说明 |
|-------------|----------|------|
| 400 | invalid_request_error | 请求参数错误 |
| 401 | authentication_error | 认证失败 |
| 403 | permission_error | 权限不足 |
| 404 | not_found | 资源不存在 |
| 429 | rate_limit_error | 请求过于频繁 |
| 500 | server_error | 服务器内部错误 |
| 502 | bad_gateway | 上游服务错误 |
| 503 | service_unavailable | 服务不可用 |

## 使用 OpenAI SDK

### Python

```python
from openai import OpenAI

client = OpenAI(
    api_key="sk-your-token",
    base_url="http://your-domain:3000/v1"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### Node.js

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
    apiKey: 'sk-your-token',
    baseURL: 'http://your-domain:3000/v1'
});

const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Hello!' }]
});
console.log(response.choices[0].message.content);
```

### Go

```go
import "github.com/sashabaranov/go-openai"

client := openai.NewClient("sk-your-token")
client.BaseURL = "http://your-domain:3000/v1"

response, err := client.CreateChatCompletion(
    context.Background(),
    openai.ChatCompletionRequest{
        Model: "gpt-4o",
        Messages: []openai.ChatCompletionMessage{
            {Role: "user", Content: "Hello!"},
        },
    },
)
```
