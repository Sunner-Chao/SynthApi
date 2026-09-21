# 插件与适配器开发

> **摘要**：SynthAPI 通过适配器模式支持扩展新的上游提供商。每个适配器实现 `channel.Adaptor` 接口，负责请求格式转换和响应处理。本文档介绍如何开发自定义适配器。

## 适配器架构

```
┌─────────────────────────────────────────┐
│           Relay Adaptor 工厂            │
│  GetAdaptor(apiType int) Adaptor        │
└──────────────────┬──────────────────────┘
                   │
    ┌──────────────┼──────────────┐
    │              │              │
    ▼              ▼              ▼
┌────────┐  ┌────────┐  ┌────────┐
│ OpenAI │  │ Claude │  │ Gemini │  ...
│Adaptor │  │Adaptor │  │Adaptor │
└────────┘  └────────┘  └────────┘
```

## Adaptor 接口

定义在 `relay/channel/adapter.go`：

```go
type Adaptor interface {
    // 初始化
    Init(info *relaycommon.RelayInfo)

    // 获取上游请求 URL
    GetRequestURL(info *relaycommon.RelayInfo) (string, error)

    // 设置请求头
    SetupRequestHeader(c *gin.Context, req *http.Header, info *relaycommon.RelayInfo) error

    // 请求格式转换
    ConvertOpenAIRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.GeneralOpenAIRequest) (any, error)
    ConvertClaudeRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.ClaudeRequest) (any, error)
    ConvertGeminiRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.GeminiChatRequest) (any, error)
    ConvertEmbeddingRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.EmbeddingRequest) (any, error)
    ConvertImageRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.ImageRequest) (any, error)
    ConvertAudioRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.AudioRequest) (io.Reader, error)
    ConvertRerankRequest(c *gin.Context, relayMode int, request dto.RerankRequest) (any, error)
    ConvertOpenAIResponsesRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.OpenAIResponsesRequest) (any, error)

    // 发送请求
    DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (any, error)

    // 处理响应
    DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (usage any, err *types.NewAPIError)

    // 获取模型列表
    GetModelList() []string

    // 获取渠道名称
    GetChannelName() string
}
```

## 开发新适配器

### 步骤 1：创建目录

```bash
mkdir relay/channel/myprovider
```

### 步骤 2：实现 Adaptor

```go
// relay/channel/myprovider/adaptor.go
package myprovider

import (
    "io"
    "net/http"

    "github.com/QuantumNous/new-api/dto"
    relaycommon "github.com/QuantumNous/new-api/relay/common"
    "github.com/QuantumNous/new-api/types"
    "github.com/gin-gonic/gin"
)

type Adaptor struct {
    // 可以添加适配器状态
}

func (a *Adaptor) Init(info *relaycommon.RelayInfo) {
    // 初始化逻辑
}

func (a *Adaptor) GetRequestURL(info *relaycommon.RelayInfo) (string, error) {
    // 构造上游请求 URL
    return info.BaseURL + "/v1/chat/completions", nil
}

func (a *Adaptor) SetupRequestHeader(c *gin.Context, req *http.Header, info *relaycommon.RelayInfo) error {
    // 设置请求头
    req.Set("Authorization", "Bearer "+info.ApiKey)
    req.Set("Content-Type", "application/json")
    return nil
}

func (a *Adaptor) ConvertOpenAIRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.GeneralOpenAIRequest) (any, error) {
    // 将 OpenAI 格式转换为上游格式
    // 如果上游兼容 OpenAI 格式，直接返回 request
    return request, nil
}

func (a *Adaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (any, error) {
    // 发送请求到上游
    return nil, nil
}

func (a *Adaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (usage any, err *types.NewAPIError) {
    // 处理上游响应
    return nil, nil
}

func (a *Adaptor) GetModelList() []string {
    // 返回支持的模型列表
    return []string{"model-1", "model-2"}
}

func (a *Adaptor) GetChannelName() string {
    return "MyProvider"
}

// ... 其他接口方法的默认实现
```

### 步骤 3：注册适配器

在 `relay/relay_adaptor.go` 中添加：

```go
case constant.APITypeMyProvider:
    return &myprovider.Adaptor{}
```

### 步骤 4：添加 API 类型

在 `constant/api_type.go` 中添加：

```go
const (
    // ... 其他类型
    APITypeMyProvider
    APITypeDummy // 确保这是最后一个
)
```

### 步骤 5：添加渠道类型

在 `constant/channel.go` 中添加：

```go
const (
    // ... 其他类型
    ChannelTypeMyProvider = 58
    ChannelTypeDummy // 确保这是最后一个
)

var ChannelBaseURLs = []string{
    // ... 其他 URL
    "https://api.myprovider.com", // 58
}

var ChannelTypeNames = map[int]string{
    // ... 其他名称
    ChannelTypeMyProvider: "MyProvider",
}
```

## TaskAdaptor 接口

用于异步任务（视频生成等）：

```go
type TaskAdaptor interface {
    Init(info *relaycommon.RelayInfo)

    // 验证请求并设置动作
    ValidateRequestAndSetAction(c *gin.Context, info *relaycommon.RelayInfo) *dto.TaskError

    // 计费相关
    EstimateBilling(c *gin.Context, info *relaycommon.RelayInfo) map[string]float64
    AdjustBillingOnSubmit(info *relaycommon.RelayInfo, taskData []byte) map[string]float64
    AdjustBillingOnComplete(task *model.Task, taskResult *relaycommon.TaskInfo) int

    // 请求/响应
    BuildRequestURL(info *relaycommon.RelayInfo) (string, error)
    BuildRequestHeader(c *gin.Context, req *http.Request, info *relaycommon.RelayInfo) error
    BuildRequestBody(c *gin.Context, info *relaycommon.RelayInfo) (io.Reader, error)
    DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (*http.Response, error)
    DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (taskID string, taskData []byte, err *dto.TaskError)

    GetModelList() []string
    GetChannelName() string

    // 轮询
    FetchTask(baseUrl, key string, body map[string]any, proxy string) (*http.Response, error)
    ParseTaskResult(respBody []byte) (*relaycommon.TaskInfo, error)
}
```

## 最佳实践

1. **错误处理**：返回明确的错误信息
2. **超时设置**：合理设置请求超时
3. **日志记录**：记录关键操作
4. **测试覆盖**：编写单元测试
5. **文档完善**：添加使用文档

## 示例项目

参考现有的适配器实现：

- `relay/channel/openai/` — OpenAI 兼容适配器
- `relay/channel/claude/` — Anthropic Claude 适配器
- `relay/channel/gemini/` — Google Gemini 适配器
