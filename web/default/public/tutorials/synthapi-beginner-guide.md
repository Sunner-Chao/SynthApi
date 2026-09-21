# SynthAPI × CC Switch 新手手把手教程

这份教程以 CC Switch 为主线，适合第一次使用 SynthAPI 的用户。完成后，你可以在同一个 CC Switch 中保存 SynthAPI，并在 Claude Code、Codex、Gemini CLI 等工具之间切换供应商。

## 开始前准备

- 一个 SynthAPI API Key。登录 SynthAPI 控制台，在“API 密钥”中创建并复制。
- CC Switch 官方客户端。请从 [ccswitch.io](https://ccswitch.io) 或 [GitHub Releases](https://github.com/farion1231/cc-switch/releases/latest) 下载。
- 一个可用模型 ID。配置后优先从 `GET /v1/models` 的返回结果中复制，不要凭记忆猜模型名称。

> 安全提示：API Key 只在 CC Switch 本地填写。不要把真实密钥放入网页、截图、视频、浏览器历史、公开仓库或深链接。

## 第 1 步：安装 CC Switch

1. 打开官方 Releases 页面，下载与你的系统对应的安装包。
2. 安装并启动 CC Switch，确认能够看到供应商列表或应用切换页面。
3. 如果系统提示来自未知开发者，请先核对下载地址是否为官方域名或官方 GitHub 仓库，不要使用第三方打包版本。

## 第 2 步：在 CC Switch 添加 SynthAPI

### 方式 A：手动添加

1. 在 CC Switch 点击右上角的“+”或“添加供应商”。
2. 选择“自定义”或“OpenAI Compatible”预设，供应商名称填写 `SynthAPI`。
3. 按使用的工具填写端点：

| 工具 | 协议 | Base URL / Endpoint | 备注 |
| --- | --- | --- | --- |
| Claude Code | Anthropic Messages | `https://synthapi.asia/anthropic/v1` | 地址已包含 `/anthropic/v1`，不要重复追加路径 |
| Codex | OpenAI Responses | `https://synthapi.asia/v1` | 选择 Responses 协议 |
| Gemini CLI | CC Switch Gemini 或自定义供应商 | `https://synthapi.asia` | 如果客户端要求 OpenAI 兼容地址，改填 `https://synthapi.asia/v1` |

4. API Key 粘贴刚刚创建的密钥。
5. 模型填写从模型列表复制的 ID。Claude Code 可以把同一个 ID 填入主模型、Sonnet、Haiku 或 Opus 字段；实际可用性以模型列表为准。
6. 点击“保存”，再点击 SynthAPI 卡片上的“启用”。

### 方式 B：使用 `ccswitch://` 深链接导入

这是推荐给新手的方式，可以减少手动填写错误。

1. 打开 [CC Switch 官方深链接生成器](https://farion1231.github.io/cc-switch/deplink.html)。
2. 选择目标应用，填写供应商名称、端点和模型 ID。
3. API Key 留空，或者只在本地生成链接后立即导入。不要把真实密钥复制到公开网页或聊天中。
4. 点击生成并打开 `ccswitch://v1/import...` 链接。系统会唤起 CC Switch，确认导入内容后保存。
5. 导入后回到 CC Switch，检查 API Key 是否已经在本地填写，再点击“启用”。

示例模板（仅用于说明格式，不含真实密钥）：

```text
ccswitch://v1/import?resource=provider&app=codex&name=SynthAPI&endpoint=https%3A%2F%2Fsynthapi.asia%2Fv1&apiKey=&model=MODEL_ID&enabled=true
```

更多字段和导入规则请查看 [CC Switch 中文添加供应商说明](https://github.com/farion1231/cc-switch/blob/main/docs/user-manual/zh/2-providers/2.1-add.md)。

## 第 3 步：分别配置三个常用工具

### Claude Code

在 CC Switch 中选择 Claude 应用，使用 Anthropic Messages 供应商并启用 SynthAPI。确认端点为 `https://synthapi.asia/anthropic/v1`。关闭正在运行的 Claude Code 终端后重新打开，再发起一条简单请求。

### Codex

在 CC Switch 中选择 Codex 应用，选择 OpenAI Responses 供应商，Base URL 填 `https://synthapi.asia/v1`。启用后关闭旧终端并重新打开，让 Codex 读取新的环境配置。

### Gemini CLI

在 CC Switch 中选择 Gemini 应用，优先使用 CC Switch 的 Gemini 供应商字段。如果该版本要求自定义 OpenAI 兼容供应商，填写 `https://synthapi.asia/v1`，再选择模型列表中的模型 ID。启用后重新打开 Gemini CLI 终端。

## 第 4 步：切换、重启和验证

- 在 CC Switch 中点击另一张供应商卡片的“启用”，即可切换线路。
- 已经打开的 CLI 进程可能仍保留旧环境变量。切换后建议关闭当前终端并重新打开；不要同时运行两个使用不同配置的旧进程。
- 先验证模型列表，再验证文字请求：

```bash
curl https://synthapi.asia/v1/models \
  -H "Authorization: Bearer <你的 API Key>"
```

从返回 JSON 中复制一个实际的 `id`，然后发送最小请求：

```bash
curl https://synthapi.asia/v1/chat/completions \
  -H "Authorization: Bearer <你的 API Key>" \
  -H "Content-Type: application/json" \
  -d '{"model":"<模型 ID>","messages":[{"role":"user","content":"你好，请用一句话介绍 SynthAPI"}]}'
```

返回 HTTP `200` 且包含 `choices`，通常说明密钥、端点和模型均已生效。Codex 等 Responses 客户端也可以直接使用 `https://synthapi.asia/v1/responses`。

## 第 5 步：图像、视频与用量

图像使用 `/v1/images/generations`，视频使用 `/v1/videos/generations`。异步任务会返回 `task_id`，请保存任务 ID 并查询 `/v1/tasks/{task_id}`，不要因为一次超时就重复提交相同任务。完成后在 SynthAPI 使用日志中核对模型、Token、图片规格、视频任务和费用。

## 常见问题

| 现象 | 处理方式 |
| --- | --- |
| `401` 或 `403` | 检查 API Key 是否复制完整、是否已启用，确认没有把测试密钥和生产密钥混用 |
| `404` | 检查应用协议和 Base URL；Anthropic 使用 `/anthropic/v1`，OpenAI 兼容使用 `/v1` |
| `429` | 降低并发或请求频率，稍后重试，并检查账户额度 |
| `5xx` | 记录时间、请求 ID 和模型 ID，先重试一次，再联系管理员 |
| 切换后仍使用旧线路 | 关闭旧 CLI 和终端窗口，重新打开后再验证 `/v1/models` |
| 深链接没有唤起 CC Switch | 先安装并启动 CC Switch，再复制链接到浏览器；也可以改用手动添加方式 |

## 密钥安全清单

- 不在前端代码、截图、视频、公开 Issue 或 Git 提交中出现真实 API Key。
- 不把包含 `apiKey=` 的深链接发到群聊或公开网页。
- 为不同项目创建不同密钥，发现泄露后立即禁用并轮换。
- 图像和视频结果 URL 可能有有效期，请及时下载或转存。

## 视频手把手教程方案

视频按下面顺序录制，画面只使用演示密钥或打码后的界面：

1. 从官方地址安装 CC Switch。
2. 在 SynthAPI 创建 API Key，并展示如何安全保存。
3. 手动添加 SynthAPI，再演示官方深链接导入。
4. 依次选择 Claude Code、Codex、Gemini CLI，展示三种端点和协议差异。
5. 点击“启用”，关闭并重新打开对应终端。
6. 使用 `/v1/models` 和最小文字请求验证。
7. 切换回另一家供应商，演示失败时的状态码排查。

正式视频发布后，可从文档页的“观看视频教程”入口打开；在此之前请使用本页图文教程和官方 CC Switch 文档。
