/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import {
  type Ref,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  GraduationCap,
  Image as ImageIcon,
  KeyRound,
  Menu,
  MessageSquareText,
  Search,
  Server,
  ShieldCheck,
  TextWrap,
  Video,
  X,
  Zap,
} from 'lucide-react'
import type { BundledLanguage } from 'shiki/bundle/web'
import { FAST_API_BASE_URL, FAST_OPENAI_BASE_URL } from '@/lib/api-routes'
import { PublicLayout } from '@/components/layout'
import './styles.css'

const siteBaseUrl = 'https://synthapi.asia'
const openAiBaseUrl = `${siteBaseUrl}/v1`
const anthropicBaseUrl = `${siteBaseUrl}/anthropic/v1`

type DocsTopic = 'overview' | 'text' | 'image' | 'video' | 'tasks'
type DocsSection =
  | 'overview'
  | 'beginner-guide'
  | 'advanced-guide'
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
    title: '学习路线',
    icon: GraduationCap,
    items: [
      { id: 'beginner-guide', label: '新手手把手教程', topic: 'overview' },
      { id: 'advanced-guide', label: '进阶接入路线', topic: 'overview' },
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
    title: '视频 API',
    icon: Video,
    items: [
      { id: 'video-api', label: '生成、查询与下载', topic: 'video' },
      { id: 'task-query', label: '任务状态与下载', topic: 'tasks' },
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
    description: '适合聊天、推理和工具调用；可选择普通返回或流式返回。',
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
    label: '视频 API',
    eyebrow: 'VIDEO MODELS',
    title: '视频生成与任务流程',
    description: '先提交任务拿到 task_id，再查询状态和视频地址。',
    endpoint: '/v1/videos/generations',
    method: 'POST',
    status: '200',
  },
  tasks: {
    label: '视频任务',
    eyebrow: 'ASYNC TASKS',
    title: '视频任务查询与下载',
    description:
      '按创建任务时使用的协议查询状态；任务完成后通过本站内容接口播放或下载视频。',
    endpoint: '/v1/videos/generations/{task_id}',
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
  'beginner-guide': {
    label: '新手手把手教程',
    eyebrow: 'BEGINNER GUIDE',
    title: '从注册到第一次成功调用',
    description:
      '跟着每一步做就好。先完成账号、密钥和 CC Switch 导入，再发送一条短请求确认环境正常。',
    endpoint: '/v1/models',
    method: 'GET',
    status: '200',
  },
  'advanced-guide': {
    label: '进阶接入路线',
    eyebrow: 'ADVANCED GUIDE',
    title: '把 SynthAPI 接入你的工作流',
    description:
      '给已经熟悉 API 的用户准备：先核对模型清单，再选择协议、线路、参数和任务查询方式。',
    endpoint: '/v1/models',
    method: 'GET',
    status: '200',
  },
  authentication: {
    label: '身份认证',
    eyebrow: 'AUTHENTICATION',
    title: '使用 API Key 完成认证',
    description:
      '所有模型接口共用 Bearer Token。密钥只应保存在服务端或受保护的客户端配置中。',
    endpoint: '/v1/models',
    method: 'GET',
    status: '200',
  },
  'base-url': {
    label: '线路与 Base URL',
    eyebrow: 'BASE URL',
    title: '选择合适的接入线路',
    description:
      '不同客户端只需要填写对应协议的根地址。地址后面不要再拼接 /chat/completions 或 /messages。',
    endpoint: '/v1/models',
    method: 'GET',
    status: '200',
  },
  models: {
    label: '模型列表',
    eyebrow: 'MODEL LIST',
    title: '先用模型列表确认能调用什么',
    description:
      'GET /v1/models 会返回当前 API Key、分组和权限下可用的模型 ID。它只查清单，不会发起生成请求。',
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
    description:
      '面向推理、工具调用和多轮上下文的统一响应接口，支持 SSE 流式增量事件。',
    endpoint: '/v1/responses',
  },
  'claude-messages': {
    ...topicMeta.text,
    label: 'Claude Messages',
    title: 'Anthropic Messages API',
    description:
      '兼容 Claude SDK 与 Anthropic Messages 请求格式，通过 x-api-key 或 Bearer Token 认证。',
    endpoint: '/v1/messages',
  },
  'image-generation': topicMeta.image,
  'image-gemini': {
    ...topicMeta.image,
    label: 'Gemini / Imagen',
    title: 'Gemini 与 Imagen 图像模型',
    description:
      '适合高质量文生图、参考图编辑与多模态构图，参数能力以具体模型为准。',
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
    description:
      '提供 Kontext、Flex、Pro 与 Max 系列，适用于文本渲染、风格控制和图像编辑。',
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
    description:
      '不同模型按 Token、分辨率、张数或任务规格计费，最终结算可在使用日志中核对。',
    endpoint: '/api/log/self',
    method: 'GET',
    status: '200',
  },
  errors: {
    label: '错误与排查',
    eyebrow: 'TROUBLESHOOTING',
    title: '错误码与请求排查',
    description:
      '先依据 HTTP 状态、request id 和使用日志定位认证、余额、路由或上游错误。',
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

const topicCodeSamples: Record<
  Exclude<DocsTopic, 'overview'>,
  typeof codeSamples
> = {
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
    Python: `from openai import OpenAI
import requests
import time

api_key = "<token>"
base_url = "${openAiBaseUrl}"
client = OpenAI(api_key=api_key, base_url=base_url)
video = client.videos.create(
    model="sora-2",
    prompt="一艘小船驶过雾中的海湾",
    seconds="8",
    size="1280x720",
)
task_id = video.id
headers = {"Authorization": f"Bearer {api_key}"}

while True:
    response = requests.get(f"{base_url}/videos/{task_id}", headers=headers, timeout=30)
    response.raise_for_status()
    task = response.json()
    if task["status"] == "completed":
        break
    if task["status"] == "failed":
        raise RuntimeError(task.get("error", "video generation failed"))
    time.sleep(5)

with requests.get(
    f"{base_url}/videos/{task_id}/content?download=1",
    headers=headers,
    stream=True,
    timeout=120,
) as response:
    response.raise_for_status()
    with open("video.mp4", "wb") as output:
        for chunk in response.iter_content(chunk_size=1024 * 1024):
            if chunk:
                output.write(chunk)`,
    JavaScript: `const response = await fetch("${openAiBaseUrl}/videos/generations", {
  method: "POST",
  headers: { Authorization: "Bearer <token>", "Content-Type": "application/json" },
  body: JSON.stringify({ model: "sora-2", prompt: "一艘小船驶过雾中的海湾", seconds: "8" }),
});
const created = await response.json();
const taskId = created.id ?? created.task_id;
const headers = { Authorization: "Bearer <token>" };

while (true) {
  const result = await fetch("${openAiBaseUrl}/videos/generations/" + taskId, { headers });
  const task = await result.json();
  if (task.status === "completed") break;
  if (task.status === "failed") throw new Error(task.error?.message ?? "Video generation failed");
  await new Promise((resolve) => setTimeout(resolve, 5000));
}

const download = await fetch("${openAiBaseUrl}/videos/" + taskId + "/content?download=1", { headers });
if (!download.ok) throw new Error("Download failed: " + download.status);
const file = await download.blob();
console.log("Downloaded " + file.size + " bytes");`,
    Go: `apiKey := "<token>"
baseURL := "${openAiBaseUrl}"
taskID := "<id from create response>"

req, _ := http.NewRequest(http.MethodGet, baseURL+"/videos/generations/"+taskID, nil)
req.Header.Set("Authorization", "Bearer "+apiKey)
status, err := http.DefaultClient.Do(req)
if err != nil { log.Fatal(err) }
defer status.Body.Close()
// Poll this endpoint until status is completed; stop and inspect error if failed.

download, _ := http.NewRequest(http.MethodGet, baseURL+"/videos/"+taskID+"/content?download=1", nil)
download.Header.Set("Authorization", "Bearer "+apiKey)
response, err := http.DefaultClient.Do(download)
if err != nil { log.Fatal(err) }
defer response.Body.Close()
file, err := os.Create("video.mp4")
if err != nil { log.Fatal(err) }
defer file.Close()
if _, err := io.Copy(file, response.Body); err != nil { log.Fatal(err) }`,
  },
  tasks: {
    cURL: `curl --request GET \\
  --url ${openAiBaseUrl}/videos/generations/<task_id> \\
  --header 'Authorization: Bearer <token>'

curl --fail-with-body --location \\
  --url '${openAiBaseUrl}/videos/<task_id>/content?download=1' \\
  --header 'Authorization: Bearer <token>' \\
  --output video.mp4`,
    Python: `import requests

task_id = "<id from create response>"
base_url = "${openAiBaseUrl}"
headers = {"Authorization": "Bearer <token>"}
task = requests.get(f"{base_url}/videos/generations/{task_id}", headers=headers, timeout=30)
task.raise_for_status()
print(task.json())

video = requests.get(
    f"{base_url}/videos/{task_id}/content?download=1",
    headers=headers,
    stream=True,
    timeout=120,
)
video.raise_for_status()
with open("video.mp4", "wb") as output:
    for chunk in video.iter_content(chunk_size=1024 * 1024):
        if chunk:
            output.write(chunk)`,
    JavaScript: `const taskId = "<id from create response>";
const headers = { Authorization: "Bearer <token>" };
const result = await fetch("${openAiBaseUrl}/videos/generations/" + taskId, { headers });
console.log(await result.json());

const video = await fetch("${openAiBaseUrl}/videos/" + taskId + "/content?download=1", { headers });
if (!video.ok) throw new Error("Download failed: " + video.status);
const blob = await video.blob();`,
    Go: `taskID := "<id from create response>"
baseURL := "${openAiBaseUrl}"
apiKey := "<token>"

query, _ := http.NewRequest(http.MethodGet, baseURL+"/videos/generations/"+taskID, nil)
query.Header.Set("Authorization", "Bearer "+apiKey)
result, err := http.DefaultClient.Do(query)
if err != nil { log.Fatal(err) }
defer result.Body.Close()
// Decode status and poll again until completed; do not download a pending task.

download, _ := http.NewRequest(http.MethodGet, baseURL+"/videos/"+taskID+"/content?download=1", nil)
download.Header.Set("Authorization", "Bearer "+apiKey)
video, err := http.DefaultClient.Do(download)
if err != nil { log.Fatal(err) }
defer video.Body.Close()
file, err := os.Create("video.mp4")
if err != nil { log.Fatal(err) }
defer file.Close()
if _, err := io.Copy(file, video.Body); err != nil { log.Fatal(err) }`,
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
  'image-task-query': {
    cURL: `curl --request GET \\
  --url ${openAiBaseUrl}/images/generations/<task_id> \\
  --header 'Authorization: Bearer <token>'`,
    Python: `import requests

task_id = "<id from image response>"
response = requests.get(
    f"${openAiBaseUrl}/images/generations/{task_id}",
    headers={"Authorization": "Bearer <token>"},
    timeout=30,
)
response.raise_for_status()
print(response.json())`,
    JavaScript: `const taskId = "<id from image response>";
const response = await fetch("${openAiBaseUrl}/images/generations/" + taskId, {
  headers: { Authorization: "Bearer <token>" },
});
console.log(await response.json());`,
    Go: `taskID := "<id from image response>"
req, _ := http.NewRequest(http.MethodGet, "${openAiBaseUrl}/images/generations/"+taskID, nil)
req.Header.Set("Authorization", "Bearer <token>")
response, err := http.DefaultClient.Do(req)
if err != nil { log.Fatal(err) }
defer response.Body.Close()`,
  },
  'task-query': topicCodeSamples.tasks,
  'video-api': topicCodeSamples.video,
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
  "object": "video",
  "status": "queued",
  "progress": 0
}`,
  tasks: `{
  "id": "task_xxxxxxxxxx",
  "object": "video",
  "status": "in_progress",
  "progress": 42
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
  'video-api': `{
  "id": "task_xxxxxxxxxx",
  "object": "video",
  "status": "queued",
  "progress": 0
}`,
  'task-query': `{
  "id": "task_xxxxxxxxxx",
  "object": "video",
  "status": "in_progress",
  "progress": 42
}`,
}

type CodeLanguage = keyof typeof codeSamples

const highlightLanguages: Record<
  CodeLanguage | 'response',
  BundledLanguage | null
> = {
  cURL: 'bash',
  Python: 'python',
  JavaScript: 'javascript',
  // Go is not part of shiki's web bundle, so Go samples stay as plain text.
  Go: null,
  response: 'json',
}

const docsTabs: ReadonlyArray<readonly [string, DocsSection]> = [
  ['新手教程', 'beginner-guide'],
  ['进阶接入', 'advanced-guide'],
  ['概览', 'overview'],
  ['文字模型', 'chat-completions'],
  ['图像模型', 'image-generation'],
  ['视频模型', 'video-api'],
  ['异步任务', 'task-query'],
]

// Keep in sync with the 1199.98px breakpoint in styles.css.
const WIDE_LAYOUT_QUERY = '(min-width: 1200px)'
// The sidebar replaces the chapter drawer from here up (899.98px breakpoint in styles.css).
const SIDEBAR_LAYOUT_QUERY = '(min-width: 900px)'
// Height of the sticky docs sub-nav plus a little breathing room.
const STICKY_NAV_OFFSET = 56
const COPY_FEEDBACK_MS = 1400
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Highlighted markup outlives remounts, e.g. when the code panel moves across the 1200px breakpoint.
const highlightCache = new Map<string, string>()

const shortcutLabel =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.userAgent)
    ? '⌘ K'
    : 'Ctrl K'

const tabForSection = (section: DocsSection): DocsSection =>
  section === 'beginner-guide' || section === 'advanced-guide'
    ? section
    : defaultSectionForTopic[topicForSection(section)]

const groupTitleForSection = (section: DocsSection): string =>
  navGroups.find((group) => group.items.some((item) => item.id === section))
    ?.title ?? 'API 文档'

const readSectionFromHash = (fallback: DocsSection): DocsSection => {
  if (typeof window === 'undefined') return fallback
  const hash = window.location.hash.slice(1) as DocsSection
  return allSections.has(hash) ? hash : fallback
}

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query]
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => true
  )
}

