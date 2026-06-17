# 路由与转发

> **摘要**：SynthAPI 的路由系统基于 Gin 框架，分为管理 API（`/api/*`）、Relay API（`/v1/*`）、Dashboard 和 Web 前端四组路由。Relay 路由支持 OpenAI、Claude、Gemini 等多种 API 格式的自动识别和转发。

## 路由架构

SynthAPI 运行两个独立的 HTTP 服务：

```
Admin 端口（默认 3000）
├── /api/*          → 管理 API（用户、渠道、Token、配置等）
├── /v1/*           → Relay API（Chat、Image、Audio 等）
├── /v1beta/*       → Gemini API
├── /pg/*           → Playground
├── /mj/*           → Midjourney
├── /suno/*         → Suno
├── /dashboard/*    → Dashboard
└── /*              → Web 前端

Public 端口（默认 80）
├── /dashboard/*    → Dashboard（只读）
├── /v1/*           → Relay API
└── 其他            → 404
```

## 路由分组

### 管理 API 路由 (`/api/*`)

管理 API 路由定义在 `router/api-router.go` 中，按功能模块分组：

| 路径前缀 | 认证要求 | 说明 |
|----------|----------|------|
| `/api/user/*` | 无/用户/管理员 | 用户注册、登录、管理 |
| `/api/token/*` | 用户 | Token 管理 |
| `/api/channel/*` | 管理员 | 渠道管理 |
| `/api/option/*` | 超级管理员 | 系统选项 |
| `/api/log/*` | 用户/管理员 | 日志查询 |
| `/api/data/*` | 用户/管理员 | 数据统计 |
| `/api/redemption/*` | 管理员 | 兑换码管理 |
| `/api/models/*` | 管理员 | 模型管理 |
| `/api/vendors/*` | 管理员 | 供应商管理 |
| `/api/deployments/*` | 管理员 | 部署管理 |
| `/api/subscription/*` | 用户 | 订阅管理 |
| `/api/performance/*` | 超级管理员 | 性能管理 |
| `/api/custom-oauth-provider/*` | 超级管理员 | 自定义 OAuth |

### Relay API 路由 (`/v1/*`)

Relay API 路由定义在 `router/relay-router.go` 中，是 SynthAPI 的核心：

```go
// Chat 相关
POST /v1/chat/completions      → OpenAI Chat Completions
POST /v1/completions            → OpenAI Legacy Completions
POST /v1/messages               → Claude Messages

// Responses 相关
POST /v1/responses              → OpenAI Responses
POST /v1/responses/compact      → OpenAI Responses 压缩版

// 图像相关
POST /v1/images/generations     → 图像生成
POST /v1/images/edits           → 图像编辑
POST /v1/edits                  → 图像编辑（兼容）

// 音频相关
POST /v1/audio/transcriptions   → 音频转写
POST /v1/audio/translations     → 音频翻译
POST /v1/audio/speech           → 语音合成

// Embedding
POST /v1/embeddings             → 文本嵌入

// Rerank
POST /v1/rerank                 → 重排序

// Realtime
GET  /v1/realtime               → WebSocket 实时对话

// Gemini
POST /v1beta/models/*path       → Gemini API
POST /v1/models/*path           → Gemini 兼容

// 模型列表
GET  /v1/models                 → 模型列表
GET  /v1/models/:model          → 模型详情

// 视频
POST /v1/videos                 → 视频生成
GET  /v1/videos/:id             → 视频状态
POST /v1/video/generations      → 视频生成（兼容）
```

### Midjourney 路由 (`/mj/*`)

```go
POST /mj/submit/imagine         → 提交想象任务
POST /mj/submit/change          → 提交变更任务
POST /mj/submit/describe        → 提交描述任务
POST /mj/submit/blend           → 提交混合任务
GET  /mj/task/:id/fetch         → 查询任务状态
GET  /mj/image/:id              → 获取图片
```

### Suno 路由 (`/suno/*`)

```go
POST /suno/submit/:action       → 提交任务
POST /suno/fetch                → 查询任务
GET  /suno/fetch/:id            → 查询指定任务
```

## API 格式自动识别

Relay 路由通过请求头和路径自动识别 API 格式：

```go
// router/relay-router.go
modelsRouter.GET("", func(c *gin.Context) {
    switch {
    case c.GetHeader("x-api-key") != "" && c.GetHeader("anthropic-version") != "":
        // Anthropic Claude 格式
        controller.ListModels(c, constant.ChannelTypeAnthropic)
    case c.GetHeader("x-goog-api-key") != "" || c.Query("key") != "":
        // Google Gemini 格式
        controller.RetrieveModel(c, constant.ChannelTypeGemini)
    default:
        // OpenAI 格式
        controller.ListModels(c, constant.ChannelTypeOpenAI)
    }
})
```

识别规则：

