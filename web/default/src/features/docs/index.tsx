/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  KeyRound,
  MessageSquareText,
  Search,
  Server,
  ShieldCheck,
  Video,
  Zap,
} from 'lucide-react'
import { FAST_API_BASE_URL, FAST_OPENAI_BASE_URL } from '@/lib/api-routes'
import { PublicLayout } from '@/components/layout'
import './styles.css'

const siteBaseUrl = 'https://synthapi.asia'
const openAiBaseUrl = `${siteBaseUrl}/v1`
const anthropicBaseUrl = `${siteBaseUrl}/anthropic/v1`

type DocsTopic = 'overview' | 'text' | 'image' | 'video' | 'tasks'
type DocsSection =
  | 'overview'
  | 'authentication'
  | 'base-url'
  | 'models'
  | 'chat-completions'
  | 'responses'
  | 'claude-messages'
  | 'image-generation'
  | 'image-gemini'
  | 'image-seedream'
  | 'image-flux'
  | 'image-other'
  | 'image-task-query'
  | 'video-api'
  | 'task-query'
  | 'billing'
  | 'errors'

const navGroups = [
  {
    title: '开始使用',
    icon: BookOpen,
    items: [
      { id: 'overview', label: '文档概览', topic: 'overview' },
      { id: 'authentication', label: '身份认证', topic: 'overview' },
      { id: 'base-url', label: '线路与 Base URL', topic: 'overview' },
      { id: 'models', label: '模型列表', topic: 'overview' },
    ],
  },
  {
    title: '文字系列',
    icon: MessageSquareText,
    items: [
      { id: 'chat-completions', label: 'Chat Completions', topic: 'text' },
      { id: 'responses', label: 'Responses', topic: 'text' },
      { id: 'claude-messages', label: 'Claude Messages', topic: 'text' },
    ],
  },
  {
    title: '图像系列',
    icon: ImageIcon,
    items: [
      { id: 'image-generation', label: '图像模型聚合', topic: 'image' },
      { id: 'image-gemini', label: 'Gemini / Imagen', topic: 'image' },
      { id: 'image-seedream', label: 'Seedream', topic: 'image' },
      { id: 'image-flux', label: 'FLUX', topic: 'image' },
      { id: 'image-other', label: 'Qwen / Grok / Wan', topic: 'image' },
      { id: 'image-task-query', label: '图像任务查询', topic: 'tasks' },
    ],
  },
  {
    title: '视频模型聚合接口',
    icon: Video,
    items: [
      { id: 'video-api', label: '视频模型聚合接口', topic: 'video' },
      { id: 'task-query', label: '异步任务状态', topic: 'tasks' },
    ],
  },
  {
    title: '平台说明',
    icon: ShieldCheck,
    items: [
      { id: 'billing', label: '计费与使用日志', topic: 'overview' },
      { id: 'errors', label: '错误与排查', topic: 'overview' },
    ],
  },
] as const satisfies ReadonlyArray<{
  title: string
  icon: typeof BookOpen
  items: ReadonlyArray<{ id: DocsSection; label: string; topic: DocsTopic }>
}>

const imageParameters = [
  {
    name: 'model',
    type: 'string',
    required: true,
    description:
      '要调用的模型。线路二使用 gpt-image-2；密钥所在分组必须包含该模型。可通过 GET /v1/models 查看可用清单。',
    example: 'gpt-image-2',
  },
  {
    name: 'prompt',
    type: 'string',
    required: true,
    description:
      '生成要求。把主体、构图、材质、镜头和光线写清楚；不需要的内容也可直接写在提示词中。',
    example: '一只橘猫坐在窗台上看夕阳，水彩画风格',
  },
  {
    name: 'n',
    type: 'integer',
    required: false,
    description: '一次生成几张图。请传 JSON 数字；数量上限由所选模型决定。',
    example: '1',
  },
  {
    name: 'size',
    type: 'string',
    required: false,
    description:
      '画幅比例。图像聚合线路可传 1:1、16:9、9:16 等比例；部分兼容模型也接受 WIDTHxHEIGHT。',
    options: ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3'],
  },
  {
    name: 'resolution',
    type: 'string',
    required: false,
    description:
      '输出清晰度或像素档位。可用值随模型变化，例如 0.5K–4K、1MP–4MP 或 1K–3K；size: 16:9 只控制比例。',
    options: [
      '0.5k',
      '1k',
      '1.5k',
      '2k',
      '3k',
      '4k',
      '1mp',
      '2mp',
      '3mp',
      '4mp',
    ],
  },
  {
    name: 'aspect_ratio',
    type: 'string',
    required: false,
    description:
      'Grok 系模型使用的画幅字段。常用值与 size 相同；工作台会根据所选模型自动选择正确字段。',
    example: '16:9',
  },
  {
    name: 'quality',
    type: 'string',
    required: false,
    description:
      '质量档位。当前主要用于 grok-imagine-image-2.0 的 low / medium；带参考图时不要传。',
    options: ['low', 'medium'],
  },
  {
    name: 'output_format',
    type: 'string',
    required: false,
    description: '支持该字段的模型可输出 JPEG、PNG 或 WEBP。',
    options: ['jpeg', 'png', 'webp'],
  },
  {
    name: 'seed / negative_prompt',
    type: 'integer / string',
    required: false,
    description:
      '随机种子用于复现构图；反向提示词用于排除不需要的内容。仅在模型支持时传入。',
    example: '{ "seed": 1024, "negative_prompt": "模糊、文字" }',
  },
  {
    name: 'model switches',
    type: 'boolean',
    required: false,
    description:
      '模型专属开关：prompt_extend、prompt_upsampling、google_search、thinking_mode、enable_sequential。',
    example: '{ "prompt_extend": true }',
  },
  {
    name: 'image_urls',
    type: 'string[]',
    required: false,
    description:
      '参考图数组。公网 URL 和 data:image/...;base64,... 可以混用。GPT-Image-2 最多 16 张，单张不超过 20 MiB。',
    example: '["https://example.com/reference.png"]',
  },
  {
    name: 'extra fields',
    type: 'object',
    required: false,
    description:
      'seed、negative_prompt、steps、水印等模型专属字段。网关不改写字段值，是否生效取决于所选模型。',
    example: '{ "seed": 1024 }',
  },
] as const

