# 中间件机制

> **摘要**：SynthAPI 的中间件基于 Gin 框架，形成请求处理管道。核心中间件包括认证（TokenAuth/UserAuth）、限流（RateLimit）、分发（Distribute）、日志（Logger）等，按顺序执行。

## 中间件执行顺序

Relay 请求的中间件链：

```
请求进入
  → RequestId          # 分配请求唯一 ID
  → PoweredBy          # 添加响应头
  → I18n               # 检测语言偏好
  → Logger             # 记录请求日志
  → CORS               # 处理跨域
  → DecompressRequest  # 解压请求体
  → BodyStorageCleanup # 清理临时存储
  → Stats              # 请求统计
  → TokenAuth          # API Key 认证
  → ModelRequestRateLimit # 模型级限流
  → Distribute         # 渠道选择与分发
  → Controller         # 业务处理
```

## 核心中间件详解

### TokenAuth — API Key 认证

**文件**：`middleware/auth.go`

**职责**：验证 API Key 的有效性，设置用户和 Token 信息到请求上下文。

**处理流程**：

1. **WebSocket 协议检测**
   - 检查 `Sec-WebSocket-Protocol` 头
   - 提取 `openai-insecure-api-key.sk-xxx` 中的 Key

2. **Anthropic 格式兼容**
   - 检查路径是否包含 `/v1/messages` 或 `/v1/models`
   - 从 `x-api-key` 头提取 Key

3. **Gemini 格式兼容**
   - 检查路径是否以 `/v1beta/models` 开头
   - 从查询参数 `key` 或 `x-goog-api-key` 头提取 Key

4. **标准格式解析**
   - 从 `Authorization: Bearer sk-xxx` 头提取 Key
   - 去除 `sk-` 前缀，取第一段作为 Token Key

5. **Token 验证**
   - 调用 `model.ValidateUserToken(key)` 验证 Token
   - 检查 Token 状态、过期时间、配额

6. **IP 白名单检查**
   - 如果 Token 配置了 IP 白名单，验证客户端 IP

7. **用户状态检查**
   - 检查用户是否被禁用

8. **分组设置**
   - 确定使用的分组（Token 分组或用户分组）
   - 验证分组访问权限

9. **上下文设置**
   - 设置 `id`、`token_id`、`token_key`、`token_quota` 等信息

**上下文变量**：

| 变量 | 类型 | 说明 |
|------|------|------|
| `id` | int | 用户 ID |
| `token_id` | int | Token ID |
| `token_key` | string | Token Key |
| `token_name` | string | Token 名称 |
| `token_unlimited_quota` | bool | 是否无限配额 |
| `token_quota` | int | 剩余配额 |
| `token_model_limit_enabled` | bool | 是否启用模型限制 |
| `token_model_limit` | map | 允许的模型列表 |

### UserAuth — 管理后台认证

**文件**：`middleware/auth.go`

**职责**：验证管理后台的 Session 认证。

**处理流程**：

1. 从 Session 中获取用户信息
2. 如果 Session 为空，尝试从 `Authorization` 头解析 Access Token
3. 验证 `New-Api-User` 头与 Session 用户 ID 一致
4. 检查用户状态和角色权限
5. 设置用户信息到上下文

**角色层级**：

| 角色 | 值 | 说明 |
|------|----|------|
| 普通用户 | 1 | 基础权限 |
| 管理员 | 10 | 管理渠道、用户 |
| 超级管理员 | 100 | 最高权限 |

### Distribute — 渠道分发

**文件**：`middleware/distributor.go`

**职责**：根据请求的模型和用户分组，选择合适的上游渠道。

**处理流程**：

1. **提取模型信息**
   - 从请求体解析 `model` 字段
   - 特殊路径（Midjourney、Suno、Video、Gemini）使用专用解析逻辑

2. **检查 Token 模型限制**
   - 如果 Token 启用了模型限制，验证请求的模型是否在允许列表中

3. **指定渠道处理**
   - 如果管理员指定了渠道 ID，直接使用该渠道

4. **渠道亲和性检查**
   - 查询渠道亲和性缓存，优先使用上次成功的渠道

5. **自动分组处理**
   - 如果分组为 `auto`，遍历所有可用分组
   - 支持跨分组重试

6. **随机选择渠道**
   - 调用 `service.CacheGetRandomSatisfiedChannel`
   - 按优先级和权重随机选择

7. **设置上下文**
   - 设置渠道 ID、类型、BaseURL、Key、模型映射等信息

8. **记录亲和性**
   - 请求成功后，记录渠道亲和性

**上下文变量**：

