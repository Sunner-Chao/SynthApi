# 限流策略

> **摘要**：SynthAPI 提供多层限流机制，包括全局 API 限流、全局 Web 限流、敏感操作限流、搜索限流、模型请求限流等。支持 Redis 和内存两种后端，通过环境变量配置。

## 限流类型

### 1. 全局 API 限流 (GlobalAPIRateLimit)

**作用范围**：所有 `/api/*` 路径的请求

**默认配置**：
- 启用：`GLOBAL_API_RATE_LIMIT_ENABLE=true`
- 次数：`GLOBAL_API_RATE_LIMIT=180`
- 周期：`GLOBAL_API_RATE_LIMIT_DURATION=180`（秒）

**说明**：每个 IP 在 180 秒内最多 180 次 API 请求。

### 2. 全局 Web 限流 (GlobalWebRateLimit)

**作用范围**：Web 页面请求

**默认配置**：
- 启用：`GLOBAL_WEB_RATE_LIMIT_ENABLE=true`
- 次数：`GLOBAL_WEB_RATE_LIMIT=60`
- 周期：`GLOBAL_WEB_RATE_LIMIT_DURATION=180`（秒）

### 3. 敏感操作限流 (CriticalRateLimit)

**作用范围**：登录、注册、充值、密码重置等敏感操作

**默认配置**：
- 启用：`CRITICAL_RATE_LIMIT_ENABLE=true`
- 次数：`CRITICAL_RATE_LIMIT=20`
- 周期：`CRITICAL_RATE_LIMIT_DURATION=1200`（秒，20 分钟）

**使用场景**：
```go
userRoute.POST("/register", middleware.CriticalRateLimit(), controller.Register)
userRoute.POST("/login", middleware.CriticalRateLimit(), controller.Login)
selfRoute.POST("/topup", middleware.CriticalRateLimit(), controller.TopUp)
```

### 4. 搜索限流 (SearchRateLimit)

**作用范围**：搜索接口（Token 搜索、日志搜索等）

**默认配置**：
- 启用：`SEARCH_RATE_LIMIT_ENABLE=true`
- 次数：`SEARCH_RATE_LIMIT=10`
- 周期：`SEARCH_RATE_LIMIT_DURATION=60`（秒）

**特点**：基于用户 ID 限流（非 IP），防止通过代理绕过。

### 5. 模型请求限流 (ModelRequestRateLimit)

**作用范围**：Relay API 的模型请求

**配置**：通过系统选项 `MODEL_REQUEST_RATE_LIMIT` 设置，格式如 `60/min`。

## 限流算法

### 滑动窗口算法

SynthAPI 使用基于 Redis List 的滑动窗口算法：

```go
func redisRateLimiter(c *gin.Context, maxRequestNum int, duration int64, mark string) {
    key := "rateLimit:" + mark + c.ClientIP()

    // 1. 获取当前窗口的请求列表长度
    listLength, _ := rdb.LLen(ctx, key).Result()

    if listLength < int64(maxRequestNum) {
        // 2. 未满，添加当前时间戳
        rdb.LPush(ctx, key, time.Now().Format(timeFormat))
        rdb.Expire(ctx, key, common.RateLimitKeyExpirationDuration)
    } else {
        // 3. 已满，检查最早的时间戳
        oldTimeStr, _ := rdb.LIndex(ctx, key, -1).Result()
        oldTime, _ := time.Parse(timeFormat, oldTimeStr)
        nowTime := time.Now()

        if int64(nowTime.Sub(oldTime).Seconds()) < duration {
            // 4. 在窗口内，拒绝请求
            c.Status(http.StatusTooManyRequests)
            c.Abort()
        } else {
            // 5. 在窗口外，移除最早的时间戳，添加当前时间戳
            rdb.LPush(ctx, key, time.Now().Format(timeFormat))
            rdb.LTrim(ctx, key, 0, int64(maxRequestNum-1))
        }
    }
}
```

### 内存限流

当 Redis 不可用时，使用内存限流：

