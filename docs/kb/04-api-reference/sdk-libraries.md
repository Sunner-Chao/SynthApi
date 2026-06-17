# SDK 与集成

> **摘要**：SynthAPI 提供 OpenAI 兼容的 API 接口，可以直接使用 OpenAI 官方 SDK 或任何支持自定义 Base URL 的客户端库。本文档介绍各语言 SDK 的使用方法和推荐的第三方客户端。

## 官方 SDK

SynthAPI 没有独立的 SDK，但完全兼容 OpenAI API 格式，可以直接使用 OpenAI 官方 SDK。

### Python (openai)

```bash
pip install openai
```

```python
from openai import OpenAI

client = OpenAI(
    api_key="sk-your-token",
    base_url="http://your-domain:3000/v1"
)

# Chat Completions
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello!"}
    ],
    temperature=0.7,
    max_tokens=1000
)
print(response.choices[0].message.content)

# 流式输出
stream = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")

# Embedding
embedding = client.embeddings.create(
    model="text-embedding-3-small",
    input="Hello, world!"
)
print(embedding.data[0].embedding)

# Image Generation
image = client.images.generate(
    model="dall-e-3",
    prompt="A cute cat",
    size="1024x1024"
)
print(image.data[0].url)
```

### Node.js (openai)

```bash
npm install openai
```

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
    apiKey: 'sk-your-token',
    baseURL: 'http://your-domain:3000/v1'
});

// Chat Completions
const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' }
    ],
    temperature: 0.7
});
console.log(response.choices[0].message.content);

// 流式输出
const stream = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Hello!' }],
    stream: true
});
for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

### Go (go-openai)

```bash
go get github.com/sashabaranov/go-openai
```

```go
package main

import (
    "context"
    "fmt"
    openai "github.com/sashabaranov/go-openai"
)

func main() {
    config := openai.DefaultConfig("sk-your-token")
    config.BaseURL = "http://your-domain:3000/v1"
    client := openai.NewClientWithConfig(config)

    resp, err := client.CreateChatCompletion(
        context.Background(),
        openai.ChatCompletionRequest{
            Model: "gpt-4o",
            Messages: []openai.ChatCompletionMessage{
                {Role: "system", Content: "You are a helpful assistant."},
                {Role: "user", Content: "Hello!"},
            },
        },
    )
    if err != nil {
        fmt.Printf("Error: %v\n", err)
        return
    }
    fmt.Println(resp.Choices[0].Message.Content)
}
```

### Java (openai-java)

```xml
<dependency>
    <groupId>com.openai</groupId>
    <artifactId>openai-java</artifactId>
    <version>0.0.1</version>
</dependency>
```

```java
import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import com.openai.models.chat.completions.ChatCompletionCreateParams;
import com.openai.models.chat.completions.ChatCompletion;

OpenAIClient client = OpenAIOkHttpClient.builder()
    .apiKey("sk-your-token")
    .baseUrl("http://your-domain:3000/v1")
    .build();

ChatCompletionCreateParams params = ChatCompletionCreateParams.builder()
    .model("gpt-4o")
    .addUserMessage("Hello!")
    .build();

ChatCompletion completion = client.chat().completions().create(params);
System.out.println(completion.choices().get(0).message().content());
```

## Anthropic SDK

如果需要使用 Claude Messages 格式，可以使用 Anthropic 官方 SDK：

### Python (anthropic)

```bash
pip install anthropic
```

```python
import anthropic

client = anthropic.Anthropic(
    api_key="sk-your-token",
    base_url="http://your-domain:3000"
)

message = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=1000,
    messages=[
        {"role": "user", "content": "Hello!"}
    ]
)
print(message.content[0].text)
```

## Google Generative AI SDK

如果需要使用 Gemini 格式：

### Python (google-generativeai)

```bash
pip install google-generativeai
```

```python
import google.generativeai as genai

genai.configure(
    api_key="sk-your-token",
    transport="rest",
    client_options={"api_endpoint": "http://your-domain:3000"}
)

model = genai.GenerativeModel("gemini-2.0-flash")
response = model.generate_content("Hello!")
print(response.text)
```

## 第三方客户端

### Cherry Studio

[Cherry Studio](https://www.cherry-ai.com/) 是一个功能强大的 AI 客户端，支持 SynthAPI。

**配置**：
1. 打开 Cherry Studio
2. 进入设置 → API 配置
3. 选择「自定义」提供商
4. 填写 Base URL：`http://your-domain:3000/v1`
5. 填写 API Key：`sk-your-token`

### Aion UI

[Aion UI](https://github.com/iOfficeAI/AionUi/) 是一个开源的 AI 客户端。

**配置**：
1. 打开 Aion UI
2. 进入设置 → API 设置
3. 填写 API 地址和 Key

### ChatGPT-Next-Web

```bash
docker run -d -p 3001:3001 \
  -e OPENAI_API_KEY=sk-your-token \
  -e BASE_URL=http://your-domain:3000 \
  yidadaa/chatgpt-next-web
```

### LobeChat

```bash
docker run -d -p 3210:3210 \
  -e OPENAI_API_KEY=sk-your-token \
  -e BASE_URL=http://your-domain:3000 \
  lobehub/lobe-chat
```

### Open WebUI

```bash
docker run -d -p 3000:8080 \
  -e OPENAI_API_BASE_URLS=http://your-domain:3000/v1 \
  -e OPENAI_API_KEYS=sk-your-token \
  ghcr.io/open-webui/open-webui:main
```

## curl 示例

### Chat Completions

```bash
curl http://your-domain:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
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

### Image Generation

```bash
curl http://your-domain:3000/v1/images/generations \
  -H "Authorization: Bearer sk-your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "dall-e-3",
    "prompt": "A cute cat",
    "size": "1024x1024"
  }'
```

### Embedding

```bash
curl http://your-domain:3000/v1/embeddings \
  -H "Authorization: Bearer sk-your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-3-small",
    "input": "Hello, world!"
  }'
```

## 环境变量配置

### Python

```python
import os
os.environ["OPENAI_API_KEY"] = "sk-your-token"
os.environ["OPENAI_BASE_URL"] = "http://your-domain:3000/v1"
```

### Node.js

```bash
export OPENAI_API_KEY=sk-your-token
export OPENAI_BASE_URL=http://your-domain:3000/v1
```

## 最佳实践

1. **使用环境变量**：不要在代码中硬编码 API Key
2. **错误处理**：捕获并处理 API 错误
3. **重试机制**：对临时性错误实现重试
4. **流式输出**：长对话使用流式输出提升体验
5. **超时设置**：设置合理的请求超时时间
6. **日志记录**：记录请求和响应用于调试
