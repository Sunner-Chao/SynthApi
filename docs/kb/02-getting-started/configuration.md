# 配置详解

> **摘要**：SynthAPI 的配置通过环境变量和系统选项两种方式管理。环境变量在启动时加载，系统选项通过管理后台动态修改。本文档详细说明每个配置项的含义和使用方法。

## 环境变量

环境变量在启动时从 `.env` 文件或系统环境中加载，修改后需要重启服务生效。

### 基础配置

| 变量 | 说明 | 默认值 | 示例 |
|------|------|--------|------|
| `PORT` | 管理端口 | 3000 | `PORT=3000` |
| `PUBLIC_PORT` | 公开端口 | 80 | `PUBLIC_PORT=80` |
| `ADMIN_PORT` | 管理端口（覆盖 PORT） | 同 PORT | `ADMIN_PORT=3000` |
| `FRONTEND_BASE_URL` | 前端独立部署 URL | 空 | `FRONTEND_BASE_URL=https://ui.example.com` |
| `TZ` | 时区 | UTC | `TZ=Asia/Shanghai` |
| `NODE_TYPE` | 节点类型 | master | `NODE_TYPE=slave` |
| `NODE_NAME` | 节点名称 | 空 | `NODE_NAME=node-1` |

### 数据库配置

| 变量 | 说明 | 默认值 | 示例 |
|------|------|--------|------|
| `SQL_DSN` | 主数据库连接字符串 | 空（SQLite） | 见下方示例 |
| `LOG_SQL_DSN` | 日志数据库连接字符串 | 同 SQL_DSN | 见下方示例 |
| `SQLITE_PATH` | SQLite 文件路径 | `./data/new-api.db` | `SQLITE_PATH=/data/db.sqlite` |
| `SQL_MAX_IDLE_CONNS` | 最大空闲连接数 | 100 | `SQL_MAX_IDLE_CONNS=50` |
| `SQL_MAX_OPEN_CONNS` | 最大打开连接数 | 1000 | `SQL_MAX_OPEN_CONNS=500` |
| `SQL_MAX_LIFETIME` | 连接最大生命周期（秒） | 60 | `SQL_MAX_LIFETIME=300` |

连接字符串格式：

```bash
# MySQL
SQL_DSN=root:password@tcp(localhost:3306)/new-api?parseTime=true

# PostgreSQL
SQL_DSN=postgresql://user:password@localhost:5432/new-api

# SQLite（留空即可）
SQL_DSN=
```

### Redis 配置

| 变量 | 说明 | 默认值 | 示例 |
|------|------|--------|------|
| `REDIS_CONN_STRING` | Redis 连接字符串 | 空 | `redis://:password@localhost:6379` |
| `CRYPTO_SECRET` | 数据加密密钥 | 同 SESSION_SECRET | `CRYPTO_SECRET=your-secret` |

Redis 连接字符串格式：

```bash
# 无密码
REDIS_CONN_STRING=redis://localhost:6379

# 有密码
REDIS_CONN_STRING=redis://:password@localhost:6379

# 带数据库编号
REDIS_CONN_STRING=redis://:password@localhost:6379/0

# 带用户名
REDIS_CONN_STRING=redis://user:password@localhost:6379
```

### 安全配置

| 变量 | 说明 | 默认值 | 示例 |
|------|------|--------|------|
| `SESSION_SECRET` | Session 加密密钥 | 内置默认值 | `SESSION_SECRET=random-string-here` |
| `TLS_INSECURE_SKIP_VERIFY` | 跳过 TLS 验证 | false | `TLS_INSECURE_SKIP_VERIFY=true` |
| `TRUSTED_REDIRECT_DOMAINS` | 可信重定向域名 | 空 | `TRUSTED_REDIRECT_DOMAINS=example.com` |

> ⚠️ **重要**：多节点部署必须设置 `SESSION_SECRET`，且所有节点值相同。

### 缓存配置

| 变量 | 说明 | 默认值 | 示例 |
|------|------|--------|------|
| `MEMORY_CACHE_ENABLED` | 启用内存缓存 | false | `MEMORY_CACHE_ENABLED=true` |
| `SYNC_FREQUENCY` | 缓存同步频率（秒） | 60 | `SYNC_FREQUENCY=30` |
| `CHANNEL_UPDATE_FREQUENCY` | 渠道更新频率（秒） | 空（不自动更新） | `CHANNEL_UPDATE_FREQUENCY=30` |
| `BATCH_UPDATE_ENABLED` | 启用批量更新 | false | `BATCH_UPDATE_ENABLED=true` |
| `BATCH_UPDATE_INTERVAL` | 批量更新间隔（秒） | 5 | `BATCH_UPDATE_INTERVAL=10` |

