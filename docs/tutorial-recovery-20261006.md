# V5 教程、助手知识库与支付页修复（2026-10-06）

## 故障与部署

恢复原版 UI 的发布包缺少 V5 MP4、DOCX、SRT；文档组件还引用 V2。原始 V5 文件保存在生产 `/root`，此次使用原文件恢复，没有重新制作或替换教程截图。

- 前端由上海独立目录 `SynthApi-tutorial-recovery-20261006/web/default` 构建。
- 生产静态发布：`/var/www/synthapi-web/releases/20261006-v5-payment-recovery`。
- 主 JS：`index.fc0f70b493.js`；主 CSS 与先前版本完全相同：`index.fdf924c474.css`。
- 新入口 HTML SHA256：`faad644100f8d186f0b32dc9b4934143df4a8e91d9022dcf7a9d5b47e57b1091`。
- Go 二进制保持 SHA256 `3392d19620289e0b4ad8a1e486e3af42086484f7a5a83a66509708dd2e474711`，没有在生产机编译或重启 Go。
- 保留支付宝双配置页面及当前 UI 风格，不覆盖上海共享前端。

## 资源持久化

新手页：`/docs#beginner-guide`。当前文件名：

- `/tutorials/synthapi-cc-switch-v5-gpt6sol.mp4`
- `/tutorials/synthapi-cc-switch-v5-gpt6sol.docx`
- `/tutorials/synthapi-cc-switch-v5-gpt6sol.srt`

Nginx `/etc/nginx/snippets/synthapi-tutorials.conf` 将 `/tutorials/` 指向独立的 `/var/www/synthapi-resources`，由 `synthapi-web-static.conf` include。前端切换、回退时不删除此目录。旧 V2 和简写 V5 地址只重定向到真实 V5 文件，不再提供 V2 内容。未知资源返回 404。

源码 `web/default/public/tutorials` 也保存 V5，后续构建需保留。发布前运行：

```bash
python3 scripts/maintenance/verify-tutorial-resources.py web/default/dist
```

V5 视频为 H.264/AAC、1920×1080、294.09 秒。DOCX ZIP 完整，23 个嵌入图片资源。三个文件的 SHA256 与原文件逐一一致。此次未重新排版 DOCX。

## 助手知识库

数据库及向量目录独立于前端发布。数据库完整性检查通过。修复前后用户对话 9 条、消息轮次 17 条、工具调用 26 条、工单 10 条一致。

发现独立问题：助手聊天密钥固定在 Plus线路一，而 `text-embedding-3-small` 只在 Pro常规有路由，导致知识入库 503。新增专用嵌入密钥，仅允许该嵌入模型；通过服务配置 `SYNTHAPI_EMBEDDING_API_KEY` 加载。主聊天、视觉密钥以及 725 渠道映射不变。

支持服务发布：`/opt/synthapi-support/releases/support-agent-20261006-v5-recovery`。维护源码：上海 `sightflow-desktop-agent/server`。V5 文档经管理员知识接口入库，9 个知识片段、9 个向量；V2 条目设置过期，保留审计记录但不参与检索。当前 seed 改为 V5，旧 seed 移出索引目录。

流式聊天补齐与非流式相同的不可用模型备用逻辑：主模型明确不可用且尚未输出正文时，使用已配置的备用模型；正文已开始后不切换模型。此逻辑只属于助手服务，不修改普通用户模型请求。

上海 34 项助手测试通过。真实模型诊断用生产知识库的隔离副本，未创建生产对话、工单或邮件。普通回答完成混合检索并引用 V5；流式测试在嵌入超时时走现有关键词降级，仍返回 V5 图文、视频链接及 162 次流式更新。主模型本次返回 404，备用模型完成回答。

## 支付页

支付名称统一为“支付宝”，微信支付按类型排首位。两套支付宝档案最低额均为 0.1 元，第二套从 1 元调整至 0.1；保存过程中不调用激活接口。两套密钥和版本保留，历史订单继续用原版本。

线上金额预览 0.1 返回 0.10。生产下单接口生成 RSA2 签名的 0.10 元测试订单，未打开收银台、未付款、未记账，已按精确订单条件关闭为 expired。详细测试记录保存在受保护的部署备份中。

## 构建与验证

TypeScript 检查通过。恢复源码中同时修复三个旧类型问题：未定义的行组件 `isAdmin`、未使用的 `SidebarTrigger` 导入、缺少 `hast` 直接类型依赖（改用 Shiki 回调类型推导）。

修改文件 Prettier 通过。原 ESLint 配置报告四个既有 Hooks 规则问题（同步 Effect 设置状态、渲染时读取 Date.now）；未改变这些已有流程或全局规则，排除这两个既有规则后其余修改文件检查通过。生产构建成功，333 个产物哈希与上海一致。

Chrome CDP 在主站和 admin 站完成真实视频播放验证、V5 按钮检查、390px 手机横向溢出检查、Tab 内容切换及刷新定位检查，无运行时异常。技术支持二维码存在。

备份、完整产物清单、构建日志、浏览器截图、检索结果：生产 `/home/ubuntu/demo/SynthApi-build-backups/tutorial-recovery-20261006`。目录中的环境配置备份为 0600，禁止公开或提交。

回滚仅将对应 `current` 符号链接原子切回备份记录的发布目录；助手回滚后重启 `synthapi-support.service`。保留持久教程资源和数据库，不用前端回滚覆盖知识库。
