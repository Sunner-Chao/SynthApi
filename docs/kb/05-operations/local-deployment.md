# 本机部署与运维指南

> **摘要**：本文档记录 SynthAPI 在本机的实际部署路径、关键文件位置、常用运维命令，供运维机器人直接执行调试和分析任务。

## 项目部署路径

### 根目录

```
/home/ubuntu/demo/SynthApi
```

### 目录结构

| 路径 | 说明 |
|------|------|
| `/home/ubuntu/demo/SynthApi` | 项目根目录 |
| `/home/ubuntu/demo/SynthApi/main.go` | 程序入口 |
| `/home/ubuntu/demo/SynthApi/go.mod` | Go 模块定义 |
| `/home/ubuntu/demo/SynthApi/.env` | 环境变量配置 |
| `/home/ubuntu/demo/SynthApi/.env.example` | 环境变量示例 |

### 后端源码

| 路径 | 说明 |
|------|------|
| `/home/ubuntu/demo/SynthApi/router/` | 路由定义 |
| `/home/ubuntu/demo/SynthApi/controller/` | 控制器层 |
| `/home/ubuntu/demo/SynthApi/service/` | 服务层 |
| `/home/ubuntu/demo/SynthApi/model/` | 数据模型层 |
| `/home/ubuntu/demo/SynthApi/middleware/` | 中间件 |
| `/home/ubuntu/demo/SynthApi/relay/` | Relay 转发层 |
| `/home/ubuntu/demo/SynthApi/relay/channel/` | 上游适配器（40+） |
| `/home/ubuntu/demo/SynthApi/setting/` | 配置管理 |
| `/home/ubuntu/demo/SynthApi/common/` | 公共工具 |
| `/home/ubuntu/demo/SynthApi/constant/` | 常量定义 |
| `/home/ubuntu/demo/SynthApi/dto/` | 数据传输对象 |
| `/home/ubuntu/demo/SynthApi/types/` | 类型定义 |
| `/home/ubuntu/demo/SynthApi/oauth/` | OAuth 提供商 |
| `/home/ubuntu/demo/SynthApi/i18n/` | 后端国际化 |
| `/home/ubuntu/demo/SynthApi/logger/` | 日志模块 |
| `/home/ubuntu/demo/SynthApi/pkg/` | 内部包 |

### 前端源码

| 路径 | 说明 |
|------|------|
| `/home/ubuntu/demo/SynthApi/web/default/` | 默认前端（React 19） |
| `/home/ubuntu/demo/SynthApi/web/default/src/features/` | 前端功能模块 |
| `/home/ubuntu/demo/SynthApi/web/default/src/i18n/` | 前端国际化 |
| `/home/ubuntu/demo/SynthApi/web/classic/` | 经典前端 |

### 可执行文件

| 路径 | 说明 |
|------|------|
| `/home/ubuntu/demo/SynthApi/synthapi-server` | 生产环境服务端 |
| `/home/ubuntu/demo/SynthApi/synthapi-server-new` | 新版服务端 |

### 数据文件

| 路径 | 说明 |
|------|------|
| `/home/ubuntu/demo/SynthApi/new-api.db` | SQLite 数据库 |
| `/home/ubuntu/demo/SynthApi/synthapi-server.log` | 服务日志 |
| `/home/ubuntu/demo/SynthApi/logs/` | 日志目录 |

### 配置文件

| 路径 | 说明 |
|------|------|
| `/home/ubuntu/demo/SynthApi/.env` | 环境变量 |
| `/home/ubuntu/demo/SynthApi/.env.example` | 环境变量示例 |
| `/home/ubuntu/demo/SynthApi/.env.postgres` | PostgreSQL 配置 |
| `/home/ubuntu/demo/SynthApi/docker-compose.yml` | Docker Compose 配置 |
| `/home/ubuntu/demo/SynthApi/Dockerfile` | Docker 构建文件 |

### 文档

| 路径 | 说明 |
|------|------|
| `/home/ubuntu/demo/SynthApi/README.md` | 项目说明 |
| `/home/ubuntu/demo/SynthApi/CLAUDE.md` | 开发规范 |
| `/home/ubuntu/demo/SynthApi/FAQ-建议内容.md` | FAQ 建议内容 |
| `/home/ubuntu/demo/SynthApi/docs/kb/` | 知识库目录 |

## 常用运维命令

### 进程管理

```bash
# 查看进程
ps aux | grep synthapi

# 停止服务
pkill -f synthapi-server

# 启动服务（前台）
cd /home/ubuntu/demo/SynthApi && ./synthapi-server --port 3000

# 启动服务（后台）
cd /home/ubuntu/demo/SynthApi && nohup ./synthapi-server --port 3000 > synthapi-server.log 2>&1 &
```

### 日志查看

```bash
# 查看实时日志
tail -f /home/ubuntu/demo/SynthApi/synthapi-server.log

# 查看最近 100 行日志
tail -100 /home/ubuntu/demo/SynthApi/synthapi-server.log

# 搜索错误日志
grep -i "error\|fatal\|panic" /home/ubuntu/demo/SynthApi/synthapi-server.log

# 搜索特定时间的日志
grep "2026-06-14" /home/ubuntu/demo/SynthApi/synthapi-server.log
```

### 数据库操作