| 变量 | 类型 | 说明 |
|------|------|------|
| `channel_id` | int | 渠道 ID |
| `channel_name` | string | 渠道名称 |
| `channel_type` | int | 渠道类型 |
| `channel_base_url` | string | 渠道 BaseURL |
| `channel_key` | string | 渠道 API Key |
| `channel_model_mapping` | map | 模型映射 |
| `channel_param_override` | map | 参数覆盖 |
| `channel_header_override` | map | 请求头覆盖 |
| `original_model` | string | 原始模型名 |

### RateLimit — 限流

**文件**：`middleware/rate-limit.go`

**职责**：基于 IP 或用户 ID 的请求限流。

**限流类型**：

| 类型 | 函数 | 说明 |
|------|------|------|
| 全局 API | `GlobalAPIRateLimit()` | 所有 API 请求 |
| 全局 Web | `GlobalWebRateLimit()` | Web 页面请求 |
| 敏感操作 | `CriticalRateLimit()` | 登录、注册等 |
| 搜索 | `SearchRateLimit()` | 搜索接口 |
| 下载 | `DownloadRateLimit()` | 文件下载 |
| 上传 | `UploadRateLimit()` | 文件上传 |
| 模型请求 | `ModelRequestRateLimit()` | 按模型限流 |

**实现方式**：

- **Redis 模式**：使用 Redis List 实现滑动窗口限流
- **内存模式**：使用内存 Map 实现限流（无需 Redis）

**限流算法**：

```go
// 滑动窗口算法
func redisRateLimiter(c *gin.Context, maxRequestNum int, duration int64, mark string) {
    key := "rateLimit:" + mark + c.ClientIP()
    // 1. 获取当前窗口的请求列表长度
    // 2. 如果未满，添加当前时间戳
    // 3. 如果已满，检查最早的时间戳
    // 4. 如果在窗口内，返回 429
    // 5. 如果在窗口外，移除最早的时间戳，添加当前时间戳
}
```

### SystemPerformanceCheck — 性能检查

**文件**：`middleware/performance.go`

**职责**：在系统负载过高时拒绝新请求，保护系统稳定性。

### BodyStorageCleanup — 请求体清理

**文件**：`middleware/body_cleanup.go`

**职责**：请求处理完成后清理临时存储的请求体，释放内存。

### RequestId — 请求 ID

**文件**：`middleware/request-id.go`

**职责**：为每个请求分配唯一 ID，用于日志追踪。

### I18n — 国际化

**文件**：`middleware/i18n.go`

**职责**：检测客户端语言偏好，设置到上下文，用于响应消息的国际化。

**语言检测顺序**：
1. `Accept-Language` 头
2. 查询参数 `lang`
3. 用户设置的语言
4. 默认语言（中文）

### CORS — 跨域资源共享

**文件**：`middleware/cors.go`

**职责**：处理跨域请求，设置 CORS 响应头。

**配置**：
- 允许所有来源
- 允许的请求方法：GET, POST, PUT, DELETE, OPTIONS
- 允许的请求头：Authorization, Content-Type 等

### StatsMiddleware — 请求统计

**文件**：`middleware/stats.go`

**职责**：记录请求的处理时间和状态，用于性能监控。

### Logger — 日志记录

**文件**：`middleware/logger.go`

**职责**：记录请求的详细信息，包括方法、路径、状态码、耗时等。

## 自定义中间件

### 添加新中间件

在 `middleware/` 目录创建新文件：

```go
package middleware

import "github.com/gin-gonic/gin"

func MyCustomMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        // 前置处理
        // ...

        c.Next()

        // 后置处理
        // ...
    }
}
```

### 注册中间件

在路由文件中注册：

```go
// router/relay-router.go
relayV1Router := router.Group("/v1")
relayV1Router.Use(middleware.MyCustomMiddleware())
```

## 中间件与上下文

中间件通过 Gin 的上下文（`*gin.Context`）传递信息。SynthAPI 使用 `common.SetContextKey` 和 `common.GetContextKey` 封装了上下文操作：

```go
// 设置
common.SetContextKey(c, constant.ContextKeyChannelId, channel.Id)

// 获取
channelId := common.GetContextKeyString(c, constant.ContextKeyChannelId)
```

### 常用上下文键

定义在 `constant/context_key.go` 中：

| 键 | 说明 |
|----|------|
| `ContextKeyChannelId` | 渠道 ID |
| `ContextKeyChannelType` | 渠道类型 |
| `ContextKeyChannelKey` | 渠道 API Key |
| `ContextKeyChannelBaseUrl` | 渠道 BaseURL |
| `ContextKeyUsingGroup` | 当前使用的分组 |
| `ContextKeyTokenGroup` | Token 分组 |
| `ContextKeyUserGroup` | 用户分组 |
| `ContextKeyRequestStartTime` | 请求开始时间 |
| `ContextKeyChannelModelMapping` | 模型映射 |
| `ContextKeyChannelParamOverride` | 参数覆盖 |