> 💡 启用 Redis 时会自动启用内存缓存。

### 限流配置

| 变量 | 说明 | 默认值 | 示例 |
|------|------|--------|------|
| `GLOBAL_API_RATE_LIMIT_ENABLE` | 启用全局 API 限流 | true | `GLOBAL_API_RATE_LIMIT_ENABLE=false` |
| `GLOBAL_API_RATE_LIMIT` | 全局 API 限流次数 | 180 | `GLOBAL_API_RATE_LIMIT=300` |
| `GLOBAL_API_RATE_LIMIT_DURATION` | 全局 API 限流周期（秒） | 180 | `GLOBAL_API_RATE_LIMIT_DURATION=60` |
| `GLOBAL_WEB_RATE_LIMIT_ENABLE` | 启用全局 Web 限流 | true | `GLOBAL_WEB_RATE_LIMIT_ENABLE=false` |
| `GLOBAL_WEB_RATE_LIMIT` | 全局 Web 限流次数 | 60 | `GLOBAL_WEB_RATE_LIMIT=100` |
| `GLOBAL_WEB_RATE_LIMIT_DURATION` | 全局 Web 限流周期（秒） | 180 | `GLOBAL_WEB_RATE_LIMIT_DURATION=60` |
| `CRITICAL_RATE_LIMIT_ENABLE` | 启用敏感操作限流 | true | `CRITICAL_RATE_LIMIT_ENABLE=false` |
| `CRITICAL_RATE_LIMIT` | 敏感操作限流次数 | 20 | `CRITICAL_RATE_LIMIT=50` |
| `CRITICAL_RATE_LIMIT_DURATION` | 敏感操作限流周期（秒） | 1200 | `CRITICAL_RATE_LIMIT_DURATION=600` |
| `SEARCH_RATE_LIMIT_ENABLE` | 启用搜索限流 | true | `SEARCH_RATE_LIMIT_ENABLE=false` |
| `SEARCH_RATE_LIMIT` | 搜索限流次数 | 10 | `SEARCH_RATE_LIMIT=30` |
| `SEARCH_RATE_LIMIT_DURATION` | 搜索限流周期（秒） | 60 | `SEARCH_RATE_LIMIT_DURATION=30` |
| `MODEL_REQUEST_RATE_LIMIT` | 模型请求限流 | 空 | `MODEL_REQUEST_RATE_LIMIT=60/min` |

### 超时配置

| 变量 | 说明 | 默认值 | 示例 |
|------|------|--------|------|
| `RELAY_TIMEOUT` | 请求超时（秒） | 0（不限制） | `RELAY_TIMEOUT=300` |
| `STREAMING_TIMEOUT` | 流式超时（秒） | 300 | `STREAMING_TIMEOUT=600` |
| `RELAY_MAX_IDLE_CONNS` | 最大空闲连接数 | 500 | `RELAY_MAX_IDLE_CONNS=1000` |
| `RELAY_MAX_IDLE_CONNS_PER_HOST` | 每主机最大空闲连接数 | 100 | `RELAY_MAX_IDLE_CONNS_PER_HOST=200` |

### 日志与调试

| 变量 | 说明 | 默认值 | 示例 |
|------|------|--------|------|
| `DEBUG` | 启用调试模式 | false | `DEBUG=true` |
| `ERROR_LOG_ENABLED` | 启用错误日志 | false | `ERROR_LOG_ENABLED=true` |
| `GIN_MODE` | Gin 模式 | release | `GIN_MODE=debug` |
| `ENABLE_PPROF` | 启用 pprof | false | `ENABLE_PPROF=true` |

### 性能分析

| 变量 | 说明 | 默认值 | 示例 |
|------|------|--------|------|
| `PYROSCOPE_URL` | Pyroscope 服务地址 | 空 | `PYROSCOPE_URL=http://localhost:4040` |
| `PYROSCOPE_APP_NAME` | 应用名称 | new-api | `PYROSCOPE_APP_NAME=synthapi` |
| `PYROSCOPE_BASIC_AUTH_USER` | Pyroscope 认证用户 | 空 | `PYROSCOPE_BASIC_AUTH_USER=admin` |
| `PYROSCOPE_BASIC_AUTH_PASSWORD` | Pyroscope 认证密码 | 空 | `PYROSCOPE_BASIC_AUTH_PASSWORD=pass` |

### 模型与提供商配置

