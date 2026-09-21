# SynthAPI 新手完整教程

## 1. 创建 API Key

登录 SynthAPI 控制台，打开“API 密钥”页面并创建密钥。密钥只显示给你本人，请保存到密码管理器或服务端环境变量，不要放在浏览器代码、截图或公开仓库中。

## 2. 设置地址并确认模型

OpenAI 兼容客户端的 Base URL 填写：

`https://synthapi.asia/v1`

然后先请求模型列表：

```bash
curl https://synthapi.asia/v1/models \
  -H "Authorization: Bearer <你的 API Key>"
```

从返回结果中复制一个可用的 `id`，作为后续请求的 `model`。

## 3. 发出第一条文字请求

```bash
curl https://synthapi.asia/v1/chat/completions \
  -H "Authorization: Bearer <你的 API Key>" \
  -H "Content-Type: application/json" \
  -d '{"model":"<模型 ID>","messages":[{"role":"user","content":"你好，请用一句话介绍 SynthAPI"}]}'
```

收到 `200` 和 `choices` 后，说明认证、线路和模型都已配置正确。

## 4. 图像和视频任务

图像使用 `/v1/images/generations`，视频使用 `/v1/videos/generations`。异步接口会先返回 `task_id`，请保存它，再请求 `/v1/tasks/{task_id}` 查询 `submitted`、`processing`、`completed` 或 `failed` 状态。不要因为第一次请求超时就重复提交任务。

## 5. 查看费用和排查问题

在控制台的使用日志中核对 Token、图片规格、视频任务和最终费用。遇到错误时先看 HTTP 状态码：`401/403` 检查密钥和权限，`404` 检查模型或路径，`429` 检查频率限制，`5xx` 使用 request id 联系管理员。

## 安全清单

- 不在前端公开真实 API Key。
- 不把密钥提交到 Git。
- 为不同应用创建不同密钥，需要时及时禁用或轮换。
- 图像、视频结果 URL 可能有有效期，请及时下载或转存。
