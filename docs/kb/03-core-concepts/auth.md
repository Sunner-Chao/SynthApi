# 认证与鉴权

> **摘要**：SynthAPI 支持多种认证方式，包括 API Key（Relay 接口）、JWT Session（管理后台）、OAuth（第三方登录）、WebAuthn/Passkey、双因素认证（2FA）等。认证通过中间件实现，不同路由使用不同的认证策略。

## 认证架构

```
┌─────────────────────────────────────────────────┐
│                  请求入口                         │
└──────────────────────┬──────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
         ▼             ▼             ▼
    ┌─────────┐  ┌──────────┐  ┌──────────┐
    │ TokenAuth│  │ UserAuth │  │ AdminAuth│
    │ (Relay)  │  │ (管理)   │  │ (管理)   │
    └────┬────┘  └────┬─────┘  └────┬─────┘
         │            │             │
         ▼            ▼             ▼
    API Key       Session        Session
    验证          验证           + 角色检查
```

## API Key 认证 (TokenAuth)

API Key 认证用于 Relay 接口（`/v1/*`），是最常用的认证方式。

### Key 格式

```
sk-{token_key}-{optional_parts}
```

- `sk-`：固定前缀
- `{token_key}`：Token 的唯一标识（32 位随机字符串）
- `{optional_parts}`：可选部分，如指定渠道 ID

### 请求方式

```bash
# 标准格式
curl -H "Authorization: Bearer sk-your-token-key" \
     https://api.example.com/v1/chat/completions

# 也可以不带 Bearer 前缀（自动识别）
curl -H "Authorization: sk-your-token-key" \
     https://api.example.com/v1/chat/completions
```

### 验证流程

1. **提取 Key**
   ```go
   key := c.Request.Header.Get("Authorization")
   key = strings.TrimPrefix(key, "Bearer ")
   key = strings.TrimPrefix(key, "sk-")
   parts := strings.Split(key, "-")
   key = parts[0]
   ```

2. **验证 Token**
   ```go
   token, err := model.ValidateUserToken(key)
   // 检查：Token 存在、未过期、状态正常、有配额
   ```

3. **检查 IP 白名单**
   ```go
   if len(token.GetIpLimits()) > 0 {
       clientIp := c.ClientIP()
       if !common.IsIpInCIDRList(ip, allowIps) {
           return 403
       }
   }
   ```

4. **检查用户状态**
   ```go
   userCache := model.GetUserCache(token.UserId)
   if userCache.Status != common.UserStatusEnabled {
       return 403
   }
   ```

5. **设置上下文**
   ```go
   c.Set("id", token.UserId)
   c.Set("token_id", token.Id)
   c.Set("token_quota", token.RemainQuota)
   // ...
   ```

### 特殊格式支持

**Anthropic Claude 格式**：
```bash
curl -H "x-api-key: sk-your-token-key" \
     -H "anthropic-version: 2023-06-01" \
     https://api.example.com/v1/messages
```

**Google Gemini 格式**：
```bash
# 查询参数
curl "https://api.example.com/v1beta/models?key=sk-your-token-key"

# 请求头
curl -H "x-goog-api-key: sk-your-token-key" \
     https://api.example.com/v1beta/models
```

**WebSocket 格式**：
```bash
# Sec-WebSocket-Protocol 头
wss://api.example.com/v1/realtime \
  -H "Sec-WebSocket-Protocol: realtime, openai-insecure-api-key.sk-your-token-key"
```

## Session 认证 (UserAuth)

Session 认证用于管理后台接口（`/api/*`），基于 Cookie Session。

### 登录方式

1. **用户名密码登录**
   ```bash
   POST /api/user/login
   {"username": "root", "password": "123456"}
   ```

2. **Access Token 登录**
   ```bash
   GET /api/user/self
   Authorization: your-access-token
   New-Api-User: 1
   ```

### Session 管理

- 使用 `gin-contrib/sessions` 库
- Session 存储在 Cookie 中
- 有效期：30 天
- 属性：`HttpOnly=true`, `SameSite=Strict`

### 验证流程

```go
func authHelper(c *gin.Context, minRole int) {
    session := sessions.Default(c)
    username := session.Get("username")
    role := session.Get("role")
    id := session.Get("id")

    if username == nil {
        // 尝试 Access Token 认证
        accessToken := c.Request.Header.Get("Authorization")
        user, authErr := model.ValidateAccessToken(accessToken)
        // ...
    }

    // 验证 New-Api-User 头
    apiUserId := c.Request.Header.Get("New-Api-User")
    if id != apiUserId {
        return 401
    }

    // 检查用户状态
    if status == common.UserStatusDisabled {
        return 403
    }

    // 检查角色权限
    if role < minRole {
        return 403
    }

    c.Set("username", username)
    c.Set("role", role)
    c.Set("id", id)
}
```