| 变量 | 说明 | 默认值 | 示例 |
|------|------|--------|------|
| `GEMINI_SAFETY_SETTING` | Gemini 安全设置 | BLOCK_NONE | `GEMINI_SAFETY_SETTING=BLOCK_NONE` |
| `COHERE_SAFETY_SETTING` | Cohere 安全设置 | NONE | `COHERE_SAFETY_SETTING=NONE` |
| `AZURE_DEFAULT_API_VERSION` | Azure API 版本 | 2025-04-01-preview | `AZURE_DEFAULT_API_VERSION=2024-12-01-preview` |
| `GEMINI_VISION_MAX_IMAGE_NUM` | Gemini 最大图片数 | 16 | `GEMINI_VISION_MAX_IMAGE_NUM=5` |

### Token 与计费

| 变量 | 说明 | 默认值 | 示例 |
|------|------|--------|------|
| `GENERATE_DEFAULT_TOKEN` | 注册时生成默认 Token | false | `GENERATE_DEFAULT_TOKEN=true` |
| `CountToken` | 启用 Token 计数 | true | `CountToken=false` |
| `GET_MEDIA_TOKEN` | 统计媒体 Token | true | `GET_MEDIA_TOKEN=false` |
| `FORCE_STREAM_OPTION` | 强制 StreamOptions | true | `FORCE_STREAM_OPTION=false` |

### 任务配置

| 变量 | 说明 | 默认值 | 示例 |
|------|------|--------|------|
| `UPDATE_TASK` | 启用任务更新 | true | `UPDATE_TASK=false` |
| `TASK_QUERY_LIMIT` | 任务查询限制 | 1000 | `TASK_QUERY_LIMIT=500` |
| `TASK_TIMEOUT_MINUTES` | 任务超时（分钟） | 1440 | `TASK_TIMEOUT_MINUTES=60` |

### 分析与统计

| 变量 | 说明 | 默认值 | 示例 |
|------|------|--------|------|
| `GOOGLE_ANALYTICS_ID` | Google Analytics ID | 空 | `GOOGLE_ANALYTICS_ID=G-XXXXXXXXXX` |
| `UMAMI_WEBSITE_ID` | Umami 网站 ID | 空 | `UMAMI_WEBSITE_ID=xxx-xxx-xxx` |
| `UMAMI_SCRIPT_URL` | Umami 脚本 URL | 官方地址 | `UMAMI_SCRIPT_URL=https://your-umami.com/script.js` |

### 文件处理

| 变量 | 说明 | 默认值 | 示例 |
|------|------|--------|------|
| `MAX_FILE_DOWNLOAD_MB` | 最大文件下载大小（MB） | 64 | `MAX_FILE_DOWNLOAD_MB=128` |
| `STREAM_SCANNER_MAX_BUFFER_MB` | 流扫描最大缓冲（MB） | 128 | `STREAM_SCANNER_MAX_BUFFER_MB=256` |
| `MAX_REQUEST_BODY_MB` | 最大请求体大小（MB） | 128 | `MAX_REQUEST_BODY_MB=64` |

## 系统选项

系统选项通过管理后台「系统设置」页面动态修改，修改后立即生效，无需重启。

### 访问路径

管理后台 → 系统设置 → 各配置页面

### 主要配置分类

| 分类 | 说明 | 配置文件 |
|------|------|----------|
| 运营设置 | 注册、登录、公告等 | `setting/operation_setting/` |
| 模型设置 | 模型列表、默认模型 | `setting/model_setting/` |
| 比率设置 | 模型价格比率 | `setting/ratio_setting/` |
| 计费设置 | 计费规则、订阅套餐 | `setting/billing_setting/` |
| 系统设置 | 系统级配置 | `setting/system_setting/` |
| 性能设置 | 性能相关参数 | `setting/performance_setting/` |

### 热更新机制

系统选项通过 `model.SyncOptions` 定期从数据库同步到内存：

```go
// main.go
go model.SyncOptions(common.SyncFrequency)
```

默认每 60 秒同步一次（由 `SYNC_FREQUENCY` 控制）。

## .env 文件

项目根目录的 `.env` 文件用于本地开发环境配置，格式为：

```bash
# 端口
PORT=3000

# 数据库
SQL_DSN=postgresql://root:123456@localhost:5432/new-api

# Redis
REDIS_CONN_STRING=redis://:123456@localhost:6379

# 安全
SESSION_SECRET=your-random-secret-here

# 调试
DEBUG=true
```

> 💡 `.env` 文件仅在启动时加载，修改后需重启服务。优先级低于系统环境变量。
