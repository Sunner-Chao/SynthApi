# 典型场景案例

> **摘要**：SynthAPI 适用于多种场景，包括个人开发者统一管理 API、企业内部 AI 平台、API 服务商、应用集成等。本文档介绍典型的使用场景和配置方案。

## 场景一：个人开发者

### 需求

- 统一管理多个 AI API Key
- 通过一个端点访问所有模型
- 记录使用情况

### 配置

```bash
# 最简部署
docker run --name synthapi -d --restart always \
  -p 3000:3000 \
  -e TZ=Asia/Shanghai \
  -v ./data:/data \
  calciumion/new-api:latest
```

### 使用流程

1. 登录管理后台
2. 添加渠道（OpenAI、Claude、Gemini 等）
3. 创建 Token
4. 在客户端中使用 Token

### 优势

- 统一 API 入口
- 自动故障转移
- 使用统计

## 场景二：企业内部 AI 平台

### 需求

- 为团队成员分配配额
- 统一计费和审计
- 权限管理
- 模型访问控制

### 架构

```
┌─────────────────────────────────────┐
│           企业内部用户               │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│         SynthAPI 网关               │
│  - 用户管理                         │
│  - 配额管理                         │
│  - 权限控制                         │
│  - 审计日志                         │
└──────────────────┬──────────────────┘
                   │
    ┌──────────────┼──────────────┐
    │              │              │
    ▼              ▼              ▼
┌──────┐      ┌──────┐      ┌──────┐
│OpenAI│      │Claude│      │Gemini│
└──────┘      └──────┘      └──────┘
```

### 配置

```yaml
# docker-compose.yml
services:
  new-api:
    image: calciumion/new-api:latest
    environment:
      - SQL_DSN=postgresql://root:pass@postgres:5432/new-api
      - REDIS_CONN_STRING=redis://:pass@redis:6379
      - SESSION_SECRET=enterprise-secret
      - CRYPTO_SECRET=enterprise-crypto-secret
    depends_on:
      - postgres
      - redis
```

### 使用流程

1. 创建部门分组（研发、产品、市场等）
2. 为每个分组配置可用模型
3. 为用户分配分组和配额
4. 创建 Token 并分发给用户
5. 监控使用情况

### 优势

- 成本可控
- 权限清晰
- 审计完整

## 场景三：API 服务商

### 需求

- 对外提供 AI API 转售服务
- 多级代理
- 灵活的计费策略
- 高可用

### 架构

```
┌─────────────────────────────────────┐
│           终端用户                   │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│         SynthAPI (Public)           │
│  - 用户注册                         │
│  - Token 管理                       │
│  - 充值系统                         │
│  - 定价策略                         │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│         SynthAPI (Admin)            │
│  - 渠道管理                         │
│  - 成本控制                         │
│  - 监控告警                         │
└──────────────────┬──────────────────┘
                   │
    ┌──────────────┼──────────────┐
    │              │              │
    ▼              ▼              ▼
┌──────┐      ┌──────┐      ┌──────┐
│上游1 │      │上游2 │      │上游3 │
└──────┘      └──────┘      └──────┘
```

### 配置要点

```bash
# 双端口部署
PORT=3000          # 管理端口（内网）
PUBLIC_PORT=80     # 公开端口（外网）

# 支付集成
STRIPE_API_KEY=sk_live_xxx
EPAY_URL=https://pay.example.com
```

### 使用流程

1. 配置多个上游渠道
2. 设置定价比率
3. 启用用户注册
4. 配置支付方式
5. 启用公开端口
6. 推广服务

### 优势

- 稳定可靠
- 成本可控
- 灵活定价

## 场景四：应用集成

### 需求

- 为应用提供统一的 AI 接口
- 屏蔽底层提供商差异
- 成本监控

### 集成方式

```python
from openai import OpenAI

# 应用配置
client = OpenAI(
    api_key="sk-app-token",
    base_url="https://api.example.com/v1"
)

# 使用
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

### 优势

- 统一接口
- 自动故障转移
- 成本追踪

## 场景五：多模型对比

### 需求

- 对比不同模型的效果
- A/B 测试
- 成本效益分析

### 配置

```json
// Playground 请求
{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}],
    "group": "auto"
}
```

### 使用流程

1. 在 Playground 中选择不同模型
2. 对比响应质量
3. 查看成本统计
4. 选择最优模型

## 场景六：开发测试环境

### 需求

- 模拟上游 API
- 测试不同提供商
- 成本控制

### 配置

```bash
# 使用本地 Ollama
docker run -d --name ollama ollama/ollama

# 在 SynthAPI 中配置 Ollama 渠道
{
    "name": "Local Ollama",
    "type": 4,
    "base_url": "http://ollama:11434",
    "models": "llama3,mistral"
}
```

### 优势

- 本地测试
- 零成本
- 快速迭代

## 场景七：教育场景

### 需求

- 为学生提供 AI 访问
- 控制使用量
- 审计使用情况

### 配置

```bash
# 创建学生分组
{
    "name": "students",
    "models": "gpt-3.5-turbo",
    "quota": 100000
}
```

### 使用流程

1. 创建学生账户
2. 分配配额
3. 限制可用模型
4. 监控使用情况

## 最佳实践总结

1. **明确需求**：根据实际需求选择合适的部署方案
2. **合理规划**：设计好分组、配额、权限结构
3. **监控告警**：设置关键指标的告警
4. **定期优化**：根据使用情况优化配置
5. **备份恢复**：定期备份数据并测试恢复
