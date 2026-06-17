# 版本变更

> **摘要**：本文档基于 Git 历史整理 SynthAPI（new-api）的主要版本变更，记录重要功能的添加、修改和修复。

## 版本命名规则

- **主版本号**：重大架构变更或不兼容更新
- **次版本号**：新功能添加
- **修订号**：Bug 修复和小改进

## 近期更新

### 2026 年 6 月

**新功能**：
- 智能分组（Smart Group）功能
- 渠道亲和性模板
- 订阅套餐系统增强
- Waffo Pancake 支付集成
- 渠道上游模型自动更新检测
- 性能指标 API

**改进**：
- 渠道选择算法优化
- 计费会话管理改进
- 前端 UI 优化

**修复**：
- 渠道缓存一致性问题
- 限流计数器重置问题

### 2026 年 5 月

**新功能**：
- OpenAI Responses API 支持
- Codex OAuth 集成
- 自定义 OAuth 提供商
- 视频生成任务支持

**改进**：
- 流式响应处理优化
- 错误处理增强
- 日志记录完善

### 2026 年 4 月

**新功能**：
- WebAuthn/Passkey 支持
- 双因素认证（2FA）
- 模型比率可视化编辑器
- 渠道批量操作

**改进**：
- 数据库迁移优化
- 前端响应式设计
- API 文档完善

### 2026 年 3 月

**新功能**：
- 智能分组（auto 分组增强）
- 跨分组重试
- 订阅套餐管理
- Stripe 支付集成

**改进**：
- 限流算法优化
- 渠道健康检查
- 用户界面改进

### 2026 年 2 月

**新功能**：
- Gemini API 原生支持
- Rerank API 支持
- 多语言支持（法语、日语、俄语、越南语）

**改进**：
- 请求格式转换优化
- 错误消息国际化
- 性能优化

### 2026 年 1 月

**新功能**：
- Realtime API 支持（WebSocket）
- 视频生成支持（Sora、Kling、Jimeng 等）
- Suno 音乐生成支持

**改进**：
- 任务系统优化
- 计费系统改进
- 安全性增强

## 历史重要版本

### v0.8.x

**新功能**：
- 完整的订阅套餐系统
- 多支付方式支持（Stripe、EPay、Creem）
- 渠道亲和性
- 智能分组

### v0.7.x

**新功能**：
- OpenAI Responses API
- Codex 集成
- 自定义 OAuth

### v0.6.x

**新功能**：
- WebAuthn/Passkey
- 2FA 支持
- 模型管理增强

### v0.5.x

**新功能**：
- Gemini 原生支持
- Rerank API
- 多语言支持

### v0.4.x

**新功能**：
- Realtime API
- 视频生成
- 任务系统

### v0.3.x

**新功能**：
- 智能分组
- 跨分组重试
- 计费优化

### v0.2.x

**新功能**：
- 多节点部署
- Redis 缓存
- 性能优化

### v0.1.x

**初始版本**：
- 基于 One API 的增强版
- 全新 UI 设计
- 多上游提供商支持

## 数据库迁移

SynthAPI 使用 GORM 的自动迁移功能，每次启动时会自动检查并执行数据库迁移。

### 迁移的表

- channels
- tokens
- users
- passkey_credentials
- options
- redemptions
- abilities
- logs
- midjourney
- top_ups
- quota_data
- tasks
- models
- vendors
- prefill_groups
- setups
- two_fa
- two_fa_backup_codes
- checkins
- subscription_orders
- user_subscriptions
- subscription_pre_consume_records
- custom_oauth_providers
- user_oauth_bindings
- perf_metrics
- subscription_plans

### 迁移注意事项

1. 迁移是自动的，无需手动执行
2. 迁移是向后兼容的，不会丢失数据
3. 建议在升级前备份数据库

## 升级指南

### 从 One API 迁移

SynthAPI 完全兼容 One API 的数据库，可以直接升级：

1. 备份 One API 数据库
2. 停止 One API 服务
3. 启动 SynthAPI 服务（指向同一个数据库）
4. 系统会自动执行迁移

### 版本升级

1. 备份数据库
2. 停止当前服务
3. 更新二进制或镜像
4. 启动新版本服务
5. 检查日志确认迁移成功

## 已知问题

### SQLite 并发限制

SQLite 在高并发写入时可能性能下降。建议：
- 生产环境使用 PostgreSQL 或 MySQL
- 启用批量更新

### 内存使用

大量渠道和日志可能导致内存占用增加。建议：
- 定期清理日志
- 配置合理的缓存策略

## 路线图

### 计划功能

- 更多上游提供商支持
- 增强的分析功能
- API 版本管理
- 插件系统
- 更多支付方式

### 长期目标

- 成为最完善的 LLM 网关
- 支持所有主流 AI 提供商
- 提供企业级功能
- 建立活跃的社区生态
