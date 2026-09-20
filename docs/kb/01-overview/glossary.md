# 术语表

> **摘要**：本文档定义了 SynthAPI 项目中使用的核心术语，包括渠道、上游、中继、分组、Token、配额等概念，帮助快速理解系统架构和业务逻辑。

## 核心概念

### 渠道 (Channel)
渠道是 SynthAPI 连接上游 AI 提供商的配置单元。每个渠道包含：
- **类型**：上游提供商类型（OpenAI、Claude、Gemini 等）
- **Key**：上游 API Key（支持多 Key 轮询）
- **BaseURL**：上游 API 地址
- **模型列表**：该渠道支持的模型
- **权重**：负载均衡权重
- **优先级**：选择优先级（数值越小越优先）
- **分组**：所属分组（default、vip 等）

渠道定义在 `model/channel.go` 中，通过管理后台或 API 创建和管理。

### 上游 (Upstream)
上游指实际提供 AI 服务的第三方提供商，如 OpenAI、Anthropic、Google 等。SynthAPI 作为中间层，将客户端请求转发到上游，并将响应回传。

### 中继 (Relay)
中继是 SynthAPI 的核心转发机制。当客户端发送请求时，系统通过 Relay 层将请求格式转换为上游提供商的原生格式，转发后将响应转换回统一格式。

Relay 相关代码位于 `relay/` 目录，核心入口为 `relay/relay_adaptor.go`。

### 分组 (Group)
分组是 SynthAPI 的访问控制和计费隔离机制。每个用户和 Token 都属于一个分组，不同分组可以有不同的模型价格比率。

- **default**：默认分组
- **auto**：自动分组，系统根据用户分组自动选择最优渠道
- **vip**：VIP 分组，可配置更高优先级的渠道
- 自定义分组：管理员可创建任意分组名

### Token
Token 是用户访问 SynthAPI Relay 接口的凭证，格式为 `sk-xxxxxx`。每个 Token 包含：
- **配额**：可用的请求配额（按 Token 数量计）
- **过期时间**：Token 有效期
- **模型限制**：允许使用的模型列表
- **IP 白名单**：允许访问的 IP 地址
- **分组**：所属分组

Token 定义在 `model/token.go` 中。

### 配额 (Quota)
配额是 SynthAPI 的计费单位。系统将不同模型的 Token 用量统一转换为配额值进行扣费。配额的获取方式：
- 管理员充值
- 兑换码兑换
- 邀请奖励
- 订阅套餐

### 用户 (User)
用户是 SynthAPI 管理后台的账户。用户角色包括：
- **普通用户**（Role = 1）：管理自己的 Token 和配额
- **管理员**（Role = 10）：管理渠道、用户、系统配置
- **超级管理员**（Role = 100）：最高权限，可修改系统选项

用户定义在 `model/user.go` 中。

## 适配器相关

### Adaptor（适配器）
适配器是 Relay 层的核心组件，每种上游提供商类型对应一个适配器。适配器负责：
- 将统一请求格式转换为上游原生格式
- 构造上游请求 URL 和 Headers
- 发送请求到上游
- 将上游响应转换回统一格式

适配器接口定义在 `relay/channel/adapter.go` 中。

### API Type（API 类型）
API 类型标识上游提供商的接口协议。定义在 `constant/api_type.go` 中，包括：
- `APITypeOpenAI` (0) — OpenAI 兼容格式
- `APITypeAnthropic` (1) — Claude Messages 格式
- `APITypeGemini` (9) — Google Gemini 格式
- 等 35+ 种类型

### Channel Type（渠道类型）
渠道类型标识具体的上游服务。定义在 `constant/channel.go` 中，包括：
- `ChannelTypeOpenAI` (1) — OpenAI 官方
- `ChannelTypeAzure` (3) — Azure OpenAI
- `ChannelTypeAnthropic` (14) — Anthropic Claude
- 等 57+ 种类型

