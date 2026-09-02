# Square UI V2 部署指南

## 快速部署

### 前提条件

- ✅ 前端已构建完成 (`web/default/dist/`)
- ✅ SSH 访问权限：118.25.43.185 (ubuntu/sunner)
- ✅ 生产服务器：111.231.166.1 (ubuntu/2201306@Gl)

---

## 部署步骤

### 步骤 1: 在上海构建服务器构建 Docker 镜像

```bash
# SSH 到构建服务器
ssh ubuntu@118.25.43.185

# 导航到项目目录（如果不存在则克隆）
cd /home/ubuntu/synthapi-build || git clone https://github.com/Sunner-Chao/SynthApi.git synthapi-build
cd /home/ubuntu/synthapi-build

# 拉取最新代码
git fetch origin
git checkout codex/github-sync-main
git pull origin codex/github-sync-main

# 验证前端文件存在
ls -lh web/default/dist/index.html

# 构建 Docker 镜像
docker build -t synthapi-default:square-ui-v2 -f docker/Dockerfile .

# 保存镜像为 tar.gz
docker save synthapi-default:square-ui-v2 | gzip > ~/synthapi-square-ui-v2.tar.gz

# 检查镜像大小
ls -lh ~/synthapi-square-ui-v2.tar.gz
```

### 步骤 2: 传输镜像到生产服务器

```bash
# 仍在构建服务器上
scp ~/synthapi-square-ui-v2.tar.gz ubuntu@111.231.166.1:/home/ubuntu/
```

### 步骤 3: 在生产服务器部署

```bash
# SSH 到生产服务器
ssh ubuntu@111.231.166.1

# 加载 Docker 镜像
docker load < ~/synthapi-square-ui-v2.tar.gz

# 导航到项目目录
cd /home/ubuntu/synthapi

# 备份当前 docker-compose.yml
cp docker-compose.yml docker-compose.yml.backup.$(date +%Y%m%d_%H%M%S)

# 编辑 docker-compose.yml，更新镜像标签
vim docker-compose.yml
# 修改: image: synthapi-default:latest
# 为:   image: synthapi-default:square-ui-v2

# 停止当前服务
docker-compose down

# 启动新服务
docker-compose up -d

# 验证部署
docker-compose ps
docker-compose logs --tail=50 synthapi-default

# 检查服务健康状态
curl -I http://localhost:3000
```

### 步骤 4: 验证 UI 更新

1. **访问 Dashboard**: http://111.231.166.1:3000/dashboard
2. **登录**: admin / 144028gl
3. **检查布局**:
   - ✅ Header sticky 且带动画
   - ✅ 4 列统计卡片网格（桌面）
   - ✅ 侧边栏显示快捷操作和升级卡片
   - ✅ 使用趋势图表区域（带占位符）
   - ✅ 最近活动列表
   - ✅ 快速统计卡片组
4. **测试响应式**:
   - Desktop (≥1024px): 完整侧边栏布局
   - Tablet (640-1024px): 2 列统计，无侧边栏
   - Mobile (<640px): 单列堆叠

---

## 回滚计划

如果出现问题，立即回滚：

```bash
# 在生产服务器上
cd /home/ubuntu/synthapi

# 停止服务
docker-compose down

# 恢复备份的 docker-compose.yml
cp docker-compose.yml.backup.YYYYMMDD_HHMMSS docker-compose.yml

# 重启服务
docker-compose up -d

# 验证
docker-compose ps
curl -I http://localhost:3000
```

---

## 仅前端更新（轻量级部署）

如果只需要更新前端静态文件（无后端变更）：

```bash
# 在生产服务器上
ssh ubuntu@111.231.166.1

# 导航到容器挂载的前端目录（如果有的话）
# 或者直接复制到 Docker 容器内

# 方法 1: 如果使用 volume 挂载
cd /home/ubuntu/synthapi/web/default
mv dist dist.backup.$(date +%Y%m%d_%H%M%S)
# 上传新的 dist/ 目录

# 方法 2: 直接复制到运行中的容器
docker cp ./dist/. synthapi-default:/app/web/default/dist/

# 无需重启容器，立即生效
```

---

## 环境变量检查

确保以下环境变量已配置：

```bash
# 检查 .env 文件
cat /home/ubuntu/synthapi/.env

# 关键配置项：
PORT=3000
SESSION_SECRET=your-secret-key
SQL_DSN=sqlite:./data/new-api.db
REDIS_CONN_STRING=redis://localhost:6379
```

