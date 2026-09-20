# 系统架构

> **摘要**：SynthAPI 采用分层架构（Router → Controller → Service → Model），前后端分离，后端使用 Go + Gin + GORM，前端使用 React 19 + Rsbuild。核心数据流为：客户端请求 → 路由匹配 → 中间件处理 → 渠道分发 → 上游转发 → 响应转换 → 计费结算。

## 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                      客户端层                            │
│  OpenAI SDK / curl / 前端 Dashboard / 第三方客户端       │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                    接入层 (Gin Router)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ 管理 API  │  │ Relay API│  │ Web 前端  │              │
│  │ /api/*   │  │ /v1/*    │  │ /*       │              │
│  └──────────┘  └──────────┘  └──────────┘              │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   中间件层 (Middleware)                    │
│  认证 → 限流 → 人机验证 → 渠道分发 → 日志 → 性能检查     │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   控制器层 (Controller)                    │
│  请求解析 → 参数校验 → 调用 Service → 返回响应            │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   服务层 (Service)                        │
│  计费会话 → Token 估算 → 配额预扣 → 转发 → 结算          │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                  Relay 适配层 (Relay Adaptor)             │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐           │
│  │ OpenAI │ │ Claude │ │ Gemini │ │  AWS   │  ...      │
│  └────────┘ └────────┘ └────────┘ └────────┘           │
│  请求格式转换 → 上游调用 → 响应格式转换                   │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   数据层 (Model)                          │
│  GORM ORM → SQLite / MySQL / PostgreSQL                  │
│  Redis 缓存 → 渠道缓存 / 用户缓存 / 配额缓存             │
└─────────────────────────────────────────────────────────┘
```

## 核心组件

### 1. 路由层 (Router)

路由层负责将不同的 URL 路径分发到对应的处理器。系统运行两个独立的 HTTP 服务：

- **Admin 服务**（默认端口 3000）：包含管理 API、Relay API 和 Web 前端
- **Public 服务**（默认端口 80）：仅暴露有限的公开接口（Dashboard、定价等）

路由文件位于 `router/` 目录：

| 文件 | 职责 |
|------|------|
| `main.go` | 路由总入口，设置 API/Dashboard/Relay/Web 四组路由 |
| `api-router.go` | 管理 API 路由（用户、渠道、Token、日志、配置等） |
| `relay-router.go` | Relay 转发路由（Chat、Image、Audio、Embedding 等） |
| `dashboard.go` | Dashboard 数据接口 |
| `video-router.go` | 视频任务路由 |
| `web-router.go` | 前端静态文件服务 |

### 2. 中间件层 (Middleware)

中间件按顺序执行，形成请求处理管道：

```
请求进入 → RequestId → PoweredBy → I18n → Logger → CORS
         → TokenAuth/UserAuth → RateLimit → Distribute → Controller
```

核心中间件：

| 中间件 | 文件 | 职责 |
|--------|------|------|
| `TokenAuth` | `auth.go` | API Key 认证，解析 `Authorization: Bearer sk-xxx` |
| `UserAuth` | `auth.go` | 管理后台 Session 认证 |
| `AdminAuth` | `auth.go` | 管理员权限校验 |
| `RootAuth` | `auth.go` | 超级管理员权限校验 |
| `Distribute` | `distributor.go` | 渠道选择与分发（核心） |
| `RateLimit` | `rate-limit.go` | IP/用户级限流 |
| `CORS` | `cors.go` | 跨域资源共享 |
| `RequestId` | `request-id.go` | 请求唯一标识 |
| `I18n` | `i18n.go` | 国际化语言检测 |
| `StatsMiddleware` | `stats.go` | 请求统计 |

### 3. 控制器层 (Controller)

控制器层负责 HTTP 请求的解析、校验和响应。位于 `controller/` 目录，按功能模块组织：

- `relay.go` — Relay 转发主入口
- `channel.go` — 渠道管理（CRUD、测试、余额查询）
- `token.go` — Token 管理
- `user.go` — 用户管理
- `option.go` — 系统配置
- `log.go` — 日志查询
- `billing.go` — 计费相关
- `subscription.go` — 订阅管理

### 4. 服务层 (Service)

服务层封装核心业务逻辑，位于 `service/` 目录：

- `channel_select.go` — 渠道选择算法（随机、加权、优先级）
- `billing.go` / `billing_session.go` — 计费会话管理
- `pre_consume_quota.go` — 配额预扣
- `text_quota.go` — 文本 Token 计费
- `image.go` / `audio.go` — 图像/音频计费
- `token_counter.go` — Token 计数器
- `convert.go` — 请求格式转换
- `channel_affinity.go` — 渠道亲和性

### 5. Relay 适配层 (Relay)

Relay 层是 SynthAPI 的核心，负责将统一的请求格式转换为各上游提供商的原生格式，并将响应转换回来。

适配器工厂位于 `relay/relay_adaptor.go`，根据渠道类型创建对应的适配器：

```go
func GetAdaptor(apiType int) channel.Adaptor {
    switch apiType {
    case constant.APITypeOpenAI:
        return &openai.Adaptor{}
    case constant.APITypeAnthropic:
        return &claude.Adaptor{}
    case constant.APITypeGemini:
        return &gemini.Adaptor{}
    // ... 30+ 适配器
    }
}
```

每个适配器实现 `channel.Adaptor` 接口：

```go
type Adaptor interface {
    Init(info *RelayInfo)
    GetRequestURL(info *RelayInfo) (string, error)
    SetupRequestHeader(c *gin.Context, req *http.Header, info *RelayInfo) error
    ConvertOpenAIRequest(c *gin.Context, info *RelayInfo, request *dto.GeneralOpenAIRequest) (any, error)
    DoRequest(c *gin.Context, info *RelayInfo, requestBody io.Reader) (any, error)
    DoResponse(c *gin.Context, resp *http.Response, info *RelayInfo) (usage any, err *types.NewAPIError)
    GetModelList() []string
    GetChannelName() string
    // ... 其他格式转换方法
}
```

### 6. 数据模型层 (Model)

数据模型层使用 GORM ORM，位于 `model/` 目录。核心模型：

| 模型 | 说明 |
|------|------|
| `Channel` | 上游渠道配置（类型、Key、BaseURL、模型列表、权重、优先级） |
| `Token` | 用户 API Token（配额、过期时间、模型限制、IP 白名单） |
| `User` | 用户账户（角色、状态、配额、分组） |
| `Log` | 请求日志（模型、Token 用量、耗时、状态码） |
| `Ability` | 模型-渠道能力映射（哪个渠道支持哪些模型） |
| `Redemption` | 兑换码 |
| `TopUp` | 充值记录 |
| `SubscriptionPlan` | 订阅套餐 |
| `UserSubscription` | 用户订阅 |
| `Task` | 异步任务（视频生成等） |
| `Midjourney` | Midjourney 任务 |

### 7. 配置管理 (Setting)

配置管理位于 `setting/` 目录，按功能模块组织：

- `ratio_setting/` — 模型价格比率配置
- `operation_setting/` — 运营配置
- `system_setting/` — 系统配置
- `billing_setting/` — 计费配置
- `model_setting/` — 模型配置
- `performance_setting/` — 性能配置
- `smart_group.go` — 智能分组配置

## 数据流

### 请求转发流程

```
1. 客户端发送请求到 /v1/chat/completions
2. TokenAuth 中间件验证 API Key
3. Distribute 中间件选择合适的上游渠道
4. Controller 解析请求参数
5. Service 层创建计费会话，预扣配额
6. Relay Adaptor 将请求转换为上游格式
7. 转发请求到上游提供商
8. 接收上游响应，转换为统一格式
9. 计算实际 Token 用量，结算差额
10. 返回响应给客户端
```

### 渠道选择流程

```
1. 从请求中提取模型名称和分组
2. 检查 Token 的模型限制
3. 检查渠道亲和性缓存
4. 按分组 → 优先级 → 权重 选择渠道
5. 如果 auto 分组，遍历所有可用分组
6. 支持跨分组重试（CrossGroupRetry）
7. 记录选中的渠道信息到上下文
```

## 双端口架构

SynthAPI 支持双端口部署：

- **Admin 端口**（`PORT` / `ADMIN_PORT`，默认 3000）：完整功能，包含管理后台和 Relay API
- **Public 端口**（`PUBLIC_PORT`，默认 80）：仅暴露 Dashboard、定价、模型列表等公开接口

Public 端口通过 `publicExposureGuard` 中间件拦截管理类请求，返回 404。

## 前端架构

前端位于 `web/` 目录，包含两套主题：

| 主题 | 技术栈 | 说明 |
|------|--------|------|
| `default` | React 19 + Rsbuild + Base UI + Tailwind CSS | 默认主题，现代 UI |
| `classic` | React 18 + Vite + Semi Design | 经典主题 |

前端使用 `//go:embed` 指令嵌入到 Go 二进制文件中，无需单独部署。

前端功能模块（`web/default/src/features/`）：
- `auth/` — 登录注册
- `channels/` — 渠道管理
- `keys/` — API Key 管理
- `models/` — 模型管理
- `dashboard/` — 数据看板
- `playground/` — API 调试台
- `pricing/` — 定价展示
- `subscriptions/` — 订阅管理
- `system-settings/` — 系统设置
- `wallet/` — 钱包与充值
