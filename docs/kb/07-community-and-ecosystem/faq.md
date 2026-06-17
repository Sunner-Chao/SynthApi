# 常见问题

> **摘要**：本文档整理了 SynthAPI 社区中高频出现的问题和解答，涵盖部署、配置、使用、故障等方面。

## 部署相关

### Q: 如何部署 SynthAPI？

**A**: 推荐使用 Docker Compose：

```bash
git clone https://github.com/QuantumNous/new-api.git
cd new-api
docker-compose up -d
```

详见 [快速部署指南](../02-getting-started/quickstart.md)。

### Q: 支持哪些数据库？

**A**: 支持 SQLite、MySQL (≥ 5.7.8)、PostgreSQL (≥ 9.6)。默认使用 SQLite，生产环境推荐 PostgreSQL。

### Q: 必须使用 Redis 吗？

**A**: 不必须。Redis 用于分布式限流和多节点缓存同步。单机部署可以不使用 Redis。

### Q: 如何升级版本？

**A**:

```bash
# Docker
docker-compose pull
docker-compose up -d

# 二进制
wget https://github.com/QuantumNous/new-api/releases/latest/download/synthapi-server
chmod +x synthapi-server
systemctl restart synthapi
```

### Q: 数据会丢失吗？

**A**: 不会。数据存储在数据库中，只要数据库不丢失，数据就是安全的。建议定期备份数据库。

## 配置相关

### Q: 如何修改默认密码？

**A**: 登录管理后台（默认 root/123456），进入个人设置修改密码。

### Q: 如何配置 HTTPS？

**A**: 推荐使用 Nginx 反向代理配置 HTTPS。详见 [安全加固](../06-advanced/security-hardening.md)。

### Q: 如何配置多个上游渠道？

**A**: 在管理后台「渠道」页面添加多个渠道，系统会自动负载均衡。

### Q: 如何设置模型价格？

**A**: 在管理后台「系统设置」→「比率设置」中配置模型价格比率。

### Q: 如何限制用户可用的模型？

**A**: 两种方式：
1. 在 Token 中配置模型限制
2. 在分组中配置可用模型

## 使用相关

### Q: 如何获取 API Key？

**A**: 登录管理后台，进入「API 密钥」页面，点击「添加令牌」。

### Q: 如何使用 API？

**A**: 使用标准 OpenAI SDK，配置 Base URL 和 API Key：

```python
from openai import OpenAI
client = OpenAI(
    api_key="sk-your-token",
    base_url="http://your-domain:3000/v1"
)
```

### Q: 支持哪些模型？

**A**: 支持 40+ 提供商的模型，包括 OpenAI、Claude、Gemini、DeepSeek 等。详见管理后台的模型列表。

### Q: 如何查看使用量？

**A**: 在管理后台「日志」页面查看详细的使用记录。

### Q: 如何充值？

**A**: 在管理后台「钱包」页面充值，支持支付宝、微信、Stripe 等方式。

## 故障相关

### Q: 请求返回 401 错误？

**A**: 检查 API Key 是否正确，格式为 `Bearer sk-xxx`。

### Q: 请求返回 429 错误？

**A**: 请求过于频繁，等待一段时间后重试。可以在系统设置中调整限流参数。

### Q: 请求返回 500 错误？

**A**: 服务器内部错误，查看系统日志排查原因。

### Q: 请求返回 502 错误？

**A**: 上游服务错误，检查渠道状态和上游服务是否可用。

### Q: 渠道测试失败？

**A**: 检查：
1. API Key 是否有效
2. Base URL 是否正确
3. 网络是否连通
4. 上游服务是否可用

### Q: 流式响应中断？

**A**: 可能原因：
1. 上游超时（增加 STREAMING_TIMEOUT）
2. 网络不稳定
3. 上游服务异常

## 计费相关

### Q: Token 用量如何计算？

**A**: 系统将不同模型的 Token 用量统一转换为配额值。不同模型有不同的比率。

### Q: 如何查看消费明细？

**A**: 在管理后台「日志」页面查看每次请求的 Token 用量和配额消耗。

### Q: 配额不足怎么办？

**A**: 三种方式获取配额：
1. 管理员充值
2. 兑换码兑换
3. 订阅套餐

### Q: 支持哪些支付方式？

**A**: 支持支付宝、微信、Stripe、EPay、兑换码等。

## 安全相关

### Q: 如何启用 2FA？

**A**: 在个人设置中启用双因素认证，使用认证器扫描二维码。

### Q: 如何配置 IP 白名单？

**A**: 在创建或编辑 Token 时配置 IP 白名单。

### Q: 如何防止滥用？

**A**: 配置限流策略：
1. 全局限流
2. 用户限流
3. 模型限流
4. IP 限流

## 性能相关

### Q: 响应缓慢怎么办？

**A**: 检查：
1. 上游服务响应时间
2. 网络延迟
3. 服务器资源
4. 数据库性能

### Q: 如何提高性能？

**A**: 
1. 使用 Redis 缓存
2. 启用批量更新
3. 优化数据库索引
4. 增加服务器资源

## 社区相关

### Q: 如何获取帮助？

**A**:
1. 查看官方文档：https://docs.newapi.pro
2. 提交 GitHub Issue
3. 加入社区讨论

### Q: 如何贡献代码？

**A**:
1. Fork 仓库
2. 创建功能分支
3. 提交 Pull Request

### Q: 如何报告 Bug？

**A**: 在 GitHub Issues 中提交，包含：
1. 错误信息
2. 复现步骤
3. 系统环境
4. 配置信息（脱敏）
