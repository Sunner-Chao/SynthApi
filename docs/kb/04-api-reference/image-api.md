# 图像生成 API

> **摘要**：SynthAPI 通过 `POST /v1/images/generations` 提供统一生图入口。异步图像模型会返回 `task_id`，客户端应通过 `GET /v1/tasks/{task_id}` 轮询结果。

## 接口概览

| 方法 | 路径 | 用途 |
|---|---|---|
| `POST` | `/v1/images/generations` | 提交文生图或图生图请求 |
| `GET` | `/v1/tasks/{task_id}` | 统一异步任务查询 |
| `GET` | `/v1/images/generations/{task_id}` | OpenAI 风格的生图任务查询 |
| `GET` | `/v1/images/generations/{task_id}/content` | 通过 SynthAPI 获取图片内容 |

所有路径都需要同一枚 API Key：

```http
Authorization: Bearer sk-your-api-key
```

## 真 4K 生成

图像聚合线路的 GPT-Image-2 用 `size` 控制比例，用 `resolution` 控制像素档位。只传 `size` 而不传 `resolution` 时，默认仍为 1K。

```bash
curl https://synthapi.asia/v1/images/generations \
  -H "Authorization: Bearer sk-your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "星空下的古老城堡，电影级光影",
    "size": "16:9",
    "resolution": "4k",
    "n": 1
  }'
```

GPT-Image-2 的常用像素对应关系：

| 比例 | 1K | 2K | 4K |
|---|---:|---:|---:|
| `1:1` | 1024x1024 | 2048x2048 | 2880x2880 |
| `16:9` | 1536x864 / 1672x941 | 2048x1152 | 3840x2160 |
| `9:16` | 864x1536 / 941x1672 | 1152x2048 | 2160x3840 |
| `4:3` | 1024x768 | 2048x1536 | 3312x2480 |
| `3:4` | 768x1024 | 1536x2048 | 2480x3312 |

## 参考图与图生图

`image_urls` 支持公网 URL 和 Base64 Data URI 混合传入。GPT-Image-2 最多支持 16 张参考图，单张最大 20 MiB；其他模型以各自上游限制为准。

```json
{
  "model": "gpt-image-2",
  "prompt": "将参考图改为水彩海报",
  "size": "4:3",
  "resolution": "2k",
  "image_urls": [
    "https://example.com/reference.png",
    "data:image/png;base64,iVBORw0KGgo..."
  ]
}
```

## 异步任务流程

### 1. 读取任务 ID

SynthAPI 保留任务的原始 `data` 结构，同时在根级补充 `task_id`、`id` 和 `status`，便于各类客户端解析：

```json
{
  "code": 200,
  "task_id": "task_xxx",
  "id": "task_xxx",
  "status": "submitted",
  "data": [
    {
      "status": "submitted",
      "task_id": "task_xxx"
    }
  ]
}
```

### 2. 轮询任务

建议每 3-5 秒轮询一次，直到 `completed` 或 `failed`：

```bash
curl https://synthapi.asia/v1/tasks/task_xxx \
  -H "Authorization: Bearer sk-your-api-key"
```

```json
{
  "code": 200,
  "data": {
    "id": "task_xxx",
    "task_id": "task_xxx",
    "status": "completed",
    "progress": 100,
    "result": {
      "images": [
        {
          "url": ["https://..."]
        }
      ]
    }
  }
}
```

| 状态 | 含义 |
|---|---|
| `submitted` | 已提交，等待上游处理 |
| `processing` | 正在生成 |
| `completed` | 生成成功，读取 `data.result.images` |
| `failed` | 生成失败，读取 `data.error.message` |

SynthAPI 会保留任务状态与结果索引，生图工作台会展示最近成功记录。上游图片 URL 可能在 24-72 小时后过期，需长期保存时应及时下载。

## 图像模型目录

以下模型已纳入 SynthAPI 的请求转发与异步任务兼容层。实际是否出现在 `GET /v1/models` 中，取决于管理员渠道配置、分组与用户模型权限。

| 系列 | 模型 |
|---|---|
| Google | `gemini-2.5-flash-image-preview`, `gemini-3-pro-image-preview`, `gemini-3.1-flash-image-preview`, `gemini-3.1-flash-lite-image`, `imagen-4.0-apimart` |
| OpenAI | `gpt-image-2`, `gpt-image-2-official` |
| Seedream | `seedream-4.0`, `seedream-4.5`, `seedream-5-0-lite`, `seedream-5-0-pro` |
| FLUX | `flux-kontext-pro`, `flux-kontext-max`, `flux-2-flex`, `flux-2-pro`, `flux-2-max` |
| Qwen | `qwen-image-2.0`, `qwen-image-2.0-pro`, `qwen-image-3.0`, `qwen-image-3.0-pro` |
| Grok | `grok-imagine-1.5-apimart`, `grok-imagine-image`, `grok-imagine-image-quality`, `grok-imagine-2.0-ext`, `grok-imagine-image-2.0` |
| Wan / Z-Image | `wan2.7-image`, `wan2.7-image-pro`, `z-image-turbo` |

当前聚合线路不提供 GPT-Image 1 / 1.5 模型。

## 故障排查

### 无法获取 task_id

- 确认请求路径是 `/v1/images/generations`。
- 检查响应根级 `task_id` 或 `data[0].task_id`。
- 上游返回 HTTP 202 也是成功提交，不应当作错误。

### 任务一直无结果

- 不要猜测其他任务路径；统一任务查询路径是 `/v1/tasks/{task_id}`。
- 确认任务状态为 `submitted` 或 `processing`，并在超时前持续轮询。
- 如果返回 `failed`，查看 `data.error.message`。

### 要求 4K 却只有约 1K

必须同时传入比例与分辨率档位，例如：

```json
{
  "size": "16:9",
  "resolution": "4k"
}
```

只传 `3840x2160` 给不支持精确像素的其他上游，可能会被映射回 1K 比例图。