const imageFamilies = [
  {
    family: 'OpenAI',
    models: ['gpt-image-2', 'gpt-image-2-official'],
    accent: 'green',
  },
  {
    family: 'Google',
    models: [
      'gemini-2.5-flash-image-preview',
      'gemini-3-pro-image-preview',
      'gemini-3.1-flash-image-preview',
      'gemini-3.1-flash-lite-image',
      'imagen-4.0-apimart',
    ],
    accent: 'blue',
  },
  {
    family: 'Seedream',
    models: [
      'seedream-4.0',
      'seedream-4.5',
      'seedream-5-0-lite',
      'seedream-5-0-pro',
    ],
    accent: 'orange',
  },
  {
    family: 'FLUX',
    models: [
      'flux-kontext-pro',
      'flux-kontext-max',
      'flux-2-flex',
      'flux-2-pro',
      'flux-2-max',
    ],
    accent: 'violet',
  },
  {
    family: 'Qwen / Grok / Wan',
    models: [
      'qwen-image-2.0',
      'qwen-image-2.0-pro',
      'qwen-image-3.0',
      'qwen-image-3.0-pro',
      'grok-imagine-1.5-apimart',
      'grok-imagine-2.0-ext',
      'grok-imagine-image',
      'grok-imagine-image-2.0',
      'grok-imagine-image-quality',
      'wan2.7-image',
      'wan2.7-image-pro',
      'z-image-turbo',
    ],
    accent: 'pink',
  },
] as const

const videoFamilies = [
  {
    family: 'Sora',
    models: ['sora-2', 'sora-2-pro', 'sora-2-preview'],
    accent: 'green',
  },
  {
    family: 'Veo',
    models: [
      'veo3.1-fast',
      'veo3.1-fast-official',
      'veo3.1-quality',
      'veo3.1-quality-official',
    ],
    accent: 'blue',
  },
  {
    family: 'Kling',
    models: [
      'kling-3.0-turbo',
      'kling-v2-6',
      'kling-v2-6-motion-control',
      'kling-v3',
      'kling-v3-motion-control',
      'kling-v3-omni',
      'kling-video-o1',
    ],
    accent: 'violet',
  },
  {
    family: 'Seedance',
    models: [
      'seedance-1-0-pro-fast',
      'seedance-1-0-pro-quality',
      'seedance-1-5-pro',
      'seedance-2.0',
      'seedance-2.0-fast',
      'seedance-2.0-mini',
      'seedance-2.5',
    ],
    accent: 'orange',
  },
  {
    family: 'Hailuo / Wan',
    models: [
      'minimax-hailuo-02',
      'minimax-hailuo-2.3',
      'minimax-hailuo-2.3-fast',
      'wan2.5-preview',
      'wan2.6',
      'wan2.6-i2v',
      'wan2.6-i2v-flash',
      'wan2.7',
      'wan2.7-r2v',
      'wan2.7-videoedit',
      'wan3.0-video',
    ],
    accent: 'pink',
  },
] as const

const topicMeta: Record<
  DocsTopic,
  {
    label: string
    eyebrow: string
    title: string
    description: string
    endpoint: string
    method: 'GET' | 'POST'
    status: string
  }
> = {
  overview: {
    label: '文档概览',
    eyebrow: 'API REFERENCE',
    title: 'SynthAPI 接口参考',
    description:
      '文字、图像和视频接口都在这里。选一个主题，照着示例发出第一条请求。',
    endpoint: '/v1/models',
    method: 'GET',
    status: '200',
  },
  text: {
    label: '文字模型',
    eyebrow: 'TEXT MODELS',
    title: '文字模型 API',
    description:
      '适合聊天、推理和工具调用；可选择普通返回或流式返回。',
    endpoint: '/v1/chat/completions',
    method: 'POST',
    status: '200',
  },
  image: {
    label: '图像模型',
    eyebrow: 'IMAGE MODELS',
    title: '图像模型 API',
    description:
      '使用统一的图片接口生成或编辑图片，能用哪些参数以所选模型为准。',
    endpoint: '/v1/images/generations',
    method: 'POST',
    status: '200',
  },
  video: {
    label: '视频模型聚合接口',
    eyebrow: 'VIDEO MODELS',
    title: '视频模型聚合接口',
    description:
      '先提交任务拿到 task_id，再查询状态和视频地址。',
    endpoint: '/v1/videos/generations',
    method: 'POST',
    status: '200',
  },
  tasks: {
    label: '任务状态',
    eyebrow: 'ASYNC TASKS',
    title: '异步任务 API',
    description:
      '拿到 task_id 后，用这个接口查看排队、生成、完成或失败。',
    endpoint: '/v1/tasks/{task_id}',
    method: 'GET',
    status: '200',
  },
}

const defaultSectionForTopic: Record<DocsTopic, DocsSection> = {
  overview: 'overview',
  text: 'chat-completions',
  image: 'image-generation',
  video: 'video-api',
  tasks: 'task-query',
}

const allSections = new Set<DocsSection>(
  navGroups.flatMap((group) => group.items.map((item) => item.id))
)

const topicForSection = (section: DocsSection): DocsTopic => {
  for (const group of navGroups) {
    const item = group.items.find((candidate) => candidate.id === section)
    if (item) return item.topic
  }
  return 'overview'
}

const sectionMeta: Record<
  DocsSection,
  {
    label: string
    eyebrow: string
    title: string
    description: string
    endpoint: string
    method: 'GET' | 'POST'
    status: string
  }
