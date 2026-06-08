/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Link } from '@tanstack/react-router'
import {
  BookOpen,
  CheckCircle2,
  Code2,
  KeyRound,
  LifeBuoy,
  MessageSquare,
  ReceiptText,
  ShieldCheck,
  Wallet,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { PublicLayout } from '@/components/layout'

const apiBaseUrl = 'https://118.25.43.185/v1'

const endpoints = [
  {
    method: 'POST',
    path: '/v1/chat/completions',
    title: '对话补全',
    description: '兼容 OpenAI Chat Completions 协议，支持流式与非流式响应。',
  },
  {
    method: 'POST',
    path: '/v1/completions',
    title: '文本补全',
    description: '用于兼容旧版文本补全模型或上游通道。',
  },
  {
    method: 'POST',
    path: '/v1/embeddings',
    title: '向量生成',
    description: '用于语义检索、RAG 和相似度计算。',
  },
  {
    method: 'GET',
    path: '/v1/models',
    title: '模型列表',
    description: '返回当前账号可用模型，受分组、渠道和权限配置影响。',
  },
]

const steps = [
  {
    icon: KeyRound,
    title: '创建 API Key',
    description:
      '登录 SynthAPI 控制台，在令牌或 API Key 页面创建密钥。密钥只展示一次，请妥善保存。',
  },
  {
    icon: Wallet,
    title: '确认额度',
    description:
      '在钱包页面查看余额并充值。请求会按模型倍率、分组倍率和实际 token 用量扣费。',
  },
  {
    icon: Code2,
    title: '接入统一端点',
    description:
      '把客户端 Base URL 改为 SynthAPI 的 /v1 地址，并使用 Bearer Token 认证。',
  },
  {
    icon: ReceiptText,
    title: '查看日志',
    description:
      '在使用日志中查看模型、请求时间、token、倍率、扣费和错误详情。',
  },
]

export function Docs() {
  return (
    <PublicLayout>
      <main className='mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8'>
        <section className='space-y-5'>
          <Badge className='w-fit gap-1.5 rounded-md' variant='secondary'>
            <BookOpen className='size-3.5' />
            SynthAPI API Manual
          </Badge>
          <div className='max-w-3xl space-y-4'>
            <h1 className='text-foreground text-3xl font-semibold tracking-tight sm:text-4xl'>
              SynthAPI 接口说明与调用手册
            </h1>
            <p className='text-muted-foreground text-base leading-7'>
              SynthAPI 提供统一的 AI 模型网关能力。业务系统只需要接入一套 OpenAI
              兼容接口，即可通过后台配置转发到 OpenAI、Claude、Gemini、
              DeepSeek、OpenRouter、Azure 以及更多上游模型通道。
            </p>
          </div>
          <div className='flex flex-wrap gap-3'>
            <Button render={<Link to='/keys' />}>创建 API Key</Button>
            <Button variant='outline' render={<Link to='/pricing' />}>
              查看模型与价格
            </Button>
          </div>
        </section>

        <section className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
          {steps.map((step) => (
            <Card key={step.title} className='rounded-lg'>
              <CardHeader className='space-y-3'>
                <div className='bg-primary/10 text-primary flex size-10 items-center justify-center rounded-md'>
                  <step.icon className='size-5' />
                </div>
                <CardTitle className='text-base'>{step.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className='leading-6'>
                  {step.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className='grid gap-6 lg:grid-cols-[1fr_360px]'>
          <div className='space-y-6'>
            <Card className='rounded-lg'>
              <CardHeader>
                <CardTitle>基础调用信息</CardTitle>
                <CardDescription>
                  所有 OpenAI 兼容请求均使用 Bearer Token 鉴权。
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <div className='rounded-md border p-4'>
                    <div className='text-muted-foreground text-xs'>
                      Base URL
                    </div>
                    <div className='mt-1 font-mono text-sm'>{apiBaseUrl}</div>
                  </div>
                  <div className='rounded-md border p-4'>
                    <div className='text-muted-foreground text-xs'>
                      Authorization
                    </div>
                    <div className='mt-1 font-mono text-sm'>
                      Bearer sk-your-api-key
                    </div>
                  </div>
                </div>
                <pre className='bg-muted overflow-x-auto rounded-md p-4 text-sm'>
                  <code>{`curl ${apiBaseUrl}/chat/completions \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-5.5",
    "messages": [
      { "role": "user", "content": "请用一句话介绍 SynthAPI" }
    ],
    "stream": false
  }'`}</code>
                </pre>
              </CardContent>
            </Card>

            <Card className='rounded-lg'>
              <CardHeader>
                <CardTitle>常用接口</CardTitle>
                <CardDescription>
                  接口路径保持 OpenAI
                  兼容，具体可用模型以模型广场和账号权限为准。
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-3'>
                {endpoints.map((endpoint) => (
                  <div
                    key={endpoint.path}
                    className='grid gap-3 rounded-md border p-4 sm:grid-cols-[150px_1fr]'
                  >
                    <div className='space-y-2'>
                      <Badge variant='outline'>{endpoint.method}</Badge>
                      <div className='font-mono text-xs'>{endpoint.path}</div>
                    </div>
                    <div>
                      <div className='font-medium'>{endpoint.title}</div>
                      <p className='text-muted-foreground mt-1 text-sm leading-6'>
                        {endpoint.description}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className='rounded-lg'>
              <CardHeader>
                <CardTitle>流式响应</CardTitle>
                <CardDescription>
                  将请求体中的 stream 设置为 true，即可使用 SSE 接收增量输出。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className='bg-muted overflow-x-auto rounded-md p-4 text-sm'>
                  <code>{`{
  "model": "gpt-5.5",
  "messages": [
    { "role": "user", "content": "写一个简短标题" }
  ],
  "stream": true
}`}</code>
                </pre>
              </CardContent>
            </Card>
          </div>

          <aside className='space-y-4'>
            <Card className='border-primary/25 rounded-lg'>
              <CardHeader>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <LifeBuoy className='text-primary size-4' />
                  技术支持
                </CardTitle>
                <CardDescription>
                  接入、配置、充值和调用问题均可联系协助处理。
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-3 text-sm leading-6'>
                <div className='rounded-md border p-4'>
                  <div className='text-muted-foreground text-xs'>
                    QQ 联系方式
                  </div>
                  <div className='mt-1 font-mono text-lg font-semibold'>
                    1639483940
                  </div>
                </div>
                <p className='text-primary font-medium'>
                  提供免费协助，帮助完成 API Key 创建、Base URL
                  配置、模型调用测试和常见错误排查。
                </p>
              </CardContent>
            </Card>

            <Card className='rounded-lg'>
              <CardHeader>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <ShieldCheck className='size-4' />
                  接入注意事项
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-3 text-sm leading-6'>
                <p>
                  请不要在浏览器前端、公开仓库或客户端安装包中暴露 API Key。
                </p>
                <p>
                  生产环境建议按业务创建不同 Key，并设置额度、模型和分组权限。
                </p>
                <p>
                  出现 401、429 或余额不足时，请先检查密钥、频率限制和账户额度。
                </p>
              </CardContent>
            </Card>

            <Card className='rounded-lg'>
              <CardHeader>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <MessageSquare className='size-4' />
                  OpenAI SDK 示例
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className='bg-muted overflow-x-auto rounded-md p-4 text-xs'>
                  <code>{`import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-your-api-key",
  baseURL: "${apiBaseUrl}"
});

const res = await client.chat.completions.create({
  model: "gpt-5.5",
  messages: [{ role: "user", content: "Hello" }]
});`}</code>
                </pre>
              </CardContent>
            </Card>

            <Card className='rounded-lg'>
              <CardHeader>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <CheckCircle2 className='size-4' />
                  推荐排查顺序
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className='text-muted-foreground list-decimal space-y-2 pl-4 text-sm leading-6'>
                  <li>确认 API Key 未过期且未被禁用。</li>
                  <li>确认钱包余额和分组额度充足。</li>
                  <li>确认模型名称在模型广场可见。</li>
                  <li>查看使用日志中的错误码和上游响应。</li>
                </ol>
              </CardContent>
            </Card>
          </aside>
        </section>
      </main>
    </PublicLayout>
  )
}