---

## 监控和日志

### 查看实时日志

```bash
# 所有服务
docker-compose logs -f

# 仅前端服务
docker-compose logs -f synthapi-default

# 最近 100 行
docker-compose logs --tail=100 synthapi-default
```

### 监控资源使用

```bash
# Docker 容器状态
docker stats

# 磁盘使用
df -h

# 内存使用
free -h
```

---

## 常见问题

### 问题 1: 构建失败

**症状**: Docker build 失败

**解决方案**:
```bash
# 检查 Dockerfile
cat docker/Dockerfile

# 清理 Docker 缓存
docker system prune -a

# 重新构建（无缓存）
docker build --no-cache -t synthapi-default:square-ui-v2 -f docker/Dockerfile .
```

### 问题 2: 容器启动失败

**症状**: `docker-compose up -d` 后容器退出

**解决方案**:
```bash
# 查看容器日志
docker-compose logs synthapi-default

# 检查端口冲突
netstat -tulpn | grep 3000

# 验证镜像完整性
docker images | grep synthapi-default
```

### 问题 3: 前端显示空白

**症状**: 访问页面显示空白或 404

**解决方案**:
```bash
# 检查前端文件是否存在
docker exec synthapi-default ls -lh /app/web/default/dist/

# 检查 index.html
docker exec synthapi-default cat /app/web/default/dist/index.html

# 验证路由配置
docker exec synthapi-default cat /app/router/main.go
```

### 问题 4: 样式丢失

**症状**: 页面布局错乱，无样式

**解决方案**:
```bash
# 检查 CSS 文件
docker exec synthapi-default ls -lh /app/web/default/dist/static/css/

# 验证 Content-Type
curl -I http://localhost:3000/static/css/index.*.css

# 检查 Nginx/反向代理配置（如果使用）
```

---

## 性能优化建议

### 启用 Gzip 压缩

确保 Web 服务器启用 Gzip 压缩：

```go
// router/main.go
import "github.com/gin-contrib/gzip"

func main() {
    router := gin.Default()
    router.Use(gzip.Gzip(gzip.DefaultCompression))
    // ...
}
```

### 配置缓存头

```go
// 静态资源缓存 1 年
router.Static("/static", "./web/default/dist/static")
router.Use(func(c *gin.Context) {
    if strings.HasPrefix(c.Request.URL.Path, "/static") {
        c.Header("Cache-Control", "public, max-age=31536000")
    }
    c.Next()
})
```

---

## 安全检查

部署前确认：

- ✅ 无 hardcoded API keys
- ✅ 无敏感信息在前端代码
- ✅ HTTPS 已启用（生产环境）
- ✅ CSP 头已配置
- ✅ 防止 XSS 和 CSRF

---

## 部署时间表

| 阶段 | 预计时间 | 说明 |
|------|---------|------|
| 构建 Docker 镜像 | 5-10 分钟 | 取决于网络和服务器性能 |
| 传输镜像 | 2-5 分钟 | 取决于带宽 |
| 部署到生产 | 1-2 分钟 | 停止 → 加载 → 启动 |
| 验证测试 | 5-10 分钟 | 手动测试各功能 |
| **总计** | **15-30 分钟** | 完整部署流程 |

---

## 联系信息

### 服务器访问

- **构建服务器**: 118.25.43.185 (ubuntu/sunner)
- **生产服务器**: 111.231.166.1 (ubuntu/2201306@Gl)

### 管理员账号

- **用户名**: admin
- **密码**: 144028gl
- **邮箱**: frontdesk@lstwin.top

### Git 仓库

- **仓库**: https://github.com/Sunner-Chao/SynthApi
- **分支**: codex/github-sync-main
- **Commit**: fd81caf (feat: implement Square UI layout system for dashboard)

---

## 后续步骤

部署完成后：

1. ✅ 验证所有功能正常
2. ✅ 监控性能指标（加载时间、响应速度）
3. ✅ 收集用户反馈
4. ✅ 记录问题和改进建议
5. ✅ 规划 Phase 2 功能（图表集成、其他页面迁移）

---

**部署准备状态**: ✅ 就绪
**风险等级**: 🟢 低（可快速回滚）
**预期影响**: 🎯 前端 UI 体验显著提升