> = {
  overview: topicMeta.overview,
  authentication: {
    label: '身份认证',
    eyebrow: 'AUTHENTICATION',
    title: '使用 API Key 完成认证',
    description: '所有模型接口共用 Bearer Token。密钥只应保存在服务端或受保护的客户端配置中。',
    endpoint: '/v1/models',
    method: 'GET',
    status: '200',
  },
  'base-url': {
    label: '线路与 Base URL',
    eyebrow: 'BASE URL',
    title: '选择合适的接入线路',
    description: '不同客户端只需要填写对应协议的根地址。地址后面不要再拼接 /chat/completions 或 /messages。',
    endpoint: '/v1/models',
    method: 'GET',
    status: '200',
  },
  models: {
    label: '模型列表',
    eyebrow: 'MODEL LIST',
    title: '先用模型列表确认能调用什么',
    description: 'GET /v1/models 会返回当前 API Key、分组和权限下可用的模型 ID。它只查清单，不会发起生成请求。',
    endpoint: '/v1/models',
    method: 'GET',
    status: '200',
  },
  'chat-completions': {
    ...topicMeta.text,
    label: 'Chat Completions',
    title: 'OpenAI Chat Completions API',
  },
  responses: {
    ...topicMeta.text,
    label: 'Responses',
    title: 'OpenAI Responses API',
    description: '面向推理、工具调用和多轮上下文的统一响应接口，支持 SSE 流式增量事件。',
    endpoint: '/v1/responses',
  },
  'claude-messages': {
    ...topicMeta.text,
    label: 'Claude Messages',
    title: 'Anthropic Messages API',
    description: '兼容 Claude SDK 与 Anthropic Messages 请求格式，通过 x-api-key 或 Bearer Token 认证。',
    endpoint: '/v1/messages',
  },
  'image-generation': topicMeta.image,
  'image-gemini': {
    ...topicMeta.image,
    label: 'Gemini / Imagen',
    title: 'Gemini 与 Imagen 图像模型',
    description: '适合高质量文生图、参考图编辑与多模态构图，参数能力以具体模型为准。',
  },
  'image-seedream': {
    ...topicMeta.image,
    label: 'Seedream',
    title: 'Seedream 图像模型',
    description: '覆盖快速生成与高质量档位，支持常用比例、分辨率和参考图参数。',
  },
  'image-flux': {
    ...topicMeta.image,
    label: 'FLUX',
    title: 'FLUX 图像模型',
    description: '提供 Kontext、Flex、Pro 与 Max 系列，适用于文本渲染、风格控制和图像编辑。',
  },
  'image-other': {
    ...topicMeta.image,
    label: 'Qwen / Grok / Wan',
    title: 'Qwen、Grok 与 Wan 图像模型',
    description: '聚合多种生成路线，可按速度、质量、分辨率和模型专属参数选择。',
  },
  'image-task-query': {
    ...topicMeta.tasks,
    label: '图像任务查询',
    title: '查询异步图像任务',
  },
  'video-api': topicMeta.video,
  'task-query': topicMeta.tasks,
  billing: {
    label: '计费与使用日志',
    eyebrow: 'BILLING',
    title: '计费与使用日志',
    description: '不同模型按 Token、分辨率、张数或任务规格计费，最终结算可在使用日志中核对。',
    endpoint: '/api/log/self',
    method: 'GET',
    status: '200',
  },
  errors: {
    label: '错误与排查',
    eyebrow: 'TROUBLESHOOTING',
    title: '错误码与请求排查',
    description: '先依据 HTTP 状态、request id 和使用日志定位认证、余额、路由或上游错误。',
    endpoint: '/api/status',
    method: 'GET',
    status: '200',
  },
}

const codeSamples = {
  cURL: `curl --request POST \\
  --url ${openAiBaseUrl}/images/generations \\
  --header 'Authorization: Bearer <token>' \\
  --header 'Content-Type: application/json' \\
  --data '{
    "model": "gpt-image-2",
    "prompt": "一只橘猫坐在窗台上看夕阳，水彩画风格",
    "n": 1,
    "size": "16:9",
    "resolution": "2k"
  }'`,
  Python: `from openai import OpenAI

client = OpenAI(
    api_key="<token>",
    base_url="${openAiBaseUrl}"
)

result = client.images.generate(
    model="gpt-image-2",
    prompt="一只橘猫坐在窗台上看夕阳，水彩画风格",
    size="16:9",
    extra_body={"resolution": "2k"}
)

print(result)`,
  JavaScript: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "<token>",
  baseURL: "${openAiBaseUrl}",
});

const result = await client.images.generate({
  model: "gpt-image-2",
  prompt: "一只橘猫坐在窗台上看夕阳，水彩画风格",
  size: "16:9",
  resolution: "2k",
  n: 1,
});

console.log(result);`,
  Go:
    `payload := strings.NewReader(` +
    '`' +
    `{
  "model": "gpt-image-2",
  "prompt": "一只橘猫坐在窗台上看夕阳，水彩画风格",
  "size": "16:9",
  "resolution": "2k",
  "n": 1
}` +
    '`' +
    `)

req, _ := http.NewRequest(
  http.MethodPost,
  "${openAiBaseUrl}/images/generations",
  payload,
)
req.Header.Set("Authorization", "Bearer <token>")
req.Header.Set("Content-Type", "application/json")`,
}

const topicCodeSamples: Record<Exclude<DocsTopic, 'overview'>, typeof codeSamples> = {
  image: codeSamples,
  text: {
    cURL: `curl --request POST \\
  --url ${openAiBaseUrl}/chat/completions \\
  --header 'Authorization: Bearer <token>' \\
  --header 'Content-Type: application/json' \\
  --data '{
    "model": "gpt-5.6-sol",
    "messages": [{"role": "user", "content": "你好，请用一句话介绍 SynthAPI"}],
    "stream": true
  }'`,
    Python: `from openai import OpenAI

client = OpenAI(api_key="<token>", base_url="${openAiBaseUrl}")
response = client.chat.completions.create(
    model="gpt-5.6-sol",
    messages=[{"role": "user", "content": "你好，请用一句话介绍 SynthAPI"}],
    stream=True,
)
for chunk in response:
    print(chunk.choices[0].delta.content or "", end="")`,
    JavaScript: `import OpenAI from "openai";

const client = new OpenAI({ apiKey: "<token>", baseURL: "${openAiBaseUrl}" });
const stream = await client.chat.completions.create({
  model: "gpt-5.6-sol",
  messages: [{ role: "user", content: "你好，请用一句话介绍 SynthAPI" }],
  stream: true,
});
for await (const chunk of stream) console.log(chunk.choices[0]?.delta?.content || "");`,
    Go: `payload := strings.NewReader(\`{"model":"gpt-5.6-sol","messages":[{"role":"user","content":"你好，请用一句话介绍 SynthAPI"}],"stream":true}\`)
req, _ := http.NewRequest(http.MethodPost, "${openAiBaseUrl}/chat/completions", payload)
req.Header.Set("Authorization", "Bearer <token>")
req.Header.Set("Content-Type", "application/json")`,
  },
  video: {
    cURL: `curl --request POST \\
  --url ${openAiBaseUrl}/videos/generations \\
  --header 'Authorization: Bearer <token>' \\
  --header 'Content-Type: application/json' \\
  --data '{
    "model": "sora-2",
    "prompt": "一艘小船驶过雾中的海湾",
    "size": "1280x720",
    "seconds": "8"
  }'`,
    Python: `import requests

response = requests.post(
    "${openAiBaseUrl}/videos/generations",
    headers={"Authorization": "Bearer <token>"},
    json={"model": "sora-2", "prompt": "一艘小船驶过雾中的海湾", "seconds": "8"},
)
print(response.json()["id"])`,
    JavaScript: `const response = await fetch("${openAiBaseUrl}/videos/generations", {
  method: "POST",
  headers: { Authorization: "Bearer <token>", "Content-Type": "application/json" },
  body: JSON.stringify({ model: "sora-2", prompt: "一艘小船驶过雾中的海湾", seconds: "8" }),
});
console.log(await response.json());`,
    Go: `payload := strings.NewReader(\`{"model":"sora-2","prompt":"一艘小船驶过雾中的海湾","seconds":"8"}\`)
req, _ := http.NewRequest(http.MethodPost, "${openAiBaseUrl}/videos/generations", payload)
req.Header.Set("Authorization", "Bearer <token>")
req.Header.Set("Content-Type", "application/json")`,
  },
  tasks: {
    cURL: `curl --request GET \\
  --url ${openAiBaseUrl}/tasks/task_xxxxxxxxxx \\
  --header 'Authorization: Bearer <token>'`,
    Python: `import requests

task_id = "task_xxxxxxxxxx"
result = requests.get(
    f"${openAiBaseUrl}/tasks/{task_id}",
    headers={"Authorization": "Bearer <token>"},
)
print(result.json())`,
    JavaScript: `const taskId = "task_xxxxxxxxxx";
const result = await fetch("${openAiBaseUrl}/tasks/" + taskId, {
  headers: { Authorization: "Bearer <token>" },
});
console.log(await result.json());`,
    Go: `req, _ := http.NewRequest(http.MethodGet, "${openAiBaseUrl}/tasks/task_xxxxxxxxxx", nil)
req.Header.Set("Authorization", "Bearer <token>")`,
  },
}

