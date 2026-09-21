# 高可用部署

> **摘要**：SynthAPI 支持多节点部署实现高可用。通过共享数据库和 Redis，配合负载均衡器，可以实现无单点故障的部署架构。

## 架构设计

```
                    ┌─────────────┐
                    │   Nginx     │
                    │  负载均衡   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────┴─────┐ ┌───┴─────┐ ┌───┴─────┐
        │  Node 1   │ │  Node 2 │ │  Node 3 │
        │ (Master)  │ │ (Slave) │ │ (Slave) │
        └─────┬─────┘ └───┬─────┘ └───┬─────┘
              │            │            │
              └────────────┼────────────┘
                           │
                    ┌──────┴──────┐
                    │   Redis     │
                    │  (Sentinel) │
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │  Database   │
                    │  (主从)     │
                    └─────────────┘
```

## 节点类型

### 主节点 (Master)

- 默认节点类型
- 执行数据库迁移
- 执行定时任务
- 处理请求

配置：
```bash
NODE_TYPE=master  # 默认值，可省略
```

### 从节点 (Slave)

- 仅处理请求
- 不执行数据库迁移
- 不执行定时任务

配置：
```bash
NODE_TYPE=slave
```

## 共享配置

所有节点必须配置相同的：

### 必须一致的配置

```bash
# 数据库连接
SQL_DSN=postgresql://user:pass@db-host:5432/new-api

# Redis 连接
REDIS_CONN_STRING=redis://:pass@redis-host:6379

# Session 密钥
SESSION_SECRET=your-random-secret

# 加密密钥
CRYPTO_SECRET=your-crypto-secret
```

### 建议一致的配置

```bash
# 时区
TZ=Asia/Shanghai

# 日志级别
DEBUG=false
ERROR_LOG_ENABLED=true
```

## 负载均衡

### Nginx 配置

```nginx
upstream synthapi {
    # 负载均衡策略
    least_conn;  # 最少连接
    
    # 后端节点
    server 192.168.1.10:3000 weight=1;
    server 192.168.1.11:3000 weight=1;
    server 192.168.1.12:3000 weight=1;
    
    # 保持连接
    keepalive 32;
}

server {
    listen 443 ssl;
    server_name api.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://synthapi;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket 支持
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # SSE 流式响应
        proxy_buffering off;
        proxy_cache off;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
```

### 健康检查

```nginx
# Nginx 健康检查
location /health {
    proxy_pass http://synthapi/api/status;
    access_log off;
}
```

## Redis 高可用

### Redis Sentinel

```bash
# Redis Sentinel 配置
sentinel monitor mymaster 127.0.0.1 6379 2
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 60000
```

### Redis Cluster

```bash
# 连接 Redis Cluster
REDIS_CONN_STRING=redis://:pass@node1:6379,node2:6379,node3:6379
```

## 数据库高可用

### PostgreSQL 主从

```bash
# 主库
SQL_DSN=postgresql://user:pass@master:5432/new-api

# 从库（只读）
LOG_SQL_DSN=postgresql://user:pass@slave:5432/new-api
```

### MySQL 主从

```bash
# 主库
SQL_DSN=root:pass@tcp(master:3306)/new-api

# 从库（只读）
LOG_SQL_DSN=root:pass@tcp(slave:3306)/new-api
```

## Docker Compose 多节点

```yaml
version: '3.4'

services:
  nginx:
    image: nginx:latest
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./certs:/etc/nginx/certs
    depends_on:
      - node1
      - node2
      - node3

  node1:
    image: calciumion/new-api:latest
    environment:
      - NODE_TYPE=master
      - NODE_NAME=node-1
      - SQL_DSN=postgresql://root:pass@postgres:5432/new-api
      - REDIS_CONN_STRING=redis://:pass@redis:6379
      - SESSION_SECRET=your-secret
      - CRYPTO_SECRET=your-crypto-secret
    depends_on:
      - postgres
      - redis

  node2:
    image: calciumion/new-api:latest
    environment:
      - NODE_TYPE=slave
      - NODE_NAME=node-2
      - SQL_DSN=postgresql://root:pass@postgres:5432/new-api
      - REDIS_CONN_STRING=redis://:pass@redis:6379
      - SESSION_SECRET=your-secret
      - CRYPTO_SECRET=your-crypto-secret
    depends_on:
      - postgres
      - redis

  node3:
    image: calciumion/new-api:latest
    environment:
      - NODE_TYPE=slave
      - NODE_NAME=node-3
      - SQL_DSN=postgresql://root:pass@postgres:5432/new-api
      - REDIS_CONN_STRING=redis://:pass@redis:6379
      - SESSION_SECRET=your-secret
      - CRYPTO_SECRET=your-crypto-secret
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: new-api

  redis:
    image: redis:latest
    command: ["redis-server", "--requirepass", "pass"]
```

## Kubernetes 部署

### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: synthapi
spec:
  replicas: 3
  selector:
    matchLabels:
      app: synthapi
  template:
    metadata:
      labels:
        app: synthapi
    spec:
      containers:
        - name: synthapi
          image: calciumion/new-api:latest
          ports:
            - containerPort: 3000
          env:
            - name: SQL_DSN
              valueFrom:
                secretKeyRef:
                  name: synthapi-secrets
                  key: sql-dsn
            - name: REDIS_CONN_STRING
              valueFrom:
                secretKeyRef:
                  name: synthapi-secrets
                  key: redis-conn-string
            - name: SESSION_SECRET
              valueFrom:
                secretKeyRef:
                  name: synthapi-secrets
                  key: session-secret
```

### Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: synthapi
spec:
  selector:
    app: synthapi
  ports:
    - port: 80
      targetPort: 3000
  type: ClusterIP
```

### Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: synthapi
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "300"
spec:
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: synthapi
                port:
                  number: 80
```

## 故障转移

### 自动故障转移

1. **负载均衡器健康检查**：自动移除不健康的节点
2. **Redis Sentinel**：自动故障转移
3. **数据库主从**：自动切换

### 手动故障转移

```bash
# 停止主节点
docker stop node1

# 负载均衡器自动将流量转移到其他节点

# 修复主节点后重新加入
docker start node1
```

## 监控与告警

### 关键指标

| 指标 | 说明 | 告警阈值 |
|------|------|----------|
| 节点状态 | 节点是否健康 | 节点不可用 |
| 请求成功率 | 成功请求比例 | < 95% |
| 响应时间 | P95 响应时间 | > 5s |
| 数据库连接 | 连接池使用率 | > 80% |
| Redis 连接 | 连接状态 | 连接失败 |

### 告警配置

```yaml
# Prometheus 告警规则
groups:
  - name: synthapi-ha
    rules:
      - alert: NodeDown
        expr: up{job="synthapi"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "SynthAPI node {{ $labels.instance }} is down"
```

## 最佳实践

1. **至少 3 个节点**：确保高可用
2. **使用 Redis**：实现分布式缓存和限流
3. **配置健康检查**：及时发现故障
4. **设置告警**：及时通知运维人员
5. **定期备份**：定期备份数据库
6. **压力测试**：定期进行压力测试
7. **文档化**：记录部署架构和运维流程
