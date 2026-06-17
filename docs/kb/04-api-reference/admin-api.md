# 管理 API

> **摘要**：管理 API 提供用户管理、渠道管理、Token 管理、系统配置、日志查询等功能。所有管理接口需要认证，不同接口对角色有不同要求。

## 认证方式

管理 API 使用 Session 认证或 Access Token 认证：

```bash
# Session 认证（浏览器自动携带 Cookie）
GET /api/user/self

# Access Token 认证
GET /api/user/self
Authorization: your-access-token
New-Api-User: 1
```

## 用户管理

### 用户注册

```bash
POST /api/user/register
{
    "username": "newuser",
    "password": "password123",
    "email": "user@example.com",
    "verification_code": "123456"
}
```

### 用户登录

```bash
POST /api/user/login
{
    "username": "root",
    "password": "123456"
}
```

### 获取当前用户

```bash
GET /api/user/self
```

### 更新用户信息

```bash
PUT /api/user/self
{
    "display_name": "New Name",
    "email": "new@example.com"
}
```

### 获取所有用户（管理员）

```bash
GET /api/user?p=1&size=10
```

### 搜索用户（管理员）

```bash
GET /api/user/search?keyword=test
```

### 创建用户（管理员）

```bash
POST /api/user
{
    "username": "newuser",
    "password": "password123",
    "role": 1,
    "group": "default"
}
```

### 更新用户（管理员）

```bash
PUT /api/user
{
    "id": 1,
    "role": 10,
    "status": 1,
    "quota": 1000000
}
```

### 删除用户（管理员）

```bash
DELETE /api/user/:id
```

## Token 管理

### 获取 Token 列表

```bash
GET /api/token?p=1&size=10
```

### 搜索 Token

```bash
GET /api/token/search?keyword=test
```

### 创建 Token

```bash
POST /api/token
{
    "name": "my-token",
    "remain_quota": 1000000,
    "expired_time": -1,
    "model_limits_enabled": true,
    "model_limits": "gpt-4o,gpt-3.5-turbo",
    "group": "default"
}
```

### 更新 Token

```bash
PUT /api/token
{
    "id": 1,
    "name": "updated-token",
    "remain_quota": 2000000
}
```

### 删除 Token

```bash
DELETE /api/token/:id
```

### 查询 Token Key

```bash
POST /api/token/:id/key
```

## 渠道管理

### 获取渠道列表（管理员）

```bash
GET /api/channel?p=1&size=10
```

### 搜索渠道（管理员）

```bash
GET /api/channel/search?keyword=openai
```

### 创建渠道（管理员）

```bash
POST /api/channel
{
    "name": "OpenAI Official",
    "type": 1,
    "key": "sk-xxx",
    "base_url": "https://api.openai.com",
    "models": "gpt-4o,gpt-3.5-turbo",
    "group": "default",
    "weight": 1,
    "priority": 0
}
```

### 更新渠道（管理员）

```bash
PUT /api/channel
{
    "id": 1,
    "name": "Updated Channel",
    "models": "gpt-4o,gpt-4-turbo"
}
```

### 删除渠道（管理员）

```bash
DELETE /api/channel/:id
```

### 测试渠道（管理员）

```bash
GET /api/channel/test/:id
```

### 更新渠道余额（管理员）

```bash
GET /api/channel/update_balance/:id
```

### 获取渠道 Key（超级管理员）

```bash
POST /api/channel/:id/key
```

## 系统配置

### 获取配置选项（超级管理员）

```bash
GET /api/option/
```

### 更新配置选项（超级管理员）

```bash
PUT /api/option/
{
    "key": "setting_key",
    "value": "setting_value"
}
```

## 日志管理

### 获取日志列表（管理员）

```bash
GET /api/log?p=1&size=10
```

### 搜索日志（管理员）

```bash
GET /api/log/search?keyword=gpt-4o
```

### 获取日志统计（管理员）

```bash
GET /api/log/stat
```

### 获取用户日志

```bash
GET /api/log/self?p=1&size=10
```

### 删除历史日志（管理员）

```bash
DELETE /api/log
```

## 数据统计

### 获取配额数据（管理员）

```bash
GET /api/data/
```

### 获取用户配额数据（管理员）

```bash
GET /api/data/users
```

### 获取当前用户配额数据

```bash
GET /api/data/self
```

## 兑换码管理（管理员）

### 获取兑换码列表

```bash
GET /api/redemption?p=1&size=10
```

### 创建兑换码

```bash
POST /api/redemption
{
    "name": "100万配额",
    "quota": 1000000,
    "count": 10
}
```

### 删除兑换码

```bash
DELETE /api/redemption/:id
```

## 模型管理（管理员）

### 获取模型列表

```bash
GET /api/models
```

### 创建模型

```bash
POST /api/models
{
    "model": "gpt-4o",
    "display_name": "GPT-4o",
    "description": "OpenAI GPT-4o model"
}
```

### 更新模型

```bash
PUT /api/models
{
    "id": 1,
    "display_name": "Updated Name"
}
```

## 分组管理（管理员）

### 获取分组列表

```bash
GET /api/group
```

### 获取充值分组

```bash
GET /api/topup_group
```

## 预填充分组（管理员）

### 获取预填充分组

```bash
GET /api/prefill_group
```

### 创建预填充分组

```bash
POST /api/prefill_group
{
    "name": "vip",
    "description": "VIP users"
}
```

## 性能管理（超级管理员）

### 获取性能统计

```bash
GET /api/performance/stats
```

### 清除磁盘缓存

```bash
DELETE /api/performance/disk_cache
```

### 强制 GC

```bash
POST /api/performance/gc
```

### 获取日志文件

```bash
GET /api/performance/logs
```

## 订阅管理

### 获取订阅套餐

```bash
GET /api/subscription/plans
```

### 获取当前订阅

```bash
GET /api/subscription/self
```

### 购买订阅

```bash
POST /api/subscription/balance/pay
{
    "plan_id": 1
}
```

### 管理员创建订阅套餐

```bash
POST /api/subscription/admin/plans
{
    "title": "VIP 月卡",
    "price_amount": 99.99,
    "currency": "USD",
    "duration_unit": "month",
    "duration_value": 1,
    "total_amount": 10000000
}
```

## 充值管理

### 创建充值订单

```bash
POST /api/user/topup
{
    "amount": 100
}
```

### Stripe 充值

```bash
POST /api/user/stripe/pay
{
    "amount": 100,
    "currency": "usd"
}
```

### 兑换码充值

```bash
POST /api/user/topup
{
    "redemption_code": "xxx"
}
```

## OAuth 管理

### 获取 OAuth 状态

```bash
GET /api/oauth/state
```

### 获取用户 OAuth 绑定

```bash
GET /api/user/oauth/bindings
```

### 解绑 OAuth

```bash
DELETE /api/user/oauth/bindings/:provider_id
```

## 错误响应

所有管理 API 的错误响应格式：

```json
{
    "success": false,
    "message": "错误信息"
}
```

成功响应：

```json
{
    "success": true,
    "data": { ... }
}
```

## 分页参数

列表接口支持分页：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `p` | 页码 | 1 |
| `size` | 每页数量 | 10 |
| `sort` | 排序字段 | id |
| `order` | 排序方向 | desc |