const replaceImageModel = (model: string): typeof codeSamples =>
  Object.fromEntries(
    Object.entries(codeSamples).map(([language, sample]) => [
      language,
      sample.replace(/gpt-image-2/g, model),
    ])
  ) as typeof codeSamples

const modelsCodeSamples: typeof codeSamples = {
  cURL: `curl --request GET \\
  --url ${openAiBaseUrl}/models \\
  --header 'Authorization: Bearer <token>'`,
  Python: `from openai import OpenAI

client = OpenAI(api_key="<token>", base_url="${openAiBaseUrl}")
for model in client.models.list().data:
    print(model.id)`,
  JavaScript: `import OpenAI from "openai";

const client = new OpenAI({ apiKey: "<token>", baseURL: "${openAiBaseUrl}" });
const models = await client.models.list();
console.log(models.data.map((model) => model.id));`,
  Go: `req, _ := http.NewRequest(http.MethodGet, "${openAiBaseUrl}/models", nil)
req.Header.Set("Authorization", "Bearer <token>")
response, _ := http.DefaultClient.Do(req)`,
}

const sectionCodeSamples: Partial<Record<DocsSection, typeof codeSamples>> = {
  overview: modelsCodeSamples,
  authentication: modelsCodeSamples,
  'base-url': modelsCodeSamples,
  models: modelsCodeSamples,
  responses: {
    cURL: `curl --request POST \\
  --url ${openAiBaseUrl}/responses \\
  --header 'Authorization: Bearer <token>' \\
  --header 'Content-Type: application/json' \\
  --data '{"model":"gpt-5.6-sol","input":"用一句话介绍 SynthAPI","stream":true}'`,
    Python: `from openai import OpenAI

client = OpenAI(api_key="<token>", base_url="${openAiBaseUrl}")
with client.responses.stream(
    model="gpt-5.6-sol",
    input="用一句话介绍 SynthAPI",
) as stream:
    for event in stream:
        print(event)`,
    JavaScript: `import OpenAI from "openai";

const client = new OpenAI({ apiKey: "<token>", baseURL: "${openAiBaseUrl}" });
const response = await client.responses.create({
  model: "gpt-5.6-sol",
  input: "用一句话介绍 SynthAPI",
});
console.log(response.output_text);`,
    Go: `payload := strings.NewReader(\`{"model":"gpt-5.6-sol","input":"用一句话介绍 SynthAPI"}\`)
req, _ := http.NewRequest(http.MethodPost, "${openAiBaseUrl}/responses", payload)
req.Header.Set("Authorization", "Bearer <token>")
req.Header.Set("Content-Type", "application/json")`,
  },
  'claude-messages': {
    cURL: `curl --request POST \\
  --url ${anthropicBaseUrl}/messages \\
  --header 'x-api-key: <token>' \\
  --header 'anthropic-version: 2023-06-01' \\
  --header 'Content-Type: application/json' \\
  --data '{"model":"claude-opus-5","max_tokens":1024,"messages":[{"role":"user","content":"你好"}]}'`,
    Python: `import anthropic

client = anthropic.Anthropic(api_key="<token>", base_url="${siteBaseUrl}")
message = client.messages.create(
    model="claude-opus-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "你好"}],
)
print(message.content[0].text)`,
    JavaScript: `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: "<token>", baseURL: "${siteBaseUrl}" });
const message = await client.messages.create({
  model: "claude-opus-5",
  max_tokens: 1024,
  messages: [{ role: "user", content: "你好" }],
});
console.log(message.content);`,
    Go: `payload := strings.NewReader(\`{"model":"claude-opus-5","max_tokens":1024,"messages":[{"role":"user","content":"你好"}]}\`)
req, _ := http.NewRequest(http.MethodPost, "${anthropicBaseUrl}/messages", payload)
req.Header.Set("x-api-key", "<token>")
req.Header.Set("anthropic-version", "2023-06-01")`,
  },
  'image-gemini': replaceImageModel('gemini-3.1-flash-image-preview'),
  'image-seedream': replaceImageModel('seedream-5-0-pro'),
  'image-flux': replaceImageModel('flux-2-pro'),
  'image-other': replaceImageModel('qwen-image-3.0-pro'),
  billing: {
    ...modelsCodeSamples,
    cURL: `curl --request GET \\
  --url ${siteBaseUrl}/api/log/self \\
  --header 'Authorization: Bearer <token>'`,
  },
  errors: {
    ...modelsCodeSamples,
    cURL: `curl --request GET \\
  --url ${siteBaseUrl}/api/status \\
  --header 'Accept: application/json'`,
  },
}