```bash
# SQLite 查询（需要安装 sqlite3）
sqlite3 /home/ubuntu/demo/SynthApi/new-api.db

# 常用 SQL
sqlite3 /home/ubuntu/demo/SynthApi/new-api.db "SELECT COUNT(*) FROM channels;"
sqlite3 /home/ubuntu/demo/SynthApi/new-api.db "SELECT COUNT(*) FROM users;"
sqlite3 /home/ubuntu/demo/SynthApi/new-api.db "SELECT COUNT(*) FROM tokens;"
sqlite3 /home/ubuntu/demo/SynthApi/new-api.db "SELECT COUNT(*) FROM logs;"

# 查看表结构
sqlite3 /home/ubuntu/demo/SynthApi/new-api.db ".schema channels"
sqlite3 /home/ubuntu/demo/SynthApi/new-api.db ".schema users"
sqlite3 /home/ubuntu/demo/SynthApi/new-api.db ".schema tokens"
```

### 状态检查

```bash
# 检查服务是否运行
curl -s http://localhost:3000/api/status | head -20

# 检查端口占用
netstat -tlnp | grep 3000
lsof -i :3000

# 检查系统资源
free -h
df -h
top -bn1 | head -20
```

### Git 操作

```bash
# 查看当前状态
cd /home/ubuntu/demo/SynthApi && git status

# 查看最近提交
cd /home/ubuntu/demo/SynthApi && git log --oneline -10

# 查看文件变更
cd /home/ubuntu/demo/SynthApi && git diff

# 查看特定文件的修改历史
cd /home/ubuntu/demo/SynthApi && git log --oneline model/channel.go
```

### 代码分析

```bash
# 统计代码行数
find /home/ubuntu/demo/SynthApi -name "*.go" | xargs wc -l | tail -1

# 搜索特定函数
grep -rn "func.*ChannelSelect" /home/ubuntu/demo/SynthApi/service/

# 搜索特定变量
grep -rn "ContextKeyChannelId" /home/ubuntu/demo/SynthApi/constant/

# 查看依赖
cd /home/ubuntu/demo/SynthApi && go list -m all | head -20
```

### 前端操作

```bash
# 进入前端目录
cd /home/ubuntu/demo/SynthApi/web/default

# 安装依赖
bun install

# 启动开发服务器
bun run dev

# 构建生产版本
bun run build

# 同步国际化
bun run i18n:sync
```

## 关键配置文件内容

### .env 文件位置

```
/home/ubuntu/demo/SynthApi/.env
```

### 当前环境变量

```bash
# 查看当前配置（脱敏）
cat /home/ubuntu/demo/SynthApi/.env | grep -v "KEY\|SECRET\|PASSWORD\|DSN" | head -20
```

## 故障排查命令

### 服务无法启动

```bash
# 检查端口占用
lsof -i :3000

# 检查数据库文件
ls -la /home/ubuntu/demo/SynthApi/new-api.db

# 检查配置文件
cat /home/ubuntu/demo/SynthApi/.env

# 查看启动日志
cat /home/ubuntu/demo/SynthApi/synthapi-server.log | tail -50
```

### 请求返回错误

```bash
# 测试 API 连通性
curl -v http://localhost:3000/api/status

# 检查服务日志
tail -50 /home/ubuntu/demo/SynthApi/synthapi-server.log

# 检查数据库连接
sqlite3 /home/ubuntu/demo/SynthApi/new-api.db "SELECT 1;"
```

### 性能问题

```bash
# 检查 CPU 和内存
top -bn1 | grep synthapi

# 检查 Goroutine 数量（需要 pprof）
curl http://localhost:8005/debug/pprof/goroutine?debug=1 2>/dev/null | head -20

# 检查数据库大小
ls -lh /home/ubuntu/demo/SynthApi/new-api.db

# 检查日志大小
du -sh /home/ubuntu/demo/SynthApi/logs/
```

## 备份与恢复

### 备份

```bash
# 备份数据库
cp /home/ubuntu/demo/SynthApi/new-api.db /home/ubuntu/demo/SynthApi/backup/new-api-$(date +%Y%m%d).db

# 备份配置
cp /home/ubuntu/demo/SynthApi/.env /home/ubuntu/demo/SynthApi/backup/.env-$(date +%Y%m%d)

# 完整备份
tar -czf /home/ubuntu/demo/SynthApi/backup/synthapi-$(date +%Y%m%d).tar.gz \
  -C /home/ubuntu/demo/SynthApi \
  new-api.db .env docs/kb/
```

### 恢复

```bash
# 恢复数据库
cp /home/ubuntu/demo/SynthApi/backup/new-api-20260614.db /home/ubuntu/demo/SynthApi/new-api.db

# 重启服务
pkill -f synthapi-server
cd /home/ubuntu/demo/SynthApi && nohup ./synthapi-server --port 3000 > synthapi-server.log 2>&1 &
```

## 监控脚本

### 健康检查

```bash
#!/bin/bash
# /home/ubuntu/demo/SynthApi/scripts/health-check.sh

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/status)
if [ "$RESPONSE" != "200" ]; then
    echo "Service is down! HTTP $RESPONSE"
    # 发送告警
fi
```

### 日志清理

```bash
#!/bin/bash
# /home/ubuntu/demo/SynthApi/scripts/cleanup-logs.sh

# 清理 30 天前的日志
find /home/ubuntu/demo/SynthApi/logs -name "*.log" -mtime +30 -delete
```