function useHighlightedCode(
  code: string,
  language: BundledLanguage | null
): string | null {
  const cacheKey = language ? `${language}\n${code}` : null
  const [result, setResult] = useState<{ key: string; html: string } | null>(
    null
  )

  useEffect(() => {
    if (!language || !cacheKey || highlightCache.has(cacheKey)) return
    let cancelled = false
    import('@/components/ai-elements/code-block')
      .then(({ highlightCode }) => highlightCode(code, language))
      .then((markup) => {
        const inner = /<code[^>]*>([\s\S]*)<\/code>/.exec(markup)?.[1]
        if (!inner) return
        highlightCache.set(cacheKey, inner)
        if (!cancelled) setResult({ key: cacheKey, html: inner })
      })
      .catch(() => {
        // Highlighting is progressive: the plain-text sample stays visible if shiki fails to load.
      })
    return () => {
      cancelled = true
    }
  }, [cacheKey, code, language])

  if (!cacheKey) return null
  return (
    highlightCache.get(cacheKey) ??
    (result?.key === cacheKey ? result.html : null)
  )
}

// Keeps Tab / Shift+Tab inside an open modal container.
function trapFocus(event: KeyboardEvent, container: HTMLElement) {
  const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  if (focusable.length === 0) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement
  const outside = !container.contains(active)
  if (event.shiftKey && (outside || active === first)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (outside || active === last)) {
    event.preventDefault()
    first.focus()
  }
}