## OAuth 登录

SynthAPI 支持多种 OAuth 提供商：

### 内置提供商

| 提供商 | 路由 | 说明 |
|--------|------|------|
| GitHub | `/api/oauth/github` | GitHub OAuth |
| Discord | `/api/oauth/discord` | Discord OAuth |
| LinuxDo | `/api/oauth/linuxdo` | LinuxDo OAuth |
| WeChat | `/api/oauth/wechat` | 微信扫码登录 |
| Telegram | `/api/oauth/telegram/login` | Telegram 登录 |
| OIDC | `/api/oauth/oidc` | 通用 OIDC |

### 自定义 OAuth

管理员可以添加自定义 OAuth 提供商：

```bash
# 创建自定义 OAuth 提供商
POST /api/custom-oauth-provider
{
    "name": "My OAuth",
    "client_id": "xxx",
    "client_secret": "xxx",
    "auth_url": "https://oauth.example.com/authorize",
    "token_url": "https://oauth.example.com/token",
    "user_info_url": "https://oauth.example.com/userinfo"
}
```

自定义 OAuth 提供商定义在 `oauth/provider.go` 中，通过 `oauth.LoadCustomProviders()` 加载。

## WebAuthn/Passkey

SynthAPI 支持 WebAuthn/Passkey 无密码登录：

### 注册 Passkey

```bash
# 开始注册
POST /api/user/passkey/register/begin

# 完成注册
POST /api/user/passkey/register/finish
```

### Passkey 登录

```bash
# 开始登录
POST /api/user/passkey/login/begin

# 完成登录
POST /api/user/passkey/login/finish
```

### Passkey 状态

```bash
GET /api/user/passkey
```

## 双因素认证 (2FA)

SynthAPI 支持基于 TOTP 的双因素认证：

### 设置 2FA

```bash
# 获取 2FA 状态
GET /api/user/2fa/status

# 设置 2FA（返回二维码）
POST /api/user/2fa/setup

# 启用 2FA
POST /api/user/2fa/enable
{"code": "123456"}

# 禁用 2FA
POST /api/user/2fa/disable
{"code": "123456"}

# 重新生成备份码
POST /api/user/2fa/backup_codes
```

### 2FA 登录

启用 2FA 后，登录需要额外验证：

```bash
# 普通登录
POST /api/user/login
{"username": "root", "password": "123456"}
# 返回：{"success": false, "message": "需要 2FA 验证"}

# 2FA 验证
POST /api/user/login/2fa
{"username": "root", "code": "123456"}
```

## 角色与权限

### 角色定义

| 角色 | 值 | 权限 |
|------|----|------|
| 普通用户 | 1 | 管理自己的 Token、查看日志、充值 |
| 管理员 | 10 | 管理渠道、用户、兑换码 |
| 超级管理员 | 100 | 系统配置、性能管理 |

### 权限检查

```go
// 普通用户权限
router.Use(middleware.UserAuth())

// 管理员权限
router.Use(middleware.AdminAuth())

// 超级管理员权限
router.Use(middleware.RootAuth())
```

### 用户状态

| 状态 | 值 | 说明 |
|------|----|------|
| 启用 | 1 | 正常使用 |
| 禁用 | 0 | 无法登录和调用 API |

## Token 管理

### Token 属性

```go
type Token struct {
    Id                 int    // Token ID
    UserId             int    // 所属用户
    Key                string // Token Key
    Status             int    // 状态
    Name               string // 名称
    ExpiredTime        int64  // 过期时间（-1 永不过期）
    RemainQuota        int    // 剩余配额
    UnlimitedQuota     bool   // 无限配额
    ModelLimitsEnabled bool   // 启用模型限制
    ModelLimits        string // 允许的模型列表
    AllowIps           string // IP 白名单
    Group              string // 分组
    CrossGroupRetry    bool   // 跨分组重试
}
```

### Token 操作

```bash
# 创建 Token
POST /api/token
{
    "name": "my-token",
    "remain_quota": 1000000,
    "expired_time": -1,
    "model_limits_enabled": true,
    "model_limits": "gpt-4o,gpt-3.5-turbo"
}

# 查询 Token 列表
GET /api/token

# 查询 Token 详情
GET /api/token/:id

# 更新 Token
PUT /api/token

# 删除 Token
DELETE /api/token/:id

# 查询 Token Key
POST /api/token/:id/key
```

## 安全最佳实践

1. **定期轮换 Token**：建议每 90 天轮换一次
2. **启用 IP 白名单**：限制 Token 的访问来源
3. **启用模型限制**：只允许使用必要的模型
4. **设置配额上限**：防止意外高额消费
5. **启用 2FA**：为管理员账户启用双因素认证
6. **使用 HTTPS**：生产环境必须使用 HTTPS
7. **监控异常访问**：定期检查日志，发现异常及时处理
