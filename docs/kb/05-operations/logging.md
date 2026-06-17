# 日志系统

> **摘要**：SynthAPI 的日志系统分为系统日志和请求日志两部分。系统日志输出到文件和控制台，请求日志存储到数据库。支持错误日志记录、日志轮转和多数据库日志存储。

## 日志类型

### 1. 系统日志

系统日志记录应用的运行状态，包括启动信息、错误、警告等。

**输出位置**：
- 控制台（stdout）
- 日志文件（`--log-dir` 指定的目录）

**日志级别**：
- `SysLog` — 普通信息
- `SysError` — 错误信息
- `FatalLog` — 致命错误（会退出程序）

**使用方法**：

```go
common.SysLog("server started")
common.SysError("failed to connect database")
common.FatalLog("critical error, exiting")
```

### 2. 请求日志

请求日志记录每次 API 调用的详细信息，存储到数据库中。

**存储位置**：
- 主数据库（默认）
- 独立日志数据库（`LOG_SQL_DSN` 配置）

**记录内容**：
- 请求时间
- 用户 ID
- Token ID
- 模型名称
- 请求类型
- Token 用量（Prompt/Completion）
- 配额消耗
- 响应时间
- 状态码
- 错误信息
- 渠道 ID
- 渠道名称
- IP 地址

## 日志配置

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `--log-dir` | 日志文件目录 | `./logs` |
| `ERROR_LOG_ENABLED` | 启用错误日志 | `false` |
| `LOG_SQL_DSN` | 日志数据库连接 | 空（使用主数据库） |

### 启用错误日志

```bash
ERROR_LOG_ENABLED=true
```

启用后，所有错误会被记录到 `log.Error` 表中。

### 独立日志数据库

```bash
# 主数据库
SQL_DSN=postgresql://user:pass@localhost:5432/maindb

# 日志数据库
LOG_SQL_DSN=postgresql://user:pass@localhost:5432/logdb
```

独立日志数据库可以：
- 减轻主数据库压力
- 独立备份和清理
- 使用不同的数据库类型

## 日志文件管理

### 文件命名

日志文件按日期命名：

```
logs/
├── 2024-01-01.log
├── 2024-01-02.log
└── 2024-01-03.log
```

### 日志轮转

日志文件自动轮转，可以通过 API 清理旧日志：

```bash
# 获取日志文件列表
GET /api/performance/logs

# 清理日志文件
DELETE /api/performance/logs
```

## 请求日志查询

### 查询所有日志（管理员）

```bash
GET /api/log?p=1&size=10
```

**响应**：

```json
{
    "success": true,
    "data": [
        {
            "id": 1,
            "user_id": 1,
            "token_id": 1,
            "model_name": "gpt-4o",
            "type": 1,
            "prompt_tokens": 10,
            "completion_tokens": 20,
            "quota": 30,
            "response_time": 500,
            "status_code": 200,
            "channel_id": 1,
            "channel_name": "OpenAI",
            "ip": "192.168.1.1",
            "created_at": 1234567890
        }
    ]
}
```

### 搜索日志（管理员）

```bash
GET /api/log/search?keyword=gpt-4o
```

### 获取日志统计（管理员）

```bash
GET /api/log/stat
```

**响应**：

```json
{
    "success": true,
    "data": {
        "total_requests": 1000,
        "total_tokens": 500000,
        "total_quota": 750000
    }
}
```

### 查询当前用户日志

```bash
GET /api/log/self?p=1&size=10
```

### 查询 Token 日志

```bash
GET /api/log/token?token=sk-your-token
```

## 日志数据模型

### Log 表结构

```go
type Log struct {
    Id               int    `json:"id"`
    UserId           int    `json:"user_id" gorm:"index"`
    CreatedAt        int64  `json:"created_at" gorm:"bigint;index"`
    Type             int    `json:"type" gorm:"index"`
    Content          string `json:"content"`
    PromptTokens     int    `json:"prompt_tokens"`
    CompletionTokens int    `json:"completion_tokens"`
    Quota            int    `json:"quota"`
    TokenId          int    `json:"token_id" gorm:"index"`
    TokenName        string `json:"token_name"`
    ModelName        string `json:"model_name" gorm:"index"`
    ChannelId        int    `json:"channel_id"`
    ChannelName      string `json:"channel_name"`
    ResponseTime     int    `json:"response_time"` // ms
    IsStream         bool   `json:"is_stream"`
    StatusCode       int    `json:"status_code"`
    FilePath         string `json:"file_path"`
    FileName         string `json:"file_name"`
    ContentLength    int    `json:"content_length"`
    Ip               string `json:"ip"`
    // ... 其他字段
}
```

### 日志类型

| 类型 | 值 | 说明 |
|------|----|------|
| 文本 | 1 | Chat Completions |
| 图像 | 2 | Image Generation |
| 音频 | 3 | Audio |
| 视频 | 4 | Video |
| Embedding | 5 | Embedding |
| Rerank | 6 | Rerank |

## 日志与计费

请求日志是计费的重要依据：

1. **Token 用量**：记录 Prompt 和 Completion 的 Token 数
2. **配额消耗**：记录实际消耗的配额
3. **模型信息**：记录使用的模型
4. **用户信息**：记录调用的用户和 Token

## 日志分析

### 使用 Dashboard

管理后台的 Dashboard 提供可视化的日志分析：

- 请求趋势图
- 模型使用分布
- 用户使用排行
- 渠道使用统计

### 使用 API

```bash
# 获取用户使用数据
GET /api/data/self

# 获取全局使用数据（管理员）
GET /api/data/

# 获取用户排行（管理员）
GET /api/data/users
```

## 日志清理

### 自动清理

可以通过管理 API 删除历史日志：

```bash
DELETE /api/log
```

### 手动清理

```sql
-- 清理 30 天前的日志
DELETE FROM logs WHERE created_at < UNIX_TIMESTAMP(NOW() - INTERVAL 30 DAY);

-- 清理错误日志
DELETE FROM errors WHERE created_at < UNIX_TIMESTAMP(NOW() - INTERVAL 30 DAY);
```

## 日志最佳实践

1. **启用独立日志数据库**：减轻主数据库压力
2. **定期清理日志**：避免日志表过大
3. **监控错误日志**：及时发现和处理问题
4. **保留足够日志**：至少保留 30 天用于问题排查
5. **备份日志数据**：定期备份日志用于分析
