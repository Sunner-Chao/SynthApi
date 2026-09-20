# 性能调优

> **摘要**：SynthAPI 的性能调优涉及数据库连接池、Redis 缓存、HTTP 客户端配置、批量更新等多个方面。本文档提供详细的调优建议和配置方法。

## 数据库调优

### 连接池配置

```bash
# 最大空闲连接数
SQL_MAX_IDLE_CONNS=100

# 最大打开连接数
SQL_MAX_OPEN_CONNS=1000

# 连接最大生命周期（秒）
SQL_MAX_LIFETIME=60
```

### 建议值

| 场景 | MAX_IDLE | MAX_OPEN | LIFETIME |
|------|----------|----------|----------|
| 小型部署 | 10 | 50 | 60 |
| 中型部署 | 50 | 200 | 60 |
| 大型部署 | 100 | 1000 | 300 |

### 索引优化

确保以下字段有索引：
- `logs.created_at` — 日志查询
- `logs.user_id` — 用户日志查询
- `logs.model_name` — 模型统计
- `tokens.key` — Token 验证
- `channels.status` — 渠道查询

## Redis 调优

### 连接配置

```bash
# Redis 连接字符串
REDIS_CONN_STRING=redis://:password@localhost:6379/0
```

### 使用场景

| 场景 | 说明 |
|------|------|
| 限流 | 分布式限流 |
| 渠道缓存 | 多节点共享缓存 |
| 会话存储 | 多节点共享会话 |

### 内存优化

```bash
# Redis 配置
maxmemory 1gb
maxmemory-policy allkeys-lru
```

## HTTP 客户端调优

### 连接池配置

```bash
# 最大空闲连接数
RELAY_MAX_IDLE_CONNS=500

# 每主机最大空闲连接数
RELAY_MAX_IDLE_CONNS_PER_HOST=100
```

### 超时配置

```bash
# 请求超时（秒）
RELAY_TIMEOUT=300

# 流式超时（秒）
STREAMING_TIMEOUT=300
```

### 建议值

| 场景 | MAX_IDLE | PER_HOST | TIMEOUT |
|------|----------|----------|---------|
| 低流量 | 100 | 20 | 60 |
| 中流量 | 500 | 100 | 120 |
| 高流量 | 1000 | 200 | 300 |

## 缓存配置

### 内存缓存

```bash
# 启用内存缓存
MEMORY_CACHE_ENABLED=true

# 同步频率（秒）
SYNC_FREQUENCY=60
```

### 缓存内容

| 缓存 | 说明 |
|------|------|
| 渠道信息 | 渠道配置和状态 |
| 用户信息 | 用户基础信息 |
| Token 信息 | Token 配置 |
| 模型列表 | 可用模型列表 |

## 批量更新

### 启用批量更新

```bash
# 启用批量更新
BATCH_UPDATE_ENABLED=true

# 批量更新间隔（秒）
BATCH_UPDATE_INTERVAL=5
```

### 适用场景

- 高并发请求
- 频繁的日志写入
- 配额更新

### 工作原理

```go
// 将更新操作放入队列
model.AddBatchUpdate(log)

// 定时批量执行
func InitBatchUpdater() {
    ticker := time.NewTicker(time.Duration(BatchUpdateInterval) * time.Second)
    for range ticker.C {
        model.FlushBatchUpdates()
    }
}
```

## 并发调优

### Goroutine 池

SynthAPI 使用 `gopool` 管理 Goroutine：

```go
import "github.com/bytedance/gopkg/util/gopool"

gopool.Go(func() {
    // 异步任务
})
```

### 调整 GOMAXPROCS

```bash
# 设置 Go 程序使用的 CPU 核数
GOMAXPROCS=4
```

## 日志调优

### 日志级别

生产环境建议：
- 关闭调试日志
- 启用错误日志
- 定期清理日志

```bash
# 关闭调试
DEBUG=false

# 启用错误日志
ERROR_LOG_ENABLED=true
```

### 日志数据库

使用独立的日志数据库：

```bash
LOG_SQL_DSN=postgresql://user:pass@localhost:5432/logdb
```

## 网络调优

### TCP 优化

```bash
# 系统级优化
sysctl -w net.core.somaxconn=65535
sysctl -w net.ipv4.tcp_max_syn_backlog=65535
sysctl -w net.ipv4.tcp_tw_reuse=1
```

### Nginx 优化

```nginx
upstream synthapi {
    least_conn;
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    keepalive 32;
}

server {
    location / {
        proxy_pass http://synthapi;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        
        # SSE 支持
        proxy_buffering off;
        proxy_cache off;
    }
}
```

## 内存优化

### 强制 GC

```bash
# 通过 API 触发 GC
POST /api/performance/gc
```

### 清除缓存

```bash
# 清除磁盘缓存
DELETE /api/performance/disk_cache
```

### 监控内存

```bash
# 查看内存使用
GET /api/performance/stats

# pprof 内存分析
go tool pprof http://localhost:8005/debug/pprof/heap
```

## 性能监控

### 关键指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| P95 响应时间 | < 2s | 95% 请求的响应时间 |
| 错误率 | < 1% | 请求错误率 |
| CPU 使用率 | < 70% | 平均 CPU 使用率 |
| 内存使用率 | < 80% | 平均内存使用率 |

### 监控工具

1. **Prometheus + Grafana**：指标监控
2. **Pyroscope**：性能分析
3. **pprof**：调试分析

## 压力测试

### 工具推荐

- **wrk**：HTTP 基准测试
- **hey**：HTTP 负载测试
- **k6**：负载测试

### 示例

```bash
# 使用 hey 测试
hey -n 1000 -c 50 -H "Authorization: Bearer sk-xxx" \
    -m POST -d '{"model":"gpt-3.5-turbo","messages":[{"role":"user","content":"hi"}]}' \
    http://localhost:3000/v1/chat/completions
```

## 调优清单

1. ☐ 配置数据库连接池
2. ☐ 启用 Redis 缓存
3. ☐ 调整 HTTP 客户端参数
4. ☐ 启用批量更新
5. ☐ 配置内存缓存
6. ☐ 使用独立日志数据库
7. ☐ 优化 Nginx 配置
8. ☐ 启用错误日志
9. ☐ 配置监控告警
10. ☐ 定期压力测试
