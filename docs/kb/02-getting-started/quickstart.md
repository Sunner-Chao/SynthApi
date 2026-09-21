# 5 分钟快速部署

> **摘要**：使用 Docker Compose 是部署 SynthAPI 最简单的方式，只需克隆仓库、修改配置、启动服务三步即可完成。默认使用 PostgreSQL + Redis，支持 SQLite 轻量部署。

## 前置条件

- Docker 和 Docker Compose 已安装
- 至少 1GB 可用内存
- 开放端口 3000（管理后台）和 80（公开接口，可选）

## 方式一：Docker Compose（推荐）

### 1. 克隆仓库

```bash
git clone https://github.com/QuantumNous/new-api.git
cd new-api
```

### 2. 修改配置

编辑 `docker-compose.yml`，修改默认密码：

```yaml
services:
  new-api:
    image: calciumion/new-api:latest
    ports:
      - "3000:3000"
    environment:
      - SQL_DSN=postgresql://root:YOUR_PASSWORD@postgres:5432/new-api
      - REDIS_CONN_STRING=redis://:YOUR_PASSWORD@redis:6379
      - TZ=Asia/Shanghai
    depends_on:
      - redis
      - postgres

  redis:
    image: redis:latest
    command: ["redis-server", "--requirepass", "YOUR_PASSWORD"]

  postgres:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: YOUR_PASSWORD
      POSTGRES_DB: new-api
    volumes:
      - pg_data:/var/lib/postgresql/data

volumes:
  pg_data:
```

> ⚠️ **重要**：生产环境必须修改所有默认密码！

### 3. 启动服务

```bash
docker-compose up -d
```

### 4. 访问系统

打开浏览器访问 `http://localhost:3000`，使用默认账户登录：
- 用户名：`root`
- 密码：`123456`

> ⚠️ 首次登录后请立即修改默认密码！

## 方式二：Docker 命令（SQLite）

如果不需要 PostgreSQL 和 Redis，可以使用最简部署：

```bash
docker run --name synthapi -d --restart always \
  -p 3000:3000 \
  -e TZ=Asia/Shanghai \
  -v ./data:/data \
  calciumion/new-api:latest
```

访问 `http://localhost:3000` 即可。

## 方式三：Docker 命令（MySQL）

```bash
docker run --name synthapi -d --restart always \
  -p 3000:3000 \
  -e SQL_DSN="root:password@tcp(mysql-host:3306)/new-api" \
  -e TZ=Asia/Shanghai \
  -v ./data:/data \
  calciumion/new-api:latest
```

## 首次配置

### 1. 添加上游渠道

登录管理后台后，进入「渠道」页面，点击「添加渠道」：

1. 选择渠道类型（如 OpenAI）
2. 填写上游 API Key
3. 填写 Base URL（默认为官方地址）
4. 选择支持的模型
5. 设置权重和优先级
6. 保存

### 2. 创建 API Token

进入「API 密钥」页面，点击「添加令牌」：

1. 设置令牌名称
2. 设置配额上限（可选）
3. 设置过期时间（可选）
4. 选择可用模型（可选）
5. 保存并复制 Token

### 3. 测试调用

使用 `curl` 测试 API 调用：

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-your-token-here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

## 环境变量速查

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SQL_DSN` | 数据库连接字符串 | 空（使用 SQLite） |
| `REDIS_CONN_STRING` | Redis 连接字符串 | 空（不使用 Redis） |
| `PORT` | 管理端口 | 3000 |
| `PUBLIC_PORT` | 公开端口 | 80 |
| `SESSION_SECRET` | Session 加密密钥 | 内置默认值 |
| `TZ` | 时区 | UTC |

## 常见问题

### 无法访问 3000 端口
- 检查防火墙设置
- 确认 Docker 容器正在运行：`docker ps`
- 查看容器日志：`docker logs synthapi`

### 数据库连接失败
- 确认数据库服务已启动
- 检查连接字符串格式
- 确认网络连通性

### 默认密码不安全
生产环境务必修改 `docker-compose.yml` 中的所有默认密码，包括：
- PostgreSQL 密码
- Redis 密码
- 系统管理员密码（首次登录后修改）
