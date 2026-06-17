# 什么是 SynthAPI

> **摘要**：SynthAPI 是一个基于 new-api 项目的下一代 LLM 网关和 AI 资产管理系统，聚合 40+ 上游 AI 提供商，提供统一 API 入口、智能路由、计费管理、用户权限控制等能力。

## 项目定位

SynthAPI 是一个 **AI API 网关/中继/转发** 系统，核心定位是：

1. **统一 API 入口**：将 OpenAI、Claude、Gemini、Azure、AWS Bedrock 等 40+ 上游 AI 提供商的接口统一为 OpenAI 兼容格式
2. **AI 资产管理**：提供用户管理、Token 配额、计费结算、订阅套餐等完整的商业化能力
3. **智能路由**：基于渠道健康状态、权重、优先级、分组的智能请求分发
4. **企业级运维**：多节点部署、监控告警、日志审计、安全加固

## 解决的核心问题

### 1. 多模型接入碎片化
不同 AI 提供商的 API 格式各异（OpenAI Chat Completions、Claude Messages、Gemini GenerateContent），SynthAPI 提供统一的 OpenAI 兼容接口，客户端只需对接一套 API。

### 2. API Key 管理混乱
企业内部多人使用多个 AI 服务时，API Key 分散管理困难。SynthAPI 通过「渠道 → Token → 用户」三层架构，实现 Key 的集中管理和按需分配。

### 3. 成本控制缺失
各提供商计费方式不同，难以统一核算。SynthAPI 提供基于 Token 的统一计费体系，支持按次计费、阶梯定价、订阅套餐等多种模式。

### 4. 高可用保障
单个 API Key 或渠道故障时，SynthAPI 自动重试其他可用渠道，保证服务连续性。

## 核心特性

### API 格式支持
- OpenAI Chat Completions（`/v1/chat/completions`）
- OpenAI Responses（`/v1/responses`）
- OpenAI Realtime（`/v1/realtime`，WebSocket）
- Claude Messages（`/v1/messages`）
- Google Gemini（`/v1beta/models/*`）
- 图像生成（`/v1/images/generations`）
- 音频转写/合成（`/v1/audio/*`）
- Embedding（`/v1/embeddings`）
- Rerank（`/v1/rerank`）
- 视频生成（异步任务）

### 格式自动转换
- OpenAI 兼容 ⇄ Claude Messages
- OpenAI 兼容 → Google Gemini
- Google Gemini → OpenAI 兼容（文本）
- OpenAI 兼容 ⇄ OpenAI Responses

### 上游提供商支持（40+）

| 类别 | 提供商 |
|------|--------|
| 国际 | OpenAI, Anthropic (Claude), Google (Gemini), AWS Bedrock, Mistral, Cohere, Perplexity, xAI, Replicate |
| 国内 | 百度文心, 阿里通义, 智谱GLM, 讯飞星火, 腾讯混元, DeepSeek, Moonshot, MiniMax, 字节豆包, 阶跃星辰 |
| 平台 | Azure OpenAI, Google Vertex AI, OpenRouter, SiliconFlow, Cloudflare Workers AI, Ollama |
| 特殊 | Midjourney (Proxy), Suno (音乐), Dify (工作流), Codex |

### 计费与配额
- 内部充值与配额分配（EPay, Stripe, Creem, Waffo）
- 组织级按次/按量/缓存命中计费
- 订阅套餐管理（周期性额度重置）
- 多币种支持

### 安全与认证
- API Key（`sk-` 前缀格式）
- JWT Session（管理后台）
- OAuth 登录（GitHub, Discord, OIDC, LinuxDo, WeChat, Telegram）
- WebAuthn/Passkey
- 双因素认证（2FA/TOTP）
- IP 白名单
- Turnstile 人机验证

### 智能路由
- 渠道加权随机选择
- 优先级分级
- 自动故障重试
- 跨分组重试（auto 分组）
- 渠道亲和性（Channel Affinity）
- 智能分组（Smart Group）

## 项目历史

SynthAPI 基于 [new-api](https://github.com/QuantumNous/new-api) 项目，而 new-api 又是从 [One API](https://github.com/songquanpeng/one-api) 演进而来。One API 是最早的 LLM 网关项目之一，new-api 在其基础上大幅扩展了功能，包括：

- 全新的 UI 设计
- 多语言支持（中/英/法/日/俄/越）
- 更多上游提供商支持
- 订阅套餐系统
- 视频生成任务支持
- OpenAI Responses 格式支持
- 智能分组与渠道亲和性

## 适用场景

1. **个人开发者**：统一管理多个 AI API Key，通过一个端点访问所有模型
2. **企业内部**：为团队成员分配配额，统一计费和审计
3. **API 服务商**：对外提供 AI API 转售服务，支持多级代理
4. **应用集成**：为应用提供统一的 AI 接口层，屏蔽底层提供商差异