const responseExamples: Record<DocsTopic, string> = {
  overview: `{
  "status": "ok",
  "message": "模型列表可用"
}`,
  text: `{
  "id": "resp_xxxxxxxxxx",
  "object": "chat.completion.chunk",
  "choices": [{"delta": {"content": "你好！"}, "finish_reason": null}]
}`,
  image: `{
  "code": 200,
  "task_id": "task_xxxxxxxxxx",
  "status": "submitted",
  "data": [
    {
      "task_id": "task_xxxxxxxxxx",
      "status": "submitted"
    }
  ]
}`,
  video: `{
  "id": "task_xxxxxxxxxx",
  "status": "submitted",
  "progress": 0
}`,
  tasks: `{
  "code": 200,
  "data": {"task_id": "task_xxxxxxxxxx", "status": "completed", "progress": 100}
}`,
}

const sectionResponseExamples: Partial<Record<DocsSection, string>> = {
  responses: `{
  "id": "resp_xxxxxxxxxx",
  "object": "response",
  "status": "completed",
  "output_text": "SynthAPI 是统一的 AI 模型接口平台。"
}`,
  'claude-messages': `{
  "id": "msg_xxxxxxxxxx",
  "type": "message",
  "role": "assistant",
  "content": [{"type": "text", "text": "你好！"}]
}`,
  billing: `{
  "success": true,
  "data": [{"model_name": "gpt-5.6-sol", "quota": 1024}]
}`,
  errors: `{
  "success": true,
  "data": {"status": "ok"}
}`,
}

function CopyButton({
  value,
  label = '复制',
}: {
  value: string
  label?: string
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <button type='button' className='docs-copy-button' onClick={copy}>
      {copied ? <Check /> : <Copy />}
      <span>{copied ? '已复制' : label}</span>
    </button>
  )
}

function CodeWorkbench({
  topic = 'text',
  section = 'chat-completions',
}: {
  topic?: DocsTopic
  section?: DocsSection
}) {
  const [language, setLanguage] = useState<keyof typeof codeSamples>('cURL')
  const samples =
    sectionCodeSamples[section] ??
    (topic === 'overview' ? modelsCodeSamples : topicCodeSamples[topic])
  const sample = samples[language]
  const responseExample =
    sectionResponseExamples[section] ?? responseExamples[topic]
  const meta = sectionMeta[section]

  return (
    <div className='docs-code-stack'>
      <section className='docs-code-card'>
        <header className='docs-code-tabs'>
          <div className='docs-code-heading'>
            <strong>{meta.label}</strong>
            <code>{meta.endpoint}</code>
          </div>
          <div className='docs-language-tabs'>
            {(Object.keys(samples) as Array<keyof typeof codeSamples>).map(
              (item) => (
                <button
                  type='button'
                  key={item}
                  className={language === item ? 'is-active' : ''}
                  onClick={() => setLanguage(item)}
                >
                  {item}
                </button>
              )
            )}
          </div>
          <CopyButton value={sample} />
        </header>
        <pre className='docs-code-body'>
          <code>{sample}</code>
        </pre>
      </section>

      <section className='docs-code-card docs-response-card'>
        <header className='docs-code-tabs'>
          <div>
            <span className='docs-response-title'>响应回执</span>
            <span className='docs-status-code'>{meta.status}</span>
          </div>
          <CopyButton value={responseExample} />
        </header>
        <pre className='docs-code-body'>
          <code>{responseExample}</code>
        </pre>
      </section>
    </div>
  )
}

function DocsSidebar({
  activeTopic,
  activeSection,
  onSectionChange,
}: {
  activeTopic: DocsTopic
  activeSection: DocsSection
  onSectionChange: (section: DocsSection) => void
}) {
  const [query, setQuery] = useState('')
  const normalized = query.trim().toLowerCase()
  const groups = useMemo(
    () =>
      navGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) =>
            item.label.toLowerCase().includes(normalized)
          ),
        }))
        .filter((group) => !normalized || group.items.length > 0),
    [normalized]
  )

  return (
    <aside className='docs-reference-sidebar'>
      <div className='docs-sidebar-inner'>
        <div className='docs-product-mark'>
          <span>
            <BookOpen />
          </span>
          <div>
            <strong>SynthAPI 文档</strong>
            <small>API REFERENCE</small>
          </div>
        </div>
        <label className='docs-search'>
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder='搜索文档...'
            aria-label='搜索文档目录'
          />
          <kbd>⌘K</kbd>
        </label>
        <div className='docs-topic-switcher' aria-label='选择文档主题'>
          {(['text', 'image', 'video'] as const).map((topic) => (
            <button
              type='button'
              key={topic}
              className={activeTopic === topic ? 'is-active' : ''}
              onClick={() => onSectionChange(defaultSectionForTopic[topic])}
            >
              {topicMeta[topic].label}
            </button>
          ))}
        </div>
        <nav aria-label='API 文档目录'>
          {groups.map((group) => (
            <div className='docs-nav-group' key={group.title}>
              <div className='docs-nav-title'>
                <group.icon />
                {group.title}
              </div>
              {group.items.map((item, index) => (
                <a
                  href={`#${item.id}`}
                  key={item.id}
                  onClick={(event) => {
                    event.preventDefault()
                    onSectionChange(item.id)
                  }}
                  className={activeSection === item.id ? 'is-active' : ''}
                  aria-current={activeSection === item.id ? 'page' : undefined}
                >
                  <span>{item.label}</span>
                  {activeSection === item.id && (
                    <ChevronRight />
                  )}
                  {index === 0 && group.title === '图像系列' && <em>推荐</em>}
                </a>
              ))}
            </div>
          ))}
        </nav>
      </div>
    </aside>
  )
}

function ParameterRow({
  parameter,
}: {
  parameter: (typeof imageParameters)[number]
}) {
  return (
    <div className='docs-parameter-row'>
      <div className='docs-parameter-key'>
        <code>{parameter.name}</code>
        <span>{parameter.type}</span>
        {parameter.required && <b>必填</b>}
      </div>
      <div className='docs-parameter-copy'>
        <p>{parameter.description}</p>
        {'options' in parameter && parameter.options && (
          <div className='docs-enum-list'>
            {parameter.options.map((option) => (
              <code key={option}>{option}</code>
            ))}
          </div>
        )}
        {'example' in parameter && parameter.example && (
          <div className='docs-example-value'>
            <span>示例</span>
            <code>{parameter.example}</code>
          </div>
        )}
      </div>
    </div>
  )
}

function EndpointBar({
  method,
  path,
}: {
  method: 'GET' | 'POST'
  path: string
}) {
  const fullPath = path.startsWith('/api/')
    ? `${siteBaseUrl}${path}`
    : `${openAiBaseUrl}${path}`
  return (
    <div className='docs-endpoint-bar'>
      <span className={`docs-method docs-method--${method.toLowerCase()}`}>
        {method}
      </span>
      <code>{fullPath}</code>
      <CopyButton value={fullPath} label='复制地址' />
    </div>
  )
}