function CopyButton({
  value,
  label = '复制',
  iconOnly = false,
}: {
  value: string
  label?: string
  iconOnly?: boolean
}) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setStatus('copied')
    } catch {
      setStatus('failed')
    }
    window.setTimeout(() => setStatus('idle'), COPY_FEEDBACK_MS)
  }

  const text =
    status === 'copied' ? '已复制' : status === 'failed' ? '复制失败' : label

  return (
    <button
      type='button'
      className={iconOnly ? 'docs-icon-button' : 'docs-copy-button'}
      onClick={copy}
      aria-label={text}
      title={text}
      data-status={status}
    >
      {status === 'copied' ? <Check /> : <Copy />}
      {!iconOnly && <span>{text}</span>}
    </button>
  )
}

function CodeSample({
  code,
  language,
  wrap,
}: {
  code: string
  language: BundledLanguage | null
  wrap: boolean
}) {
  const html = useHighlightedCode(code, language)

  return (
    <pre className={wrap ? 'docs-code-body is-wrap' : 'docs-code-body'}>
      {html ? (
        // Shiki markup generated from the static samples in this file.
        <code dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <code>{code}</code>
      )}
    </pre>
  )
}

interface CodeWorkbenchProps {
  topic: DocsTopic
  section: DocsSection
  language: CodeLanguage
  onLanguageChange: (language: CodeLanguage) => void
  wrap: boolean
  onWrapChange: (wrap: boolean) => void
}