### Relay Format（中继格式）
中继格式标识客户端请求的 API 格式。定义在 `types/relay_format.go` 中：
- `RelayFormatOpenAI` — OpenAI Chat Completions
- `RelayFormatClaude` — Claude Messages
- `RelayFormatGemini` — Gemini GenerateContent
- `RelayFormatOpenAIResponses` — OpenAI Responses
- `RelayFormatEmbedding` — Embedding
- `RelayFormatOpenAIAudio` — Audio

## 计费相关

### 比率 (Ratio)
比率用于将不同模型的 Token 用量统一转换为配额值。例如：
- GPT-4o 的比率为 1，表示 1 Token = 1 配额
- GPT-3.5-turbo 的比率为 0.25，表示 1 Token = 0.25 配额

比率配置位于 `setting/ratio_setting/` 目录。

### 分组比率 (Group Ratio)
不同分组可以有不同的模型价格比率。例如 VIP 分组的 GPT-4o 比率为 0.8，表示 VIP 用户使用 GPT-4o 更便宜。

### 计费会话 (Billing Session)
计费会话管理一次请求的完整计费生命周期：预扣费 → 实际结算 → 差额退还/补扣。

定义在 `service/billing_session.go` 中。

### 预扣费 (Pre-consume)
在请求转发前，系统根据估算的 Token 用量预先扣除配额。如果预扣失败，请求会被拒绝。

### 结算 (Settle)
请求完成后，系统根据实际 Token 用量结算差额。如果实际用量少于预扣，退还差额；如果多于预扣，补扣差额。

## 智能路由相关

### 渠道亲和性 (Channel Affinity)
渠道亲和性是一种优化机制，将特定用户的请求优先路由到之前成功响应的渠道，减少试错成本。

定义在 `service/channel_affinity.go` 中。

### 智能分组 (Smart Group)
智能分组是一种高级分组机制，可以将多个基础分组组合成一个逻辑分组，实现更灵活的路由策略。

定义在 `setting/smart_group.go` 中。

### 跨分组重试 (CrossGroupRetry)
当 Token 使用 auto 分组时，如果某个分组的渠道全部不可用，系统会自动尝试其他分组的渠道。

## 任务相关

### 异步任务 (Task)
异步任务用于处理耗时操作，如视频生成、音乐生成等。任务提交后返回任务 ID，客户端通过轮询查询任务状态。

定义在 `model/task.go` 中。

### TaskAdaptor（任务适配器）
任务适配器是处理异步任务的组件，负责任务的提交、状态查询和结果解析。

接口定义在 `relay/channel/adapter.go` 中。

## 中间件相关

### Distribute（分发）
分发中间件是 Relay 请求处理的核心，负责：
1. 从请求中提取模型名称
2. 验证 Token 的模型访问权限
3. 选择合适的上游渠道
4. 设置渠道信息到请求上下文

定义在 `middleware/distributor.go` 中。

### TokenAuth（Token 认证）
Token 认证中间件验证 API Key 的有效性，包括：
- 解析 `Authorization: Bearer sk-xxx` 头
- 验证 Token 存在且未过期
- 检查 Token 状态和配额
- 验证 IP 白名单
- 设置用户和 Token 信息到上下文

定义在 `middleware/auth.go` 中。

## 部署相关

### 主节点 (Master Node)
主节点是 SynthAPI 集群中的管理节点，负责数据库迁移、定时任务执行等。通过 `NODE_TYPE` 环境变量控制，默认为主节点。

### 从节点 (Slave Node)
从节点仅处理请求转发，不执行管理任务。适用于多节点部署场景。

### Session Secret
Session Secret 用于加密管理后台的 Session Cookie。多节点部署时必须设置相同的 Session Secret。

### Crypto Secret
Crypto Secret 用于加密存储在 Redis 中的敏感数据。多节点共享 Redis 时必须设置相同的 Crypto Secret。