```go
func memoryRateLimiter(c *gin.Context, maxRequestNum int, duration int64, mark string) {
    key := mark + c.ClientIP()
    if !inMemoryRateLimiter.Request(key, maxRequestNum, duration) {
        c.Status(http.StatusTooManyRequests)
        c.Abort()
    }
}
```

内存限流使用 `common.InMemoryRateLimiter` 实现，基于 Map 和时间戳。

## 限流键格式

| 限流类型 | Redis 键格式 | 说明 |
|----------|-------------|------|
| 全局 API | `rateLimit:GA:{ip}` | GA = Global API |
| 全局 Web | `rateLimit:GW:{ip}` | GW = Global Web |
| 敏感操作 | `rateLimit:CT:{ip}` | CT = Critical |
| 搜索 | `rateLimit:SR:user:{userId}` | SR = Search，基于用户 |
| 下载 | `rateLimit:DW:{ip}` | DW = Download |
| 上传 | `rateLimit:UP:{ip}` | UP = Upload |

## 限流响应

当请求被限流时，返回 HTTP 429 状态码：

```http
HTTP/1.1 429 Too Many Requests
```

## 配置建议

### 开发环境

```bash
# 关闭所有限流
GLOBAL_API_RATE_LIMIT_ENABLE=false
GLOBAL_WEB_RATE_LIMIT_ENABLE=false
CRITICAL_RATE_LIMIT_ENABLE=false
SEARCH_RATE_LIMIT_ENABLE=false
```

### 生产环境

```bash
# 全局 API 限流：每分钟 100 次
GLOBAL_API_RATE_LIMIT=100
GLOBAL_API_RATE_LIMIT_DURATION=60

# 全局 Web 限流：每分钟 30 次
GLOBAL_WEB_RATE_LIMIT=30
GLOBAL_WEB_RATE_LIMIT_DURATION=60

# 敏感操作限流：每小时 10 次
CRITICAL_RATE_LIMIT=10
CRITICAL_RATE_LIMIT_DURATION=3600

# 搜索限流：每分钟 5 次
SEARCH_RATE_LIMIT=5
SEARCH_RATE_LIMIT_DURATION=60
```

### 高流量环境

```bash
# 全局 API 限流：每分钟 500 次
GLOBAL_API_RATE_LIMIT=500
GLOBAL_API_RATE_LIMIT_DURATION=60

# 使用 Redis 实现分布式限流
REDIS_CONN_STRING=redis://:password@redis-host:6379
```

## 限流与 Redis

使用 Redis 限流的优势：
1. **分布式**：多节点共享限流状态
2. **持久化**：重启后限流状态不丢失
3. **精确**：基于滑动窗口，更精确

配置 Redis：
```bash
REDIS_CONN_STRING=redis://:password@localhost:6379
```

## 限流监控

### 查看限流状态

通过 Redis CLI 查看限流键：

```bash
# 查看所有限流键
redis-cli KEYS "rateLimit:*"

# 查看特定 IP 的限流状态
redis-cli LLEN "rateLimit:GA:192.168.1.1"

# 清除限流
redis-cli DEL "rateLimit:GA:192.168.1.1"
```

### 日志记录

限流事件会记录到日志中，便于分析：

```
[2024-01-01 12:00:00] Rate limit exceeded for IP 192.168.1.1
```

## 自定义限流

### 添加新的限流类型

在 `middleware/rate-limit.go` 中添加：

```go
func MyCustomRateLimit() func(c *gin.Context) {
    return rateLimitFactory(
        50,    // 最大请求数
        60,    // 时间窗口（秒）
        "MY",  // 限流标记
    )
}
```

### 在路由中使用

```go
apiRouter.POST("/my-endpoint", middleware.MyCustomRateLimit(), controller.MyHandler)
```

## 限流最佳实践

1. **分层限流**：全局 + 路径 + 用户 多层防护
2. **合理配置**：根据实际流量调整限流参数
3. **监控告警**：监控限流触发频率，及时发现异常
4. **优雅降级**：限流时返回友好的错误信息
5. **白名单**：为内部服务设置白名单，避免误限流
