# 监控指标

> **摘要**：SynthAPI 支持 Prometheus 指标采集和 Pyroscope 性能分析。通过系统监控中间件和性能指标接口，可以实时监控系统的运行状态。

## Prometheus 指标

SynthAPI 使用 `prometheus/client_golang` 库暴露 Prometheus 指标。

### 指标端点

```
GET /metrics
```

### 内置指标

| 指标名 | 类型 | 说明 |
|--------|------|------|
| `http_requests_total` | Counter | HTTP 请求总数 |
| `http_request_duration_seconds` | Histogram | 请求耗时 |
| `http_response_size_bytes` | Histogram | 响应大小 |

### 自定义指标

SynthAPI 定义了以下自定义指标：

| 指标名 | 类型 | 说明 |
|--------|------|------|
| `relay_requests_total` | Counter | Relay 请求总数 |
| `relay_request_duration_seconds` | Histogram | Relay 请求耗时 |
| `relay_tokens_total` | Counter | Token 使用总量 |
| `relay_quota_total` | Counter | 配额消耗总量 |
| `channel_requests_total` | Counter | 渠道请求总数 |
| `channel_errors_total` | Counter | 渠道错误总数 |

### Prometheus 配置

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'synthapi'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
```

## 系统监控

### 启动监控

系统监控在启动时自动开启：

```go
// main.go
go common.StartSystemMonitor()
```

### 监控内容

系统监控收集以下信息：

- **CPU 使用率**
- **内存使用量**
- **磁盘使用量**
- **网络连接数**

### 监控接口

```bash
# 获取性能统计（超级管理员）
GET /api/performance/stats
```

**响应**：

```json
{
    "success": true,
    "data": {
        "cpu_usage": 25.5,
        "memory_usage": 1073741824,
        "memory_total": 8589934592,
        "disk_usage": 10737418240,
        "disk_total": 107374182400,
        "goroutines": 100,
        "open_connections": 50
    }
}
```

## Pyroscope 集成

Pyroscope 是一个持续性能分析平台，可以帮助识别性能瓶颈。

### 配置

```bash
# 启用 Pyroscope
PYROSCOPE_URL=http://localhost:4040
PYROSCOPE_APP_NAME=new-api
PYROSCOPE_BASIC_AUTH_USER=admin
PYROSCOPE_BASIC_AUTH_PASSWORD=password
PYROSCOPE_MUTEX_RATE=5
PYROSCOPE_BLOCK_RATE=5
```

### 分析类型

| 类型 | 说明 |
|------|------|
| CPU | CPU 使用分析 |
| Memory | 内存分配分析 |
| Mutex | 锁竞争分析 |
| Block | 阻塞分析 |

### 启动代码

```go
// main.go
err := common.StartPyroScope()
if err != nil {
    common.SysError(fmt.Sprintf("start pyroscope error : %v", err))
}
```

## pprof 调试

### 启用 pprof

```bash
ENABLE_PPROF=true
```

### 访问地址

```
http://localhost:8005/debug/pprof/
```

### 可用端点

| 端点 | 说明 |
|------|------|
| `/debug/pprof/` | 索引页 |
| `/debug/pprof/heap` | 堆内存分析 |
| `/debug/pprof/goroutine` | Goroutine 分析 |
| `/debug/pprof/block` | 阻塞分析 |
| `/debug/pprof/mutex` | 锁分析 |
| `/debug/pprof/profile` | CPU 分析 |
| `/debug/pprof/trace` | 追踪分析 |

### 使用 go tool

```bash
# CPU 分析
go tool pprof http://localhost:8005/debug/pprof/profile?seconds=30

# 堆内存分析
go tool pprof http://localhost:8005/debug/pprof/heap

# Goroutine 分析
go tool pprof http://localhost:8005/debug/pprof/goroutine
```

## 渠道监控

### 渠道状态

```bash
# 获取渠道监控数据（管理员）
GET /api/dashboard/channel-monitor
```

**响应**：

```json
{
    "success": true,
    "data": [
        {
            "channel_id": 1,
            "channel_name": "OpenAI",
            "status": "online",
            "response_time": 500,
            "success_rate": 99.5,
            "last_test_time": 1234567890
        }
    ]
}
```

### 渠道测试

```bash
# 测试单个渠道
GET /api/channel/test/:id

# 测试所有渠道
GET /api/channel/test
```

## 告警建议

### 关键指标告警

| 指标 | 阈值 | 说明 |
|------|------|------|
| 错误率 | > 5% | 需要检查上游渠道 |
| 响应时间 | > 5000ms | 需要优化或扩容 |
| CPU 使用率 | > 80% | 需要扩容 |
| 内存使用率 | > 80% | 需要扩容或优化 |
| 磁盘使用率 | > 90% | 需要清理或扩容 |

### Prometheus 告警规则

```yaml
# alerting_rules.yml
groups:
  - name: synthapi
    rules:
      - alert: HighErrorRate
        expr: rate(relay_errors_total[5m]) / rate(relay_requests_total[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"

      - alert: HighResponseTime
        expr: histogram_quantile(0.95, rate(relay_request_duration_seconds_bucket[5m])) > 5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High response time detected"
```

## Grafana Dashboard

### 推荐面板

1. **请求概览**：总请求数、成功率、平均响应时间
2. **模型分布**：各模型的使用量
3. **渠道状态**：各渠道的健康状态
4. **用户活跃度**：活跃用户数和请求量
5. **配额消耗**：配额消耗趋势

### 数据源配置

```json
{
    "name": "SynthAPI Prometheus",
    "type": "prometheus",
    "url": "http://localhost:9090",
    "access": "proxy"
}
```
