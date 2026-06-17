# 分布式追踪

> **摘要**：SynthAPI 通过 Pyroscope 支持持续性能分析，通过 RequestId 支持请求级别的追踪。本文档介绍追踪系统的配置和使用方法。

## Pyroscope 持续性能分析

### 简介

Pyroscope 是一个开源的持续性能分析平台，可以实时分析应用的 CPU、内存、锁竞争等性能指标。

### 配置

```bash
# .env 文件
PYROSCOPE_URL=http://localhost:4040
PYROSCOPE_APP_NAME=new-api
PYROSCOPE_BASIC_AUTH_USER=admin
PYROSCOPE_BASIC_AUTH_PASSWORD=password
PYROSCOPE_MUTEX_RATE=5
PYROSCOPE_BLOCK_RATE=5
```

### 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `PYROSCOPE_URL` | Pyroscope 服务地址 | 空（不启用） |
| `PYROSCOPE_APP_NAME` | 应用名称 | new-api |
| `PYROSCOPE_BASIC_AUTH_USER` | 基础认证用户名 | 空 |
| `PYROSCOPE_BASIC_AUTH_PASSWORD` | 基础认证密码 | 空 |
| `PYROSCOPE_MUTEX_RATE` | Mutex 采样率 | 5 |
| `PYROSCOPE_BLOCK_RATE` | Block 采样率 | 5 |
| `HOSTNAME` | 主机名标签 | new-api |

### 部署 Pyroscope

```bash
# Docker 部署
docker run -d --name pyroscope \
  -p 4040:4040 \
  pyroscope/pyroscope:latest

# 或使用 Docker Compose
version: '3'
services:
  pyroscope:
    image: pyroscope/pyroscope:latest
    ports:
      - "4040:4040"
    command:
      - "server"
      - "--log-level=info"
```

### 分析类型

| 类型 | 说明 | 用途 |
|------|------|------|
| CPU | CPU 使用分析 | 识别 CPU 密集型操作 |
| Memory | 内存分配分析 | 识别内存泄漏 |
| Mutex | 锁竞争分析 | 识别并发瓶颈 |
| Block | 阻塞分析 | 识别阻塞操作 |

### 使用场景

1. **性能优化**：识别热点函数，优化关键路径
2. **内存泄漏**：发现异常的内存分配
3. **并发问题**：识别锁竞争和阻塞
4. **容量规划**：了解资源使用模式

## RequestId 追踪

### 原理

每个请求都会分配一个唯一的 RequestId，用于追踪请求的完整生命周期。

### 实现

```go
// middleware/request-id.go
func RequestId() gin.HandlerFunc {
    return func(c *gin.Context) {
        requestId := c.GetHeader("X-Request-Id")
        if requestId == "" {
            requestId = uuid.New().String()
        }
        c.Header("X-Request-Id", requestId)
        c.Set("request_id", requestId)
        c.Next()
    }
}
```

### 使用

```bash
# 客户端传递 RequestId
curl -H "X-Request-Id: my-request-123" \
     http://your-domain:3000/v1/chat/completions

# 响应中包含 RequestId
HTTP/1.1 200 OK
X-Request-Id: my-request-123
```

### 日志关联

RequestId 会记录到请求日志中，便于问题排查：

```bash
# 通过 RequestId 查询日志
GET /api/log/search?keyword=my-request-123
```

## OpenTelemetry 集成

> ⚠️ 待验证：SynthAPI 可能支持 OpenTelemetry 集成。

### 配置示例

```bash
# 环境变量
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
OTEL_SERVICE_NAME=synthapi
```

### 使用场景

- 跨服务追踪
- 分布式链路分析
- 性能瓶颈定位

## 追踪最佳实践

1. **启用 RequestId**：确保每个请求都有唯一标识
2. **配置 Pyroscope**：持续监控性能
3. **保留日志**：保留足够的日志用于问题排查
4. **设置告警**：对异常指标设置告警
5. **定期分析**：定期分析性能数据，优化系统
