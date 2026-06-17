# 详细安装指南

> **摘要**：SynthAPI 支持多种部署方式，包括 Docker Compose、Docker 命令、二进制文件、宝塔面板等。本文档详细介绍每种方式的步骤和注意事项。

## 部署要求

| 组件 | 最低要求 | 推荐配置 |
|------|----------|----------|
| CPU | 1 核 | 2 核+ |
| 内存 | 512MB | 2GB+ |
| 磁盘 | 1GB | 10GB+ |
| 操作系统 | Linux / macOS / Windows | Linux (Ubuntu 20.04+) |
| Docker | 20.10+ | 最新稳定版 |

## 数据库支持

| 数据库 | 版本要求 | 说明 |
|--------|----------|------|
| SQLite | 内置 | 默认使用，适合单机部署 |
| MySQL | ≥ 5.7.8 | 需支持 JSON 类型 |
| PostgreSQL | ≥ 9.6 | 推荐用于生产环境 |

## 方式一：Docker Compose（推荐）

### 完整配置

```yaml
version: '3.4'

services:
  new-api:
    image: calciumion/new-api:latest
    container_name: new-api
    restart: always
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data
      - ./logs:/app/logs
    environment:
      - SQL_DSN=postgresql://root:123456@postgres:5432/new-api
      - REDIS_CONN_STRING=redis://:123456@redis:6379
      - TZ=Asia/Shanghai
      - ERROR_LOG_ENABLED=true
      - BATCH_UPDATE_ENABLED=true
      - NODE_NAME=new-api-node-1
    depends_on:
      - redis
      - postgres
    networks:
      - new-api-network
    healthcheck:
      test: ["CMD-SHELL", "wget -q -O - http://localhost:3000/api/status | grep -o '\"success\":\\s*true' || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3

  redis:
    image: redis:latest
    container_name: redis
    restart: always
    command: ["redis-server", "--requirepass", "123456"]
    networks:
      - new-api-network

  postgres:
    image: postgres:15
    container_name: postgres
    restart: always
    environment:
      POSTGRES_USER: root
      POSTGRES_PASSWORD: 123456
      POSTGRES_DB: new-api
    volumes:
      - pg_data:/var/lib/postgresql/data
    networks:
      - new-api-network

volumes:
  pg_data:

networks:
  new-api-network:
    driver: bridge
```

### 启动与管理

```bash
# 启动
docker-compose up -d

# 查看状态
docker-compose ps

# 查看日志
docker-compose logs -f new-api

# 停止
docker-compose down

# 重启
docker-compose restart new-api

# 更新版本
docker-compose pull
docker-compose up -d
```

## 方式二：Docker 命令

### SQLite 模式（最简）

```bash
docker run --name synthapi -d --restart always \
  -p 3000:3000 \
  -e TZ=Asia/Shanghai \
  -v /path/to/data:/data \
  calciumion/new-api:latest
```

### MySQL 模式

```bash
docker run --name synthapi -d --restart always \
  -p 3000:3000 \
  -e SQL_DSN="root:password@tcp(mysql-host:3306)/new-api?parseTime=true" \
  -e TZ=Asia/Shanghai \
  -v /path/to/data:/data \
  calciumion/new-api:latest
```

### PostgreSQL 模式

```bash
docker run --name synthapi -d --restart always \
  -p 3000:3000 \
  -e SQL_DSN="postgresql://user:password@postgres-host:5432/new-api" \
  -e TZ=Asia/Shanghai \
  -v /path/to/data:/data \
  calciumion/new-api:latest
```

### 带 Redis 的完整部署

```bash
# 先启动 Redis
docker run --name redis -d --restart always \
  redis:latest redis-server --requirepass your_password

# 启动 SynthAPI
docker run --name synthapi -d --restart always \
  -p 3000:3000 \
  --link redis:redis \
  -e SQL_DSN="postgresql://user:password@postgres-host:5432/new-api" \
  -e REDIS_CONN_STRING="redis://:your_password@redis:6379" \
  -e TZ=Asia/Shanghai \
  -v /path/to/data:/data \
  calciumion/new-api:latest
```

## 方式三：二进制文件

### 下载

从 [GitHub Releases](https://github.com/QuantumNous/new-api/releases) 下载对应平台的二进制文件。

### 运行

```bash
# 赋予执行权限
chmod +x synthapi-server

# 使用 SQLite（默认）
./synthapi-server --port 3000

# 使用 MySQL
SQL_DSN="root:password@tcp(localhost:3306)/new-api" ./synthapi-server --port 3000

# 使用 PostgreSQL
SQL_DSN="postgresql://user:password@localhost:5432/new-api" ./synthapi-server --port 3000
```

### 命令行参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--port` | 监听端口 | 3000 |
| `--log-dir` | 日志目录 | ./logs |
| `--version` | 显示版本 | - |
| `--help` | 显示帮助 | - |

### Systemd 服务

创建 `/etc/systemd/system/synthapi.service`：

```ini
[Unit]
Description=SynthAPI Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/synthapi
ExecStart=/opt/synthapi/synthapi-server --port 3000 --log-dir /opt/synthapi/logs
Restart=always
RestartSec=5
Environment=SQL_DSN=postgresql://user:password@localhost:5432/new-api
Environment=REDIS_CONN_STRING=redis://:password@localhost:6379
Environment=TZ=Asia/Shanghai

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable synthapi
sudo systemctl start synthapi
sudo systemctl status synthapi
```

## 方式四：宝塔面板

1. 安装宝塔面板（≥ 9.2.0 版本）
2. 进入「软件商店」
3. 搜索「New-API」
4. 点击「一键安装」
5. 安装完成后在「已安装」中找到并配置

## 方式五：从源码构建

### 环境要求

- Go 1.22+
- Bun（前端构建）
- Node.js 18+（可选，Bun 替代）

### 构建步骤

```bash
# 克隆仓库
git clone https://github.com/QuantumNous/new-api.git
cd new-api

# 构建前端
cd web/default
bun install
bun run build
cd ../..

# 构建后端
go build -ldflags "-s -w" -o synthapi-server

# 运行
./synthapi-server --port 3000
```

## 多节点部署

### 架构说明

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
                    │  (共享)     │
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │  Database   │
                    │  (共享)     │
                    └─────────────┘
```

### 配置要点

所有节点必须配置相同的：
- `SQL_DSN` — 数据库连接
- `REDIS_CONN_STRING` — Redis 连接
- `SESSION_SECRET` — Session 加密密钥
- `CRYPTO_SECRET` — 数据加密密钥

主节点（默认）：
- `NODE_TYPE=master`（默认值，可省略）
- 执行数据库迁移
- 执行定时任务

从节点：
- `NODE_TYPE=slave`
- 仅处理请求转发

## HTTPS 配置

推荐使用 Nginx 反向代理配置 HTTPS：

```nginx
server {
    listen 443 ssl;
    server_name api.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket 支持（Realtime API）
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # SSE 流式响应支持
        proxy_buffering off;
        proxy_cache off;
    }
}
```

## 数据备份

### SQLite

```bash
cp /path/to/data/new-api.db /path/to/backup/new-api-$(date +%Y%m%d).db
```

### PostgreSQL

```bash
pg_dump -U root -h localhost new-api > backup-$(date +%Y%m%d).sql
```

### MySQL

```bash
mysqldump -u root -p new-api > backup-$(date +%Y%m%d).sql
```