function CodeWorkbench({
  topic,
  section,
  language,
  onLanguageChange,
  wrap,
  onWrapChange,
}: CodeWorkbenchProps) {
  const samples =
    sectionCodeSamples[section] ??
    (topic === 'overview' ? modelsCodeSamples : topicCodeSamples[topic])
  const languages = Object.keys(samples) as CodeLanguage[]
  const activeLanguage = languages.includes(language) ? language : languages[0]
  const sample = samples[activeLanguage]
  const responseExample =
    sectionResponseExamples[section] ?? responseExamples[topic]
  const meta = sectionMeta[section]

  return (
    <div className='docs-code-stack'>
      <div className='docs-code-caption'>
        <span
          className={`docs-method docs-method--${meta.method.toLowerCase()}`}
        >
          {meta.method}
        </span>
        <code>{meta.endpoint}</code>
        <span>请求示例</span>
      </div>

      <section className='docs-code-card' aria-label='请求示例'>
        <header className='docs-code-tabs'>
          <div
            className='docs-language-tabs'
            role='group'
            aria-label='示例语言'
          >
            {languages.map((item) => (
              <button
                type='button'
                key={item}
                className={activeLanguage === item ? 'is-active' : ''}
                aria-pressed={activeLanguage === item}
                onClick={() => onLanguageChange(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className='docs-code-actions'>
            <button
              type='button'
              className='docs-icon-button'
              aria-pressed={wrap}
              aria-label='自动换行'
              title='自动换行'
              onClick={() => onWrapChange(!wrap)}
            >
              <TextWrap />
            </button>
            <CopyButton value={sample} label='复制请求示例' iconOnly />
          </div>
        </header>
        <CodeSample
          code={sample}
          language={highlightLanguages[activeLanguage]}
          wrap={wrap}
        />
      </section>

      <section className='docs-code-card' aria-label='响应示例'>
        <header className='docs-code-tabs'>
          <span className='docs-response-title'>响应示例</span>
          <span className='docs-status-code'>{meta.status} OK</span>
          <div className='docs-code-actions'>
            <CopyButton value={responseExample} label='复制响应示例' iconOnly />
          </div>
        </header>
        <CodeSample
          code={responseExample}
          language={highlightLanguages.response}
          wrap={wrap}
        />
      </section>

      <div className='docs-code-tips'>
        <p>
          <ShieldCheck />
          <span>
            示例中的 <code>&lt;token&gt;</code>{' '}
            仅为占位符。请勿把真实密钥发送到群聊、截图或代码仓库。
          </span>
        </p>
        <p>
          <Zap />
          <span>
            大速率线路 <code>{FAST_API_BASE_URL}</code>
          </span>
        </p>
      </div>
    </div>
  )
}

interface DocsNavProps {
  activeSection: DocsSection
  onSectionChange: (section: DocsSection) => void
  searchId: string
  searchRef?: Ref<HTMLInputElement>
}

function DocsNav({
  activeSection,
  onSectionChange,
  searchId,
  searchRef,
}: DocsNavProps) {
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
        .filter((group) => group.items.length > 0),
    [normalized]
  )

  return (
    <div className='docs-nav'>
      <label className='docs-search' htmlFor={searchId}>
        <Search />
        <input
          id={searchId}
          ref={searchRef}
          type='search'
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder='搜索文档'
          aria-label='搜索文档目录'
          autoComplete='off'
        />
        <kbd>{shortcutLabel}</kbd>
      </label>
      <nav aria-label='API 文档目录'>
        {groups.map((group) => (
          <div className='docs-nav-group' key={group.title}>
            <div className='docs-nav-title'>{group.title}</div>
            <ul>
              {group.items.map((item, index) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    onClick={(event) => {
                      // Leave "open in new tab / window" clicks to the browser.
                      if (
                        event.button !== 0 ||
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey
                      ) {
                        return
                      }
                      event.preventDefault()
                      onSectionChange(item.id)
                    }}
                    className={activeSection === item.id ? 'is-active' : ''}
                    aria-current={
                      activeSection === item.id ? 'page' : undefined
                    }
                  >
                    <span>{item.label}</span>
                    {index === 0 && group.title === '图像系列' && <em>推荐</em>}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {groups.length === 0 && (
          <p className='docs-nav-empty'>没有匹配的章节</p>
        )}
      </nav>
    </div>
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

function TopicContent({
  activeSection,
  onSectionChange,
}: {
  activeSection: DocsSection
  onSectionChange: (section: DocsSection) => void
}) {
  const textDetails: Partial<
    Record<
      DocsSection,
      { title: string; summary: string; parameters: string[][] }
    >
  > = {
    'chat-completions': {
      title: 'Chat Completions 请求结构',
      summary:
        '兼容 OpenAI Chat Completions。适用于传统对话客户端，支持流式和非流式输出。',
      parameters: [
        ['model', 'string', '模型名称，来自当前 API Key 可用分组。'],
        ['messages', 'array', '对话消息数组，每项包含 role 和 content。'],
        ['stream', 'boolean', '设为 true 时以 SSE 返回增量内容。'],
      ],
    },
    responses: {
      title: 'Responses 请求结构',
      summary:
        '使用 input 统一承载文本与多模态输入，适合推理模型、工具调用和响应事件流。',
      parameters: [
        ['model', 'string', '支持 Responses 协议的模型名称。'],
        [
          'input',
          'string | array',
          '字符串或结构化输入项，可组合文本、图片和历史消息。',
        ],
        ['tools', 'array', '可选的函数工具定义；模型会返回对应工具调用事件。'],
        ['stream', 'boolean', '开启后返回 response.* 类型的 SSE 事件。'],
      ],
    },
    'claude-messages': {
      title: 'Claude Messages 请求结构',
      summary:
        '兼容 Anthropic Messages。Claude SDK 可直接使用，system 提示词与 messages 分开传递。',
      parameters: [
        ['model', 'string', '可用的 Claude 或 Anthropic 兼容模型。'],
        ['max_tokens', 'integer', '本次响应允许生成的最大 Token 数。'],
        [
          'system',
          'string | array',
          '可选系统提示词，不要放入 messages 的 system 角色。',
        ],
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

  if (activeSection === 'beginner-guide') {
    const steps = [
      [
        '01',
        '注册并完成邮箱验证',
        '使用可以正常收信的邮箱注册。验证码只使用最新一封，密码不要和邮箱或支付账户重复。',
      ],
      [
        '02',
        '创建一把专用 API Key',
        '打开 API 密钥页面，给密钥写一个容易辨认的名字，按页面实际权限选择分组和模型范围。完整密钥通常只显示一次，请放进密码管理器。',
      ],
      [
        '03',
        '从密钥行右侧三个点打开 CC Switch',
        '在目标密钥所在行打开更多操作，选择 CC Switch。弹窗里选择应用、填写 Primary Model，再点击打开；没有自动拉起时复制链接到客户端导入。',
      ],
      [
        '04',
        '先发一条短请求',
        '导入后确认 Base URL、模型名和启用状态。先发送一句短消息，确认返回正常后，再尝试长上下文、图片或自动化任务。',
      ],
    ] as const
    return (
      <section className='docs-section docs-section--learning'>
        <div className='docs-section-heading'>
          <div>
            <span>从这里开始</span>
            <h2>不用猜，按顺序走一遍</h2>
          </div>
        </div>
        <p>
          每一步都只做一件事，做完再进入下一步。需要时可以打开下方视频，或者下载完整图文版。
        </p>
        <div className='docs-learning-actions'>
          <a
            href='/tutorials/synthapi-cc-switch-v2.mp4'
            target='_blank'
            rel='noreferrer'
          >
            <Video />
            打开视频教程 <ExternalLink />
          </a>
          <a href='/tutorials/synthapi-cc-switch-v2.docx' download>
            <BookOpen />
            下载图文教程
          </a>
        </div>
        <div className='docs-guide-steps'>
          {steps.map(([number, title, body], index) => (
            <details
              className='docs-guide-step'
              key={number}
              open={index === 0}
            >
              <summary>
                <span>{number}</span>
                <strong>{title}</strong>
                <ChevronRight />
              </summary>
              <div>
                <p>{body}</p>
                {index === 1 && (
                  <Link to='/keys'>
                    现在去创建 API Key <ExternalLink />
                  </Link>
                )}
              </div>
            </details>
          ))}
        </div>
        <div className='docs-guide-video'>
          <div>
            <Video />
            <div>
              <strong>边看边做</strong>
              <span>视频会完整展示注册、三个点菜单和第一次验证。</span>
            </div>
          </div>
          <video
            controls
            preload='metadata'
            src='/tutorials/synthapi-cc-switch-v2.mp4'
          />
        </div>
        <div className='docs-support-callout'>
          <img src='/technical-support-qr.png' alt='技术支持二维码' />
          <div>
            <strong>卡住了，直接找技术支持</strong>
            <p>
              描述你正在做哪一步、看到的错误码和发生时间即可。请先打码，不要发送
              API Key、密码、验证码或导入链接。
            </p>
          </div>
        </div>
      </section>
    )
  }

  if (activeSection === 'advanced-guide') {
    return (
      <section className='docs-section docs-section--learning'>
        <div className='docs-section-heading'>
          <div>
            <span>进阶接入</span>
            <h2>从能调用，到接入自己的产品</h2>
          </div>
        </div>
        <p>
          如果你已经熟悉
          API，可以直接沿着这条路线核对协议和任务生命周期。每个入口都能回到完整参考章节。
        </p>
        <div className='docs-advanced-route'>
          {(
            [
              [
                'models',
                '先确认模型清单',
                '根据 API Key、分组和渠道状态确认模型 ID。',
              ],
              [
                'base-url',
                '选择协议与线路',
                'OpenAI、Responses、Claude Messages 使用对应的根地址。',
              ],
              [
                'image-generation',
                '接入图像生成',
                '按模型能力选择尺寸、质量、参考图和输出格式。',
              ],
              [
                'video-api',
                '接入视频任务',
                '保存 task_id，异步查询状态，完成后再下载结果。',
              ],
              [
                'billing',
                '用使用日志验收',
                '核对输入、输出、长上下文标记和最终费用。',
              ],
            ] as const
          ).map(([section, title, body], index) => (
            <button
              type='button'
              key={section}
              onClick={() => onSectionChange(section)}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{title}</strong>
                <small>{body}</small>
              </div>
              <ChevronRight />
            </button>
          ))}
        </div>
        <div className='docs-callout docs-callout--info'>
          <ShieldCheck />
          <div>
            <strong>遇到异常时</strong>
            <span>
              带上 request
              id、模型名、线路和时间，助手可以先帮你判断是参数、权限、额度还是上游问题。
            </span>
          </div>
        </div>
      </section>
    )
  }

  return (
    <div key={activeSection} className='docs-section-panel'>
      {activeSection === 'authentication' && (
        <section className='docs-section docs-section--compact'>
          <div className='docs-section-heading'>
            <div>
              <span>认证方式</span>
              <h2>身份认证</h2>
            </div>
          </div>
          <p>
            在请求头中写入 API Key。密钥可在控制台
            <Link to='/keys'> API 密钥</Link>{' '}
            页面创建；请将密钥保存在服务端环境变量中。
          </p>
          <div className='docs-callout docs-callout--info'>
            <KeyRound />
            <div>
              <strong>Authorization</strong>
              <code>Bearer sk-your-api-key</code>
            </div>
          </div>
        </section>
      )}

      {activeSection === 'base-url' && (
        <section className='docs-section docs-section--compact'>
          <div className='docs-section-heading'>
            <div>
              <span>接入线路</span>
              <h2>线路与 Base URL</h2>
            </div>
          </div>
          <p>
            两条线路共用同一个 API Key。把下面的地址填进客户端的{' '}
            <code>base_url</code> 或“API 地址”字段，地址不要再加具体接口路径。
          </p>
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
            <div>
              <strong>OpenAI、Codex、OpenCode、dsh</strong>
              <code>{openAiBaseUrl}</code>
              <span>
                客户端会自行补上 /chat/completions、/responses 等路径。
              </span>
            </div>
            <div>
              <strong>Anthropic Claude SDK</strong>
              <code>{siteBaseUrl}</code>
              <span>
                官方 SDK 的 base_url 填站点根地址，它会自行请求 /v1/messages。
              </span>
            </div>
            <div>
              <strong>显式 Anthropic 兼容地址</strong>
              <code>{anthropicBaseUrl}</code>
              <span>只在客户端要求填写完整 Anthropic API 根路径时使用。</span>
            </div>
          </div>
        </section>
      )}

      {activeSection === 'models' && (
        <section className='docs-section docs-section--compact'>
          <div className='docs-section-heading'>
            <div>
              <span>模型列表</span>
              <h2>GET /v1/models 是做什么的</h2>
            </div>
          </div>
          <p>
            这个接口返回当前 API Key 能看到的模型
            ID。模型列表会受分组、权限和渠道状态影响，调用前先请求一次，就能确认模型名称是否写对。
          </p>
          <div className='docs-check-list'>
            <span>
              <Check />
              检查密钥是否有效，以及当前账号是否有可用模型
            </span>
            <span>
              <Check />
              把返回的 <code>id</code> 原样填入后续请求的 <code>model</code>{' '}
              字段
            </span>
            <span>
              <Check />
              它只返回清单，不会消耗模型额度，也不会生成文字、图片或视频
            </span>
          </div>
          <div className='docs-callout docs-callout--info'>
            <Server />
            <div>
              <strong>最小验证</strong>
              <code>
                curl {openAiBaseUrl}/models -H "Authorization: Bearer
                &lt;token&gt;"
              </code>
            </div>
          </div>
        </section>
      )}

      {textDetails[activeSection] && (
        <section className='docs-section'>
          <div className='docs-section-heading'>
            <div>
              <span>请求结构</span>
              <h2>{textDetails[activeSection]?.title}</h2>
            </div>
          </div>
          <p>{textDetails[activeSection]?.summary}</p>
          <div className='docs-api-grid'>
            {(
              [
                [
                  'chat-completions',
                  '/v1/chat/completions',
                  '传统对话与 SSE 流式输出',
                ],
                ['responses', '/v1/responses', '推理、工具调用与统一事件流'],
                [
                  'claude-messages',
                  '/v1/messages',
                  'Claude SDK 与 Anthropic 协议',
                ],
              ] as const
            ).map(([section, endpoint, description]) => (
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
            {textDetails[activeSection]?.parameters.map(
              ([name, type, description]) => (
                <div className='docs-parameter-row' key={name}>
                  <div className='docs-parameter-key'>
                    <code>{name}</code>
                    <span>{type}</span>
                  </div>
                  <div className='docs-parameter-copy'>
                    <p>{description}</p>
                  </div>
                </div>
              )
            )}
          </div>
        </section>
      )}

      {activeSection === 'image-generation' && (
        <section className='docs-section'>
          <div className='docs-section-heading'>
            <div>
              <span>请求参数</span>
              <h2>图像模型接口</h2>
            </div>
          </div>
          <p>
            统一使用 <code>/v1/images/generations</code>{' '}
            生成图片；需要编辑或参考图时使用 <code>/v1/images/edits</code>。
          </p>
          <div className='docs-parameter-list'>
            {imageParameters.map((parameter) => (
              <ParameterRow key={parameter.name} parameter={parameter} />
            ))}
          </div>
        </section>
      )}

      {selectedFamily && (
        <section className='docs-section'>
          <div className='docs-section-heading'>
            <div>
              <span>模型清单</span>
              <h2>{selectedFamily} 模型清单</h2>
            </div>
          </div>
          <p>
            以下模型可使用统一图像接口调用。具体支持的分辨率、参考图和专属开关以模型配置为准。
          </p>
          <div className='docs-model-family-list'>
            {imageFamilies
              .filter((family) => family.family === selectedFamily)
              .map((family) => (
                <div key={family.family} data-accent={family.accent}>
                  <strong>{family.family}</strong>
                  <div>
                    {family.models.map((model) => (
                      <code key={model}>{model}</code>
                    ))}
                  </div>
                </div>
              ))}
          </div>
          <div className='docs-callout docs-callout--info'>
            <ImageIcon />
            <div>
              <strong>示例模型已更新</strong>
              <span>
                示例代码已选择该系列的代表模型，可直接替换为本栏列出的其他模型。
              </span>
            </div>
          </div>
        </section>
      )}

      {activeSection === 'video-api' && (
        <section className='docs-section'>
          <div className='docs-section-heading'>
            <div>
              <span>调用流程</span>
              <h2>视频生成与任务流程</h2>
            </div>
          </div>
          <p>
            本站提供聚合接口和 OpenAI 兼容接口。创建响应通常用 <code>id</code>{' '}
            标识任务，部分上游会返回 <code>task_id</code>
            ；后续查询时沿用响应里的原始 ID。
          </p>
          <EndpointBar method='POST' path='/videos/generations' />
          <div className='docs-callout docs-callout--info'>
            <Code2 />
            <div>
              <strong>OpenAI SDK 路径</strong>
              <span>
                <code>client.videos.create()</code> 与{' '}
                <code>client.videos.retrieve(id)</code> 对应{' '}
                <code>POST /v1/videos</code> 与{' '}
                <code>GET /v1/videos/{'{task_id}'}</code>。聚合接口则使用
                generations 路径。
              </span>
            </div>
          </div>
          <EndpointBar method='POST' path='/videos' />
          <div className='docs-parameter-list docs-parameter-list--text'>
            <div className='docs-parameter-row'>
              <div className='docs-parameter-key'>
                <code>model</code>
                <span>string</span>
                <b>必填</b>
              </div>
              <div className='docs-parameter-copy'>
                <p>
                  视频模型 ID，先通过 <code>GET /v1/models</code>{' '}
                  查看当前密钥可用的模型。
                </p>
              </div>
            </div>
            <div className='docs-parameter-row'>
              <div className='docs-parameter-key'>
                <code>prompt</code>
                <span>string</span>
                <b>必填</b>
              </div>
              <div className='docs-parameter-copy'>
                <p>
                  描述主体、动作、镜头和时长。不同模型对内容和长度有自己的上限。
                </p>
              </div>
            </div>
            <div className='docs-parameter-row'>
              <div className='docs-parameter-key'>
                <code>seconds</code>
                <span>string</span>
              </div>
              <div className='docs-parameter-copy'>
                <p>
                  视频时长（秒）。也可使用 <code>duration</code>
                  ，网关会转换为统一格式。
                </p>
              </div>
            </div>
            <div className='docs-parameter-row'>
              <div className='docs-parameter-key'>
                <code>size</code>
                <span>string</span>
              </div>
              <div className='docs-parameter-copy'>
                <p>
                  画面尺寸或比例，例如 <code>1280x720</code>、<code>16:9</code>
                  ；支持范围以模型为准。
                </p>
              </div>
            </div>
            <div className='docs-parameter-row'>
              <div className='docs-parameter-key'>
                <code>image_urls</code>
                <span>string[]</span>
              </div>
              <div className='docs-parameter-copy'>
                <p>图生视频时传入参考图 URL。没有参考图时省略。</p>
              </div>
            </div>
            <div className='docs-parameter-row'>
              <div className='docs-parameter-key'>
                <code>generate_audio</code>
                <span>boolean</span>
              </div>
              <div className='docs-parameter-copy'>
                <p>
                  模型支持时设为 <code>true</code> 生成音频，否则省略或设为{' '}
                  <code>false</code>。
                </p>
              </div>
            </div>
          </div>
          <EndpointBar
            method='GET'
            path='/videos/{task_id}/content?download=1'
          />
          <p>
            下载请求仍需在 <code>Authorization</code> 请求头携带 API Key。去掉{' '}
            <code>download=1</code> 可供播放器读取；不要把 Key 拼进 URL。
          </p>
          <div className='docs-model-family-list'>
            {videoFamilies.map((family) => (
              <div key={family.family} data-accent={family.accent}>
                <strong>{family.family}</strong>
                <div>
                  {family.models.map((model) => (
                    <code key={model}>{model}</code>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className='docs-callout docs-callout--warning'>
            <AlertTriangle />
            <div>
              <strong>轮询与下载</strong>
              <span>
                保存创建响应中的 ID，每 5 秒左右查询一次。只有状态为{' '}
                <code>completed</code>{' '}
                后再下载；等待超时不要重复提交相同生成任务。
              </span>
            </div>
          </div>
        </section>
      )}

      {(activeSection === 'task-query' ||
        activeSection === 'image-task-query') && (
        <section className='docs-section'>
          <div className='docs-section-heading'>
            <div>
              <span>任务查询</span>
              <h2>
                {activeSection === 'image-task-query'
                  ? '图像任务状态'
                  : '视频任务查询与下载'}
              </h2>
            </div>
          </div>
          {activeSection === 'image-task-query' ? (
            <>
              <p>
                图像任务使用自己的查询路径；视频 API 的{' '}
                <code>/v1/tasks/...</code> 不是视频查询接口。
              </p>
              <EndpointBar method='GET' path='/images/generations/{task_id}' />
            </>
          ) : (
            <>
              <p>
                查询路径要和创建协议匹配。聚合接口查 generations 路径；OpenAI
                SDK 创建的任务查标准视频路径。两者都用创建响应中的 ID。
              </p>
              <EndpointBar method='GET' path='/videos/generations/{task_id}' />
              <EndpointBar method='GET' path='/videos/{task_id}' />
              <EndpointBar
                method='GET'
                path='/videos/{task_id}/content?download=1'
              />
              <p>
                状态为 <code>completed</code>{' '}
                后请求内容接口，响应是视频文件本身，不是 JSON。保持 API Key 在
                Authorization
                请求头中，使用流式写文件以避免把大视频一次性载入内存。
              </p>
            </>
          )}
          <div className='docs-state-flow'>
            <span>queued</span>
            <ChevronRight />
            <span>in_progress</span>
            <ChevronRight />
            <span className='is-success'>completed</span>
            <span className='docs-state-or'>或</span>
            <span className='is-error'>failed</span>
          </div>
        </section>
      )}

      {activeSection === 'overview' && (
        <section className='docs-section'>
          <div className='docs-section-heading'>
            <div>
              <span>快速开始</span>
              <h2>三类模型，统一调用方式</h2>
            </div>
          </div>
          <div className='docs-overview-grid'>
            {(['text', 'image', 'video'] as const).map((topic) => (
              <button
                type='button'
                key={topic}
                onClick={() => onSectionChange(defaultSectionForTopic[topic])}
              >
                <strong>{topicMeta[topic].label}</strong>
                <span>
                  {topic === 'text'
                    ? '流式对话与 Responses'
                    : topic === 'image'
                      ? '生成、编辑与参考图'
                      : '异步生成与任务查询'}
                </span>
                <ChevronRight />
              </button>
            ))}
          </div>
        </section>
      )}

      {activeSection === 'billing' && (
        <section className='docs-section docs-section--compact'>
          <div className='docs-section-heading'>
            <div>
              <span>计费</span>
              <h2>计费与使用日志</h2>
            </div>
          </div>
          <p>
            文字按 Token
            计费，图像按分辨率和张数计费，视频按任务规格计费；最终费用会乘以分组倍率并记录在使用日志。
          </p>
          <div className='docs-check-list'>
            <span>
              <Check />
              文字请求核对输入、输出与缓存 Token
            </span>
            <span>
              <Check />
              图像请求核对模型、分辨率、张数和分组倍率
            </span>
            <span>
              <Check />
              异步任务以最终结算日志为准，提交回执不代表已完成计费
            </span>
          </div>
        </section>
      )}

      {activeSection === 'errors' && (
        <section className='docs-section docs-section--compact'>
          <div className='docs-section-heading'>
            <div>
              <span>排查</span>
              <h2>按状态码快速定位</h2>
            </div>
          </div>
          <div className='docs-error-table'>
            <div>
              <code>400</code>
              <span>请求参数或协议格式错误，先核对模型所需字段。</span>
            </div>
            <div>
              <code>401/403</code>
              <span>检查 API Key、分组权限、余额和渠道访问限制。</span>
            </div>
            <div>
              <code>404</code>
              <span>模型未绑定到当前分组，或请求使用了错误端点。</span>
            </div>
            <div>
              <code>429</code>
              <span>
                触发上游或本站频率限制，结合 Retry-After 与使用日志判断。
              </span>
            </div>
            <div>
              <code>5xx</code>
              <span>
                使用 request id 在日志中查询渠道、上游响应和 Auto 降级状态。
              </span>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

export function Docs() {
  const [activeSection, setActiveSection] = useState<DocsSection>(() =>
    readSectionFromHash('chat-completions')
  )
  const [language, setLanguage] = useState<CodeLanguage>('cURL')
  const [wrap, setWrap] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const articleRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const drawerSearchRef = useRef<HTMLInputElement>(null)
  const isWide = useMediaQuery(WIDE_LAYOUT_QUERY)

  const activeTopic = topicForSection(activeSection)
  const activeMeta = sectionMeta[activeSection]
  const activeTab = tabForSection(activeSection)
  const isGuide =
    activeSection === 'beginner-guide' || activeSection === 'advanced-guide'

  const selectSection = useCallback((section: DocsSection) => {
    setActiveSection(section)
    setDrawerOpen(false)
    if (window.location.hash !== `#${section}`) {
      window.history.pushState(null, '', `#${section}`)
    }
    // Switching chapters behaves like opening a new page: bring the title back
    // into view when the reader has scrolled past it, never scroll further down.
    const article = articleRef.current
    if (!article) return
    const top =
      article.getBoundingClientRect().top + window.scrollY - STICKY_NAV_OFFSET
    if (window.scrollY > top) window.scrollTo({ top: Math.max(top, 0) })
  }, [])

  useEffect(() => {
    const syncFromLocation = () => {
      setActiveSection((current) => readSectionFromHash(current))
      setDrawerOpen(false)
    }
    window.addEventListener('popstate', syncFromLocation)
    window.addEventListener('hashchange', syncFromLocation)
    return () => {
      window.removeEventListener('popstate', syncFromLocation)
      window.removeEventListener('hashchange', syncFromLocation)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== 'k'
      ) {
        return
      }
      event.preventDefault()
      const sidebarSearch = searchRef.current
      if (sidebarSearch && sidebarSearch.offsetParent !== null) {
        sidebarSearch.focus()
        return
      }
      setDrawerOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!drawerOpen) return
    const returnFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    drawerSearchRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false)
      } else if (event.key === 'Tab' && drawerRef.current) {
        trapFocus(event, drawerRef.current)
      }
    }
    // Once the sidebar is back (window widened, tablet rotated) the drawer has no place.
    const sidebarLayout = window.matchMedia(SIDEBAR_LAYOUT_QUERY)
    const closeWhenSidebarShows = () => {
      if (sidebarLayout.matches) setDrawerOpen(false)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    sidebarLayout.addEventListener('change', closeWhenSidebarShows)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      sidebarLayout.removeEventListener('change', closeWhenSidebarShows)
      document.body.style.overflow = previousOverflow
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
    }
  }, [drawerOpen])

  const workbench = (
    <CodeWorkbench
      topic={activeTopic}
      section={activeSection}
      language={language}
      onLanguageChange={setLanguage}
      wrap={wrap}
      onWrapChange={setWrap}
    />
  )

  return (
    <PublicLayout showMainContainer={false} headerProps={{ floating: false }}>
      <div className='docs-reference-page'>
        <header className='docs-topbar'>
          <div className='docs-topbar-inner'>
            <button
              type='button'
              className='docs-toc-button'
              aria-expanded={drawerOpen}
              aria-controls='docs-drawer'
              onClick={() => setDrawerOpen(true)}
            >
              <Menu />
              <span>目录</span>
            </button>
            <Link to='/docs' className='docs-topbar-brand'>
              <BookOpen />
              <span>文档</span>
            </Link>
            <nav className='docs-topbar-nav' aria-label='文档主题'>
              {docsTabs.map(([label, section]) => (
                <button
                  type='button'
                  key={section}
                  className={activeTab === section ? 'is-active' : ''}
                  aria-current={activeTab === section ? 'page' : undefined}
                  onClick={() => selectSection(section)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <div className='docs-topbar-actions'>
              <a
                href='https://github.com/Sunner-Chao/SynthApi'
                target='_blank'
                rel='noreferrer'
              >
                GitHub <ExternalLink />
              </a>
              <Link to='/keys' className='docs-topbar-cta'>
                创建密钥
              </Link>
            </div>
          </div>
        </header>

        <div className='docs-reference-shell'>
          <aside className='docs-reference-sidebar' aria-label='文档目录'>
            <div className='docs-sidebar-inner'>
              <DocsNav
                activeSection={activeSection}
                onSectionChange={selectSection}
                searchId='docs-sidebar-search'
                searchRef={searchRef}
              />
            </div>
          </aside>

          <article ref={articleRef} className='docs-reference-content'>
            <nav className='docs-breadcrumb' aria-label='当前位置'>
              <button type='button' onClick={() => selectSection('overview')}>
                API 文档
              </button>
              <ChevronRight />
              <span>{groupTitleForSection(activeSection)}</span>
              <ChevronRight />
              <span aria-current='page'>{activeMeta.label}</span>
            </nav>

            <header className='docs-reference-hero'>
              <h1>{activeMeta.title}</h1>
              <p>{activeMeta.description}</p>
            </header>

            {!isGuide && (
              <EndpointBar
                method={activeMeta.method}
                path={activeMeta.endpoint.replace('/v1', '')}
              />
            )}

            <div className='docs-precheck'>
              <p>调用前检查</p>
              <ul>
                <li>
                  <Check />
                  <span>
                    先请求 <code>/v1/models</code>，确认密钥能看到目标模型
                  </span>
                </li>
                <li>
                  <Check />
                  <span>文字、图像和视频请求都使用同一个 API Key</span>
                </li>
                <li>
                  <Check />
                  <span>
                    图像和视频提交后，按返回的 <code>task_id</code> 查询结果
                  </span>
                </li>
              </ul>
            </div>

            {!isWide && <div className='docs-inline-code'>{workbench}</div>}

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

          {isWide && (
            <aside className='docs-reference-code' aria-label='代码示例'>
              <div className='docs-code-sticky'>{workbench}</div>
            </aside>
          )}
        </div>

        {drawerOpen && (
          <div className='docs-drawer-layer'>
            <button
              type='button'
              className='docs-drawer-scrim'
              aria-label='关闭目录'
              onClick={() => setDrawerOpen(false)}
            />
            <div
              ref={drawerRef}
              id='docs-drawer'
              className='docs-drawer'
              role='dialog'
              aria-modal='true'
              aria-label='文档目录'
            >
              <div className='docs-drawer-head'>
                <strong>文档目录</strong>
                <button
                  type='button'
                  className='docs-icon-button'
                  aria-label='关闭目录'
                  onClick={() => setDrawerOpen(false)}
                >
                  <X />
                </button>
              </div>
              <DocsNav
                activeSection={activeSection}
                onSectionChange={selectSection}
                searchId='docs-drawer-search'
                searchRef={drawerSearchRef}
              />
            </div>
          </div>
        )}
      </div>
    </PublicLayout>
  )
}