function SelectedSection({ section }: { section: DocsSection }) {
  const meta = sectionMeta[section]
  const endpoint = meta.endpoint.startsWith('/api/')
    ? `${siteBaseUrl}${meta.endpoint}`
    : `${openAiBaseUrl}${meta.endpoint.replace('/v1', '')}`
  return (
    <section id='docs-selected' className='docs-selected-section' aria-live='polite'>
      <div className='docs-selected-kicker'>当前章节 · {meta.eyebrow}</div>
      <div className='docs-selected-heading'>
        <div>
          <h2>{meta.title}</h2>
          <p>{meta.description}</p>
        </div>
        <span className={`docs-method docs-method--${meta.method.toLowerCase()}`}>
          {meta.method}
        </span>
      </div>
      <div className='docs-selected-route'>
        <code>{endpoint}</code>
      </div>
    </section>
  )
}

function TopicContent({
  activeSection,
  onSectionChange,
}: {
  activeSection: DocsSection
  onSectionChange: (section: DocsSection) => void
}) {
  const textDetails: Partial<
    Record<DocsSection, { title: string; summary: string; parameters: string[][] }>
  > = {
    'chat-completions': {
      title: 'Chat Completions 请求结构',
      summary: '兼容 OpenAI Chat Completions。适用于传统对话客户端，支持流式和非流式输出。',
      parameters: [
        ['model', 'string', '模型名称，来自当前 API Key 可用分组。'],
        ['messages', 'array', '对话消息数组，每项包含 role 和 content。'],
        ['stream', 'boolean', '设为 true 时以 SSE 返回增量内容。'],
      ],
    },
    responses: {
      title: 'Responses 请求结构',
      summary: '使用 input 统一承载文本与多模态输入，适合推理模型、工具调用和响应事件流。',
      parameters: [
        ['model', 'string', '支持 Responses 协议的模型名称。'],
        ['input', 'string | array', '字符串或结构化输入项，可组合文本、图片和历史消息。'],
        ['tools', 'array', '可选的函数工具定义；模型会返回对应工具调用事件。'],
        ['stream', 'boolean', '开启后返回 response.* 类型的 SSE 事件。'],
      ],
    },
    'claude-messages': {
      title: 'Claude Messages 请求结构',
      summary: '兼容 Anthropic Messages。Claude SDK 可直接使用，system 提示词与 messages 分开传递。',
      parameters: [
        ['model', 'string', '可用的 Claude 或 Anthropic 兼容模型。'],
        ['max_tokens', 'integer', '本次响应允许生成的最大 Token 数。'],
        ['system', 'string | array', '可选系统提示词，不要放入 messages 的 system 角色。'],
        ['messages', 'array', 'user 与 assistant 消息列表。'],
      ],
    },
  }

  const familyBySection: Partial<Record<DocsSection, string>> = {
    'image-gemini': 'Google',
    'image-seedream': 'Seedream',
    'image-flux': 'FLUX',
    'image-other': 'Qwen / Grok / Wan',
  }
  const selectedFamily = familyBySection[activeSection]

  return (
    <div key={activeSection} className='docs-section-panel'>
      {activeSection === 'authentication' && <section className='docs-section docs-section--compact'>
        <div className='docs-section-heading'>
          <div>
            <span>AUTHENTICATION</span>
            <h2>身份认证</h2>
          </div>
          <span className='docs-section-index'>01</span>
        </div>
        <p>
          在请求头中写入 API Key。密钥可在控制台
          <Link to='/keys'> API 密钥</Link> 页面创建；请将密钥保存在服务端环境变量中。
        </p>
        <div className='docs-callout docs-callout--info'>
          <KeyRound />
          <div>
            <strong>Authorization</strong>
            <code>Bearer sk-your-api-key</code>
          </div>
        </div>
      </section>}

      {activeSection === 'base-url' && <section className='docs-section docs-section--compact'>
        <div className='docs-section-heading'>
          <div>
            <span>BASE URL</span>
            <h2>线路与 Base URL</h2>
          </div>
          <span className='docs-section-index'>02</span>
        </div>
        <p>两条线路共用同一个 API Key。把下面的地址填进客户端的 <code>base_url</code> 或“API 地址”字段，地址不要再加具体接口路径。</p>
        <div className='docs-route-list'>
          <div>
            <Server />
            <span>
              <strong>常规线路</strong>
              <code>{openAiBaseUrl}</code>
            </span>
          </div>
          <div className='is-fast'>
            <Zap />
            <span>
              <strong>高速线路</strong>
              <code>{FAST_OPENAI_BASE_URL}</code>
            </span>
            <em>推荐</em>
          </div>
        </div>
        <div className='docs-client-addresses'>
          <div><strong>OpenAI、Codex、OpenCode、dsh</strong><code>{openAiBaseUrl}</code><span>客户端会自行补上 /chat/completions、/responses 等路径。</span></div>
          <div><strong>Anthropic Claude SDK</strong><code>{siteBaseUrl}</code><span>官方 SDK 的 base_url 填站点根地址，它会自行请求 /v1/messages。</span></div>
          <div><strong>显式 Anthropic 兼容地址</strong><code>{anthropicBaseUrl}</code><span>只在客户端要求填写完整 Anthropic API 根路径时使用。</span></div>
        </div>
      </section>}

      {activeSection === 'models' && <section className='docs-section docs-section--compact'>
        <div className='docs-section-heading'>
          <div><span>MODEL LIST</span><h2>GET /v1/models 是做什么的</h2></div>
          <span className='docs-section-index'>02</span>
        </div>
        <p>这个接口返回当前 API Key 能看到的模型 ID。模型列表会受分组、权限和渠道状态影响，调用前先请求一次，就能确认模型名称是否写对。</p>
        <div className='docs-check-list'>
          <span><Check />检查密钥是否有效，以及当前账号是否有可用模型</span>
          <span><Check />把返回的 <code>id</code> 原样填入后续请求的 <code>model</code> 字段</span>
          <span><Check />它只返回清单，不会消耗模型额度，也不会生成文字、图片或视频</span>
        </div>
        <div className='docs-callout docs-callout--info'><Server /><div><strong>最小验证</strong><code>curl {openAiBaseUrl}/models -H "Authorization: Bearer &lt;token&gt;"</code></div></div>
      </section>}

      {textDetails[activeSection] && (
          <section className='docs-section'>
            <div className='docs-section-heading'>
              <div>
                <span>TEXT MODELS</span>
                <h2>{textDetails[activeSection]?.title}</h2>
              </div>
              <span className='docs-section-index'>03</span>
            </div>
            <p>{textDetails[activeSection]?.summary}</p>
            <div className='docs-api-grid'>
              {([
                ['chat-completions', '/v1/chat/completions', '传统对话与 SSE 流式输出'],
                ['responses', '/v1/responses', '推理、工具调用与统一事件流'],
                ['claude-messages', '/v1/messages', 'Claude SDK 与 Anthropic 协议'],
              ] as const).map(([section, endpoint, description]) => (
                <button
                  type='button'
                  key={section}
                  className={activeSection === section ? 'is-active' : ''}
                  onClick={() => onSectionChange(section)}
                >
                  <span className='docs-method docs-method--post'>POST</span>
                  <code>{endpoint}</code>
                  <small>{description}</small>
                </button>
              ))}
            </div>
            <div className='docs-parameter-list docs-parameter-list--text'>
              {textDetails[activeSection]?.parameters.map(([name, type, description]) => (
                <div className='docs-parameter-row' key={name}>
                  <div className='docs-parameter-key'><code>{name}</code><span>{type}</span></div>
                  <div className='docs-parameter-copy'><p>{description}</p></div>
                </div>
              ))}
            </div>
          </section>
      )}

      {activeSection === 'image-generation' && (
        <section className='docs-section'>
            <div className='docs-section-heading'>
              <div>
                <span>IMAGE MODELS</span>
                <h2>图像模型接口</h2>
              </div>
              <span className='docs-section-index'>03</span>
            </div>
            <p>统一使用 <code>/v1/images/generations</code> 生成图片；需要编辑或参考图时使用 <code>/v1/images/edits</code>。</p>
            <div className='docs-parameter-list'>
              {imageParameters.map((parameter) => <ParameterRow key={parameter.name} parameter={parameter} />)}
            </div>
          </section>
      )}

      {selectedFamily && (
        <section className='docs-section'>
          <div className='docs-section-heading'><div><span>MODEL CATALOG</span><h2>{selectedFamily} 模型清单</h2></div><span className='docs-section-index'>04</span></div>
          <p>以下模型可使用统一图像接口调用。具体支持的分辨率、参考图和专属开关以模型配置为准。</p>
          <div className='docs-model-family-list'>
            {imageFamilies.filter((family) => family.family === selectedFamily).map((family) => <div key={family.family} data-accent={family.accent}><strong>{family.family}</strong><div>{family.models.map((model) => <code key={model}>{model}</code>)}</div></div>)}
          </div>
          <div className='docs-callout docs-callout--info'><ImageIcon /><div><strong>示例模型已更新</strong><span>右侧代码已选择该系列的代表模型，可直接替换为本栏列出的其他模型。</span></div></div>
        </section>
      )}

      {activeSection === 'video-api' && (
          <section className='docs-section'>
            <div className='docs-section-heading'>
              <div><span>VIDEO MODELS</span><h2>视频模型聚合接口</h2></div>
              <span className='docs-section-index'>03</span>
            </div>
            <p>多家视频模型共用这一套请求格式。提交后先拿 <code>task_id</code>，再用查询接口查看状态和结果地址。</p>
            <div className='docs-api-grid'>
              <button type='button' className='is-active'><span className='docs-method docs-method--post'>POST</span><code>/v1/videos/generations</code><small>创建视频任务</small></button>
              <button type='button' onClick={() => onSectionChange('task-query')}><span className='docs-method docs-method--get'>GET</span><code>/v1/tasks/{'{task_id}'}</code><small>查询进度与结果地址</small></button>
            </div>
            <div className='docs-parameter-list docs-parameter-list--text'>
              <div className='docs-parameter-row'><div className='docs-parameter-key'><code>model</code><span>string</span><b>必填</b></div><div className='docs-parameter-copy'><p>视频模型 ID，先通过 <code>GET /v1/models</code> 查看当前密钥可用的模型。</p></div></div>
              <div className='docs-parameter-row'><div className='docs-parameter-key'><code>prompt</code><span>string</span><b>必填</b></div><div className='docs-parameter-copy'><p>描述主体、动作、镜头和时长。不同模型对内容和长度有自己的上限。</p></div></div>
              <div className='docs-parameter-row'><div className='docs-parameter-key'><code>seconds</code><span>string</span></div><div className='docs-parameter-copy'><p>视频时长（秒）。也可使用 <code>duration</code>，网关会转换为统一格式。</p></div></div>
              <div className='docs-parameter-row'><div className='docs-parameter-key'><code>size</code><span>string</span></div><div className='docs-parameter-copy'><p>画面尺寸或比例，例如 <code>1280x720</code>、<code>16:9</code>；支持范围以模型为准。</p></div></div>
              <div className='docs-parameter-row'><div className='docs-parameter-key'><code>image_urls</code><span>string[]</span></div><div className='docs-parameter-copy'><p>图生视频时传入参考图 URL。没有参考图时省略。</p></div></div>
              <div className='docs-parameter-row'><div className='docs-parameter-key'><code>generate_audio</code><span>boolean</span></div><div className='docs-parameter-copy'><p>模型支持时设为 <code>true</code> 生成音频，否则省略或设为 <code>false</code>。</p></div></div>
            </div>
            <div className='docs-model-family-list'>
              {videoFamilies.map((family) => <div key={family.family} data-accent={family.accent}><strong>{family.family}</strong><div>{family.models.map((model) => <code key={model}>{model}</code>)}</div></div>)}
            </div>
            <div className='docs-callout docs-callout--warning'><AlertTriangle /><div><strong>长任务提示</strong><span>客户端超时不代表任务失败，请保存 task_id 后继续查询。</span></div></div>
          </section>
      )}

      {(activeSection === 'task-query' || activeSection === 'image-task-query') && (
        <section className='docs-section'>
          <div className='docs-section-heading'><div><span>ASYNC TASKS</span><h2>{activeSection === 'image-task-query' ? '图像任务状态' : '异步任务状态'}</h2></div><span className='docs-section-index'>03</span></div>
          <p>{activeSection === 'image-task-query' ? '异步图像渠道会先返回 task_id。任务完成后，查询响应中会提供图片结果地址和失败原因。' : '图像和视频任务提交后返回 task_id。查询接口返回进度、结果地址以及失败原因。'}</p>
          <EndpointBar method='GET' path='/tasks/{task_id}' />
          <div className='docs-state-flow'><span>submitted</span><ChevronRight /><span>processing</span><ChevronRight /><span className='is-success'>completed</span><span className='docs-state-or'>或</span><span className='is-error'>failed</span></div>
        </section>
      )}

      {activeSection === 'overview' && (
        <section className='docs-section'>
          <div className='docs-section-heading'><div><span>QUICK START</span><h2>三类模型，统一调用方式</h2></div><span className='docs-section-index'>03</span></div>
            <div className='docs-overview-grid'>
            {(['text', 'image', 'video'] as const).map((topic) => <button type='button' key={topic} onClick={() => onSectionChange(defaultSectionForTopic[topic])}><strong>{topicMeta[topic].label}</strong><span>{topic === 'text' ? '流式对话与 Responses' : topic === 'image' ? '生成、编辑与参考图' : '异步生成与任务查询'}</span><ChevronRight /></button>)}
          </div>
        </section>
      )}

      {activeSection === 'billing' && <section className='docs-section docs-section--compact'>
        <div className='docs-section-heading'><div><span>BILLING</span><h2>计费与使用日志</h2></div><span className='docs-section-index'>05</span></div>
        <p>文字按 Token 计费，图像按分辨率和张数计费，视频按任务规格计费；最终费用会乘以分组倍率并记录在使用日志。</p>
        <div className='docs-check-list'><span><Check />文字请求核对输入、输出与缓存 Token</span><span><Check />图像请求核对模型、分辨率、张数和分组倍率</span><span><Check />异步任务以最终结算日志为准，提交回执不代表已完成计费</span></div>
      </section>}

      {activeSection === 'errors' && <section className='docs-section docs-section--compact'>
        <div className='docs-section-heading'><div><span>TROUBLESHOOTING</span><h2>按状态码快速定位</h2></div><span className='docs-section-index'>06</span></div>
        <div className='docs-error-table'><div><code>400</code><span>请求参数或协议格式错误，先核对模型所需字段。</span></div><div><code>401/403</code><span>检查 API Key、分组权限、余额和渠道访问限制。</span></div><div><code>404</code><span>模型未绑定到当前分组，或请求使用了错误端点。</span></div><div><code>429</code><span>触发上游或本站频率限制，结合 Retry-After 与使用日志判断。</span></div><div><code>5xx</code><span>使用 request id 在日志中查询渠道、上游响应和 Auto 降级状态。</span></div></div>
      </section>}
    </div>
  )
}

