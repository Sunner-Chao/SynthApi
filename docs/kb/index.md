# SynthAPI 知识库

> **摘要**：本知识库是 SynthAPI（基于 new-api 项目）的完整技术文档，用于支撑 RAG 智能问答系统。涵盖项目概览、快速入门、核心概念、API 参考、运维指南、高级主题、社区生态及变更记录。

## 知识库导航

### 01 - 项目概览
- [什么是 SynthAPI](./01-overview/what-is-synthapi.md) — 项目定位、解决的问题、核心价值
- [系统架构](./01-overview/architecture.md) — 组件关系、数据流、技术栈
- [术语表](./01-overview/glossary.md) — 核心术语定义（渠道、上游、中继、分组等）

### 02 - 快速入门
- [5 分钟快速部署](./02-getting-started/quickstart.md) — Docker Compose 一键启动
- [详细安装指南](./02-getting-started/installation.md) — 二进制/Docker/K8s/宝塔面板
- [配置详解](./02-getting-started/configuration.md) — 环境变量与系统选项

### 03 - 核心概念
- [路由与转发](./03-core-concepts/routing.md) — 请求路由规则、Relay 路径匹配
- [中间件机制](./03-core-concepts/middleware.md) — 认证、限流、分发、日志等中间件
- [认证与鉴权](./03-core-concepts/auth.md) — API Key、JWT Session、OAuth、Passkey
- [限流策略](./03-core-concepts/rate-limiting.md) — IP 限流、用户限流、模型限流
- [请求/响应转换](./03-core-concepts/transformation.md) — OpenAI⇄Claude⇄Gemini 格式互转
- [服务发现与渠道选择](./03-core-concepts/service-discovery.md) — 渠道健康检查、智能分组、负载均衡

### 04 - API 参考
- [管理 API](./04-api-reference/admin-api.md) — 用户、渠道、Token、系统配置接口
- [代理转发 API](./04-api-reference/proxy-api.md) — Chat、Image、Audio、Embedding 等接口
- [图像生成 API](./04-api-reference/image-api.md) — APIMart 模型、真 4K 参数、参考图与异步任务轮询
- [SDK 与集成](./04-api-reference/sdk-libraries.md) — 官方/社区客户端与集成方案

### 05 - 运维与可观测性
- [本机部署与运维](./05-operations/local-deployment.md) — 项目实际路径、运维命令、调试方法
- [日志系统](./05-operations/logging.md) — 日志格式、级别、存储与轮转
- [监控指标](./05-operations/metrics.md) — Prometheus 指标、性能监控
- [分布式追踪](./05-operations/tracing.md) — Pyroscope 集成
- [故障排查](./05-operations/troubleshooting.md) — 常见问题与解决方案

### 06 - 高级主题
- [插件与适配器开发](./06-advanced/plugins.md) — 自定义渠道适配器开发指南
- [性能调优](./06-advanced/performance-tuning.md) — 连接池、缓存、批量更新优化
- [高可用部署](./06-advanced/high-availability.md) — 多节点部署、Redis 共享、会话同步
- [安全加固](./06-advanced/security-hardening.md) — TLS、IP 白名单、2FA、Passkey

### 07 - 社区与生态
- [同类项目对比](./07-community-and-ecosystem/comparison.md) — 与 Kong、APISIX、One API 对比
- [典型场景案例](./07-community-and-ecosystem/use-cases.md) — AI 模型路由、企业 API 管理
- [常见问题](./07-community-and-ecosystem/faq.md) — 高频社区问答

### 08 - 变更记录
- [版本变更](./08-changelog/changelog.md) — 基于 Git 历史整理的版本变更

---

## 使用说明

本知识库专为 RAG 系统优化：
- 每个文档开头包含 **2-3 句摘要**，便于 chunk 头部携带上下文
- 采用清晰的 **H2/H3 层级标题**，每个小节专注一个细分主题
- 关键概念、命令、代码片段用 **代码块标注**
- 文档间使用 **相对路径链接** 互相关联

## 项目基本信息

| 属性 | 值 |
|------|-----|
| 项目名称 | SynthAPI (基于 new-api) |
| 项目路径 | `/home/ubuntu/demo/SynthApi` |
| Go 模块路径 | `github.com/QuantumNous/new-api` |
| 技术栈 | Go 1.22+ / Gin / GORM v2 / React 19 / Rsbuild / Tailwind CSS |
| 数据库 | SQLite (默认) / MySQL ≥ 5.7.8 / PostgreSQL ≥ 9.6 |
| SQLite 路径 | `/home/ubuntu/demo/SynthApi/new-api.db` |
| 服务端口 | 3000 (管理) / 80 (公开) |
| 缓存 | Redis (go-redis) + 内存缓存 |
| 认证 | JWT Session / WebAuthn / OAuth (GitHub, Discord, OIDC, WeChat, Telegram) |
| 许可证 | MIT |
