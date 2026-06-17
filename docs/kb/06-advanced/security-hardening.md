# 安全加固

> **摘要**：SynthAPI 提供多层次的安全机制，包括 HTTPS、IP 白名单、2FA、Passkey、Turnstile 人机验证等。本文档提供安全加固的清单和最佳实践。

## 安全清单

### 基础安全

- [ ] 启用 HTTPS
- [ ] 修改默认密码
- [ ] 设置强 SESSION_SECRET
- [ ] 设置强 CRYPTO_SECRET
- [ ] 关闭调试模式

### 认证安全

- [ ] 启用 2FA（管理员）
- [ ] 配置 IP 白名单
- [ ] 启用 Turnstile 人机验证
- [ ] 设置合理的限流策略

### 数据安全

- [ ] 定期备份数据库
- [ ] 加密敏感数据
- [ ] 限制 API Key 权限

### 网络安全

- [ ] 配置防火墙
- [ ] 限制管理端口访问
- [ ] 使用 VPN 或内网访问管理后台

## HTTPS 配置

### Nginx 反向代理

```nginx
server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name api.example.com;
    return 301 https://$server_name$request_uri;
}
```

### Let's Encrypt

```bash
# 安装 certbot
apt install certbot python3-certbot-nginx

# 获取证书
certbot --nginx -d api.example.com

# 自动续期
certbot renew --dry-run
```

## 密钥安全

### SESSION_SECRET

```bash
# 生成随机密钥
openssl rand -base64 32

# 配置
SESSION_SECRET=your-random-secret-here
```

### CRYPTO_SECRET

```bash
# 生成随机密钥
openssl rand -base64 32

# 配置
CRYPTO_SECRET=your-crypto-secret-here
```

## 双因素认证 (2FA)

### 启用 2FA

1. 登录管理后台
2. 进入个人设置
3. 点击「启用 2FA」
4. 使用认证器扫描二维码
5. 输入验证码确认

### 推荐认证器

- Google Authenticator
- Authy
- Microsoft Authenticator

## WebAuthn/Passkey

### 注册 Passkey

1. 登录管理后台
2. 进入个人设置
3. 点击「注册 Passkey」
4. 按照浏览器提示完成注册

### 支持的设备

- 指纹识别器
- 面部识别（Face ID）
- 安全密钥（YubiKey）

## IP 白名单

### Token 级别白名单

在创建或编辑 Token 时配置：

```json
{
    "name": "my-token",
    "allow_ips": "192.168.1.0/24\n10.0.0.0/8"
}
```

### 系统级别白名单

通过防火墙限制管理端口访问：

```bash
# 只允许特定 IP 访问管理端口
iptables -A INPUT -p tcp --dport 3000 -s 192.168.1.0/24 -j ACCEPT
iptables -A INPUT -p tcp --dport 3000 -j DROP
```

## Turnstile 人机验证

### 配置

在系统设置中配置 Cloudflare Turnstile：

1. 注册 Cloudflare 账号
2. 创建 Turnstile 站点
3. 获取 Site Key 和 Secret Key
4. 在系统设置中配置

### 保护的接口

- 用户注册
- 用户登录
- 密码重置
- 邮箱验证
- 充值操作

## 限流安全

### 配置建议

```bash
# 敏感操作限流（更严格）
CRITICAL_RATE_LIMIT=10
CRITICAL_RATE_LIMIT_DURATION=3600

# 搜索限流
SEARCH_RATE_LIMIT=5
SEARCH_RATE_LIMIT_DURATION=60

# 全局 API 限流
GLOBAL_API_RATE_LIMIT=100
GLOBAL_API_RATE_LIMIT_DURATION=60
```

## 数据加密

### 数据库加密

使用 PostgreSQL 的透明数据加密（TDE）或 MySQL 的加密功能。

### 传输加密

- 使用 HTTPS
- 使用 TLS 1.2+
- 配置强密码套件

### 存储加密

- API Key 存储在数据库中
- 敏感配置使用环境变量
- 定期轮换密钥

## 审计日志

### 启用审计

```bash
ERROR_LOG_ENABLED=true
```

### 审计内容

- 用户登录/登出
- 配置变更
- Token 创建/删除
- 渠道变更
- 充值操作

### 日志保留

建议保留至少 90 天的日志：

```sql
-- 清理 90 天前的日志
DELETE FROM logs WHERE created_at < UNIX_TIMESTAMP(NOW() - INTERVAL 90 DAY);
```

## 安全更新

### 定期更新

```bash
# Docker 更新
docker-compose pull
docker-compose up -d

# 二进制更新
wget https://github.com/QuantumNous/new-api/releases/latest/download/synthapi-server
chmod +x synthapi-server
systemctl restart synthapi
```

### 关注安全公告

- GitHub Releases
- 官方文档
- 社区讨论

## 安全事件响应

### 发现异常

1. 检查日志
2. 分析请求模式
3. 识别攻击来源

### 应急措施

1. 临时禁用受影响的 Token
2. 限制来源 IP
3. 通知相关用户

### 事后分析

1. 分析攻击路径
2. 修复漏洞
3. 更新安全策略

## 安全最佳实践总结

1. **最小权限原则**：用户只拥有必要的权限
2. **纵深防御**：多层安全防护
3. **定期审计**：定期检查安全配置
4. **及时更新**：及时应用安全补丁
5. **监控告警**：对异常行为设置告警
6. **备份恢复**：定期备份并测试恢复
7. **安全培训**：对管理员进行安全培训