| 条件 | 格式 | 说明 |
|------|------|------|
| `x-api-key` + `anthropic-version` 头 | Claude | Anthropic 原生格式 |
| `x-goog-api-key` 头或 `key` 查询参数 | Gemini | Google Gemini 格式 |
| `Authorization: Bearer sk-*` | OpenAI | 默认格式 |
| 路径包含 `/v1/messages` | Claude | Claude Messages API |
| 路径包含 `/v1beta/models` | Gemini | Gemini API |
| 路径包含 `/v1/responses` | Responses | OpenAI Responses |

## 中间件链

每个路由分组都有对应的中间件链：

### Relay 中间件链

```
请求 → CORS → DecompressRequest → BodyStorageCleanup → Stats
     → TokenAuth → ModelRequestRateLimit → Distribute → Controller
```

### 管理 API 中间件链

```
请求 → RouteTag("api") → Gzip → BodyStorageCleanup → GlobalAPIRateLimit
     → [UserAuth/AdminAuth/RootAuth] → Controller
```

### Playground 中间件链

```
请求 → RouteTag("relay") → SystemPerformanceCheck → UserAuth → Distribute → Controller
```

## 请求转发流程

### 完整流程

```
1. 客户端发送 POST /v1/chat/completions
   Headers: Authorization: Bearer sk-xxx
   Body: {"model": "gpt-4o", "messages": [...]}

2. TokenAuth 中间件
   - 解析 Authorization 头，提取 Token Key
   - 验证 Token 存在、未过期、有配额
   - 检查 IP 白名单
   - 设置用户信息到上下文

3. Distribute 中间件
   - 从请求体提取 model 字段
   - 检查 Token 的模型访问权限
   - 选择合适的上游渠道（考虑分组、优先级、权重）
   - 设置渠道信息到上下文

4. Controller（relay.go）
   - 创建 RelayInfo 信息对象
   - 根据渠道类型创建对应的 Adaptor
   - 调用 Adaptor 的 DoRelay 方法

5. Adaptor.DoRelay
   - 创建计费会话，预扣配额
   - 转换请求格式为上游原生格式
   - 发送请求到上游
   - 接收响应，转换为统一格式
   - 计算 Token 用量，结算差额
   - 返回响应给客户端
```

### 渠道选择算法

渠道选择在 `service/channel_select.go` 中实现：

```go
func CacheGetRandomSatisfiedChannel(param *RetryParam) (*model.Channel, string, error) {
    // 1. 确定分组（auto/指定分组/智能分组）
    // 2. 获取该分组下支持目标模型的渠道
    // 3. 按优先级排序
    // 4. 在同一优先级内按权重随机选择
    // 5. 返回选中的渠道
}
```

选择策略：
1. **分组过滤**：只选择属于当前分组的渠道
2. **模型过滤**：只选择支持目标模型的渠道（通过 Ability 表）
3. **状态过滤**：只选择启用状态的渠道
4. **优先级排序**：数值越小越优先
5. **权重随机**：同一优先级内按权重随机选择

### 重试机制

当请求失败时，系统会自动重试其他渠道：

```go
// 控制器层
for retry := 0; retry <= common.RetryTimes; retry++ {
    channel, err = service.CacheGetRandomSatisfiedChannel(retryParam)
    if err != nil {
        break
    }
    // 执行请求
    // 如果成功，跳出循环
    // 如果失败，增加重试计数，继续循环
}
```

重试条件：
- 上游返回 5xx 错误
- 上游超时
- 上游连接失败
- 渠道被自动禁用

## 路径参数提取

### Gemini 路径

Gemini API 使用特殊的路径格式：

```
POST /v1beta/models/gemini-2.0-flash:generateContent
```

模型名从路径中提取：

```go
func extractModelNameFromGeminiPath(path string) string {
    // 查找 "/models/" 的位置
    // 提取到 ":" 之前的部分
    // 返回 "gemini-2.0-flash"
}
```

### 视频任务路径

视频 API 支持多种路径格式：

```
POST /v1/videos                 → 提交视频生成
GET  /v1/videos/:task_id        → 查询视频状态
POST /v1/video/generations      → 提交视频生成（兼容）
GET  /v1/video/generations/:id  → 查询视频状态（兼容）
```

## Public 端口限制

Public 端口通过 `publicExposureGuard` 中间件限制可访问的路径：

**允许的路径**：
- `/dashboard`
- `/dashboard/overview`
- `/dashboard/models`
- `/v1/*`（Relay API）

**禁止的路径**：
- `/system-settings/*`
- `/users/*`
- `/channels/*`
- `/api/option/*`
- `/api/channel/*`
- `/api/user/*`（部分）
- 其他管理类路径

## WebSocket 路由

Realtime API 使用 WebSocket 协议：

```
GET /v1/realtime?model=gpt-4o-realtime-preview-2024-10-01
Headers:
  Authorization: Bearer sk-xxx
  Sec-WebSocket-Protocol: realtime, openai-insecure-api-key.sk-xxx
```

WebSocket 认证从 `Sec-WebSocket-Protocol` 头中提取 API Key。
