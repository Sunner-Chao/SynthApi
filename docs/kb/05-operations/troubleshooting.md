# 故障排查

> **摘要**：本文档整理了 SynthAPI 常见问题的排查方法和解决方案，涵盖启动问题、连接问题、认证问题、计费问题等。

## 启动问题

### 数据库连接失败

**症状**：
```
failed to initialize database: dial tcp 127.0.0.1:3306: connect: connection refused
```

**排查步骤**：

1. 检查数据库服务是否启动
   ```bash
   # MySQL
   systemctl status mysql
   
   # PostgreSQL
   systemctl status postgresql
   ```

2. 检查连接字符串格式
   ```bash
   # MySQL
   SQL_DSN=root:password@tcp(localhost:3306)/new-api?parseTime=true
   
   # PostgreSQL
   SQL_DSN=postgresql://user:password@localhost:5432/new-api
   ```

3. 检查网络连通性
   ```bash
   telnet localhost 3306
   ```

### Redis 连接失败

**症状**：
```
failed to connect to Redis: dial tcp 127.0.0.1:6379: connect: connection refused
```

**排查步骤**：

1. 检查 Redis 服务
   ```bash
   systemctl status redis
   redis-cli ping
   ```

2. 检查连接字符串
   ```bash
   REDIS_CONN_STRING=redis://:password@localhost:6379
   ```

### 端口占用

**症状**：
```
listen tcp :3000: bind: address already in use
```

**排查步骤**：

1. 查找占用端口的进程
   ```bash
   lsof -i :3000
   netstat -tlnp | grep 3000
   ```

2. 停止占用进程或更换端口
   ```bash
   PORT=3001 ./synthapi-server
   ```

## 连接问题

### 上游连接超时

**症状**：
```
context deadline exceeded
```

**排查步骤**：

1. 检查网络连通性
   ```bash
   curl -v https://api.openai.com/v1/models
   ```

2. 增加超时时间
   ```bash
   RELAY_TIMEOUT=300
   STREAMING_TIMEOUT=600
   ```

3. 检查代理设置
   ```bash
   # 如果需要代理
   export HTTP_PROXY=http://proxy:port
   export HTTPS_PROXY=http://proxy:port
   ```

### TLS 证书错误

**症状**：
```
x509: certificate signed by unknown authority
```

**解决方案**：

```bash
# 跳过 TLS 验证（不推荐用于生产）
TLS_INSECURE_SKIP_VERIFY=true
```

## 认证问题

### Token 无效

**症状**：
```json
{
    "error": {
        "message": "Invalid token",
        "type": "authentication_error"
    }
}
```

**排查步骤**：

1. 检查 Token 格式
   ```bash
   # 正确格式
   Authorization: Bearer sk-your-token-key
   
   # 错误格式
   Authorization: sk-your-token-key  # 缺少 Bearer
   ```

2. 检查 Token 状态
   - Token 是否已过期
   - Token 是否被禁用
   - Token 配额是否充足

3. 检查用户状态
   - 用户是否被禁用

### Session 失效

**症状**：
```json
{
    "success": false,
    "message": "未登录"
}
```

**排查步骤**：

1. 检查 Cookie 是否存在
2. 检查 `SESSION_SECRET` 是否一致（多节点部署）
3. 清除浏览器 Cookie 重新登录

## 计费问题

### 配额不足

**症状**：
```json
{
    "error": {
        "message": "Insufficient quota",
        "type": "insufficient_quota"
    }
}
```

**解决方案**：

1. 充值配额
2. 使用兑换码
3. 联系管理员增加配额

### Token 用量计算异常

**排查步骤**：

1. 检查日志中的 Token 用量
   ```bash
   GET /api/log/self?size=10
   ```

2. 检查模型价格比率
   ```bash
   GET /api/ratio_config
   ```

3. 检查是否启用了媒体 Token 统计
   ```bash
   GET_MEDIA_TOKEN=true
   ```

## 渠道问题

### 渠道不可用

**症状**：
```json
{
    "error": {
        "message": "No available channel",
        "type": "service_unavailable"
    }
}
```

**排查步骤**：

1. 检查渠道状态
   ```bash
   GET /api/channel
   ```

2. 测试渠道连通性
   ```bash
   GET /api/channel/test/:id
   ```

3. 检查渠道是否支持目标模型
   ```bash
   GET /api/channel/models
   ```

### 渠道自动禁用

**原因**：连续失败次数过多

**解决方案**：

1. 检查上游服务状态
2. 检查 API Key 是否有效
3. 手动启用渠道
   ```bash
   PUT /api/channel
   {"id": 1, "status": 1}
   ```

## 性能问题

### 响应缓慢

**排查步骤**：

1. 检查上游响应时间
   ```bash
   curl -w "@curl-format.txt" -o /dev/null -s https://api.openai.com/v1/models
   ```

2. 检查系统资源
   ```bash
   # CPU
   top -p $(pgrep synthapi)
   
   # 内存
   free -h
   
   # 网络
   ss -s
   ```

3. 启用 pprof 分析
   ```bash
   ENABLE_PPROF=true
   go tool pprof http://localhost:8005/debug/pprof/profile?seconds=30
   ```

### 内存占用过高

**排查步骤**：

1. 检查 Goroutine 数量
   ```bash
   curl http://localhost:8005/debug/pprof/goroutine?debug=1
   ```

2. 强制 GC
   ```bash
   POST /api/performance/gc
   ```

3. 清除缓存
   ```bash
   DELETE /api/performance/disk_cache
   ```

## 前端问题

### 页面无法访问

**排查步骤**：

1. 检查前端是否构建
   ```bash
   ls web/default/dist/
   ```

2. 检查 Nginx 配置（如果有反向代理）

3. 检查浏览器控制台错误

### 登录后立即退出

**排查步骤**：

1. 检查 Cookie 设置
2. 检查 `SESSION_SECRET` 配置
3. 清除浏览器缓存

## 日志分析

### 查看系统日志

```bash
# 实时查看日志
tail -f logs/*.log

# 搜索错误
grep "ERROR" logs/*.log
```

### 查看请求日志

```bash
# 查询最近的请求
GET /api/log?size=100

# 搜索特定模型
GET /api/log/search?keyword=gpt-4o

# 查询错误请求
GET /api/log/search?keyword=error
```

## 常见错误码

| HTTP 状态码 | 说明 | 解决方案 |
|-------------|------|----------|
| 400 | 请求参数错误 | 检查请求体格式 |
| 401 | 认证失败 | 检查 Token |
| 403 | 权限不足 | 检查用户角色和权限 |
| 404 | 资源不存在 | 检查请求路径 |
| 429 | 请求过于频繁 | 等待或增加限流配置 |
| 500 | 服务器内部错误 | 查看系统日志 |
| 502 | 上游服务错误 | 检查上游渠道状态 |
| 503 | 服务不可用 | 检查系统状态 |

## 获取帮助

如果问题无法解决：

1. 查看 GitHub Issues：https://github.com/QuantumNous/new-api/issues
2. 查看官方文档：https://docs.newapi.pro
3. 提交新的 Issue，附带：
   - 错误信息
   - 系统环境
   - 配置信息（脱敏）
   - 复现步骤