export function Docs() {
  const [activeSection, setActiveSection] = useState<DocsSection>(() => {
    if (typeof window === 'undefined') return 'chat-completions'
    const hash = window.location.hash.slice(1) as DocsSection
    return allSections.has(hash) ? hash : 'chat-completions'
  })
  const activeTopic = topicForSection(activeSection)
  const activeMeta = sectionMeta[activeSection]

  const selectSection = (section: DocsSection) => {
    setActiveSection(section)
    window.history.replaceState(null, '', `#${section}`)
    window.requestAnimationFrame(() => {
      document.getElementById('docs-selected')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1) as DocsSection
      if (allSections.has(hash)) setActiveSection(hash)
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  return (
    <PublicLayout showMainContainer={false}>
      <div className='docs-reference-page'>
        <header className='docs-topbar'>
          <Link to='/docs' className='docs-topbar-brand'>
            <span><BookOpen /></span>
            <strong>SynthAPI</strong>
            <i>Docs</i>
          </Link>
          <nav className='docs-topbar-nav' aria-label='文档主导航'>
            {[
              ['概览', 'overview'],
              ['文字模型', 'text'],
              ['图像模型', 'image'],
              ['视频模型', 'video'],
              ['异步任务', 'tasks'],
            ].map(([label, topic]) => (
              <button
                type='button'
                key={topic}
                aria-selected={activeTopic === topic}
                className={activeTopic === topic ? 'is-active' : ''}
                onClick={() => selectSection(defaultSectionForTopic[topic as DocsTopic])}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className='docs-topbar-actions'>
            <a href='https://github.com/Sunner-Chao/SynthApi' target='_blank' rel='noreferrer'>GitHub <ExternalLink /></a>
            <Link to='/keys' className='docs-topbar-cta'>创建密钥</Link>
          </div>
        </header>
        <DocsSidebar
          activeTopic={activeTopic}
          activeSection={activeSection}
          onSectionChange={selectSection}
        />

        <article className='docs-reference-content'>
          <div className='docs-mobile-kicker'>
            <BookOpen /> SynthAPI API Reference
          </div>
          <div className='docs-breadcrumb'>
            <a href='#overview'>API 文档</a>
            <ChevronRight />
            <span>{activeMeta.label}</span>
          </div>

          <header id='overview' className='docs-reference-hero'>
            <div className='docs-eyebrow'>{activeMeta.eyebrow}</div>
            <h1>{activeMeta.title}</h1>
            <p>{activeMeta.description}</p>
            <ul>
              <li>先请求 <code>/v1/models</code>，确认密钥能看到目标模型</li>
              <li>文字、图像和视频请求都使用同一个 API Key</li>
              <li>图像和视频提交后，按返回的 <code>task_id</code> 查询结果</li>
            </ul>
          </header>

          <EndpointBar method={activeMeta.method} path={activeMeta.endpoint.replace('/v1', '')} />

          <SelectedSection section={activeSection} />

          <TopicContent
            activeSection={activeSection}
            onSectionChange={selectSection}
          />

          <footer className='docs-reference-footer'>
            <div>
              <Code2 />
              <span>
                <strong>准备开始调用？</strong>
                <small>创建密钥并先发送一条最小验证请求。</small>
              </span>
            </div>
            <Link to='/keys'>
              前往 API 密钥 <ExternalLink />
            </Link>
          </footer>
        </article>

        <aside className='docs-reference-code'>
          <div className='docs-code-sticky'>
            <CodeWorkbench topic={activeTopic} section={activeSection} />
            <div className='docs-code-note'>
              <ShieldCheck />
              <p>
                示例中的 <code>&lt;token&gt;</code>{' '}
                仅为占位符。请勿把真实密钥发送到群聊、截图或代码仓库。
              </p>
            </div>
            <div className='docs-fast-note'>
              <Zap />
              <div>
                <strong>大速率线路</strong>
                <code>{FAST_API_BASE_URL}</code>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </PublicLayout>
  )
}
