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
  AlertCircle,
  BookOpen,
  CheckCircle2,
  KeyRound,
  LifeBuoy,
  LockKeyhole,
  MessageSquare,
  Route,
  ShieldCheck,
  TerminalSquare,
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

const siteBaseUrl = 'https://118.25.43.185'
const openAiBaseUrl = `${siteBaseUrl}/v1`
const anthropicBaseUrl = siteBaseUrl
const anthropicCompatBaseUrl = `${siteBaseUrl}/anthropic/v1`

const quickSteps = [
  {
    icon: KeyRound,
    title: '获取 API Key',
    description:
      '登录 SynthAPI 控制台，在令牌页面新建密钥。密钥只展示一次，请立即保存。',
  },
  {
    icon: Wallet,
    title: '确认余额与权限',
    description:
      '在钱包和模型页面确认余额、分组、模型权限均可用，否则请求会被网关拦截。',
  },
  {
    icon: Route,
    title: '选择正确地址',
    description:
      'OpenAI 兼容工具使用 /v1；Claude Code 使用站点根地址，由客户端自动拼接路径。',
  },
  {
    icon: CheckCircle2,
    title: '运行验证请求',
    description: '先使用模型列表或简单对话测试连通性，再接入真实业务或长任务。',
  },
]

const addressRows = [
  {
    scene: 'Claude Code / Anthropic 格式',
    variable: 'ANTHROPIC_BASE_URL',
    value: anthropicBaseUrl,
    note: '不带 /v1；客户端会访问 /v1/messages。',
  },
  {
    scene: 'Anthropic 兼容别名',
    variable: '手动 Base URL',
    value: anthropicCompatBaseUrl,
    note: '用于明确指定 Anthropic 路径的客户端。',
  },
  {
    scene: 'Codex CLI / OpenAI SDK / OpenClaw',
    variable: 'OPENAI_BASE_URL',
    value: openAiBaseUrl,
    note: '必须带 /v1。',
  },
  {
    scene: '浏览器访问与控制台',
    variable: '站点地址',
    value: siteBaseUrl,
    note: '用于登录、创建 Key、查看钱包和日志。',
  },
]

const endpoints = [
  {
    method: 'POST',
    path: '/v1/chat/completions',
    title: '对话补全',
    description: 'OpenAI Chat Completions 协议，支持流式与非流式响应。',
  },
  {
    method: 'POST',
    path: '/v1/responses',
    title: 'Responses',
    description: 'OpenAI Responses 协议入口，适合支持新版响应结构的客户端。',
  },
  {
    method: 'POST',
    path: '/v1/messages',
    title: 'Claude Messages',
    description:
      'Anthropic Messages 协议入口，Claude Code 等工具会使用该接口。',
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

const errorRows = [
  [
    '401 Unauthorized',
    'API Key 错误、过期、被禁用，或请求头未使用 Bearer / x-api-key。',
  ],
  ['403 Forbidden', '账号、令牌、模型权限或分组权限不满足当前请求。'],
  ['429 Too Many Requests', '触发频率限制，请降低并发或检查后台限流配置。'],
  [
    '503 No available channel',
    '当前分组下没有可用渠道，或目标模型未在该分组启用。',
  ],
  [
    'HTTP 200 但响应格式异常',
    '常见于 Claude Code 地址填错，实际拿到的是网页 HTML 而不是 API JSON。',
  ],
  [
    '余额不足 / quota exceeded',
    '钱包余额不足、令牌额度耗尽，或预扣费超过可用额度。',
  ],
]

const pricingNotes = [
  '模型输入价格对应后台模型倍率，模型输出价格对应补全倍率。',
  '最终扣费还会叠加用户所在分组倍率，并按实际 token 用量结算。',
  '使用日志会展示模型、分组、输入 token、输出 token、缓存命中、倍率和扣费结果。',
  '如果价格页刚修改后未及时刷新，请刷新页面并确认后台保存成功。',
]

const navSections = [
  {
    title: '开始',
    items: [
      { href: '#overview', label: '文档概览' },
      { href: '#quick-start', label: '新手快速开始' },
      { href: '#base-url', label: '地址选择' },
    ],
  },
  {
    title: '客户端',
    items: [
      { href: '#claude-code', label: 'Claude Code' },
      { href: '#codex-cli', label: 'Codex / OpenAI' },
      { href: '#sdk-examples', label: 'SDK 示例' },
    ],
  },
  {
    title: '接口',
    items: [
      { href: '#verify', label: 'curl 验证' },
      { href: '#endpoints', label: '常用接口' },
      { href: '#billing', label: '计费日志' },
    ],
  },
]

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className='bg-muted overflow-x-auto rounded-md p-4 text-xs leading-6 sm:text-sm'>
      <code>{children}</code>
    </pre>
  )
}

function DocsSidebar() {
  return (
    <aside className='hidden lg:block'>
      <div className='sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-4'>
        <div className='mb-5 flex items-center gap-2'>
          <div className='bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md'>
            <BookOpen className='size-4' />
          </div>
          <div>
            <div className='text-sm font-semibold'>SynthAPI Docs</div>
            <div className='text-muted-foreground text-xs'>接口调用手册</div>
          </div>
        </div>
        <nav className='space-y-6 border-l pl-4'>
          {navSections.map((section) => (
            <div key={section.title} className='space-y-2'>
              <div className='text-muted-foreground text-xs font-medium'>
                {section.title}
              </div>
              <div className='space-y-1'>
                {section.items.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className='text-muted-foreground hover:text-foreground hover:bg-muted block rounded-md px-2 py-1.5 text-sm transition-colors'
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  )
}

export function Docs() {
  return (
    <PublicLayout>
      <main className='mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8'>
        <section
          id='overview'
          className='from-muted/60 to-background scroll-mt-24 rounded-xl border bg-gradient-to-b p-6 sm:p-8'
        >
          <Badge className='w-fit gap-1.5 rounded-md' variant='secondary'>
            <BookOpen className='size-3.5' />
            SynthAPI API Manual
          </Badge>
          <div className='mt-5 max-w-3xl space-y-4'>
            <h1 className='text-foreground text-3xl font-semibold tracking-tight sm:text-4xl'>
              SynthAPI 接口说明与调用手册
            </h1>
            <p className='text-muted-foreground text-base leading-7'>
              本文档用于帮助用户把 Claude Code、Codex CLI、OpenClaw、OpenAI
              SDK、Anthropic SDK 以及自己的业务系统接入
              SynthAPI。核心只需要三步：创建 API Key、填对 Base
              URL、运行一次验证请求。
            </p>
          </div>
          <div className='mt-6 flex flex-wrap gap-3'>
            <Button render={<Link to='/keys' />}>创建 API Key</Button>
            <Button variant='outline' render={<Link to='/pricing' />}>
              查看模型与价格
            </Button>
            <Button variant='outline' render={<Link to='/wallet' />}>
              查看钱包余额
            </Button>
          </div>
        </section>

        <section className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
          {quickSteps.map((step) => (
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

        <section className='lg:hidden'>
          <Card className='rounded-lg'>
            <CardHeader>
              <CardTitle className='text-base'>文档目录</CardTitle>
              <CardDescription>快速跳转到常用接入章节。</CardDescription>
            </CardHeader>
            <CardContent className='flex flex-wrap gap-2'>
              {navSections.flatMap((section) =>
                section.items.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className='bg-muted text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm transition-colors'
                  >
                    {item.label}
                  </a>
                ))
              )}
            </CardContent>
          </Card>
        </section>

        <section className='grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)_320px]'>
          <DocsSidebar />

          <div className='min-w-0 space-y-6'>
            <Card id='base-url' className='scroll-mt-24 rounded-lg'>
              <CardHeader>
                <CardTitle>最重要的地址选择</CardTitle>
                <CardDescription>
                  新手最容易填错的是 /v1。OpenAI 兼容工具要带 /v1，Claude Code
                  的 ANTHROPIC_BASE_URL 通常不要带 /v1。
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-3'>
                {addressRows.map((row) => (
                  <div
                    key={row.scene}
                    className='grid gap-3 rounded-md border p-4 md:grid-cols-[180px_1fr]'
                  >
                    <div>
                      <div className='font-medium'>{row.scene}</div>
                      <div className='text-muted-foreground mt-1 font-mono text-xs'>
                        {row.variable}
                      </div>
                    </div>
                    <div className='min-w-0 space-y-1'>
                      <div className='font-mono text-sm break-all'>
                        {row.value}
                      </div>
                      <p className='text-muted-foreground text-sm leading-6'>
                        {row.note}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card id='quick-start' className='scroll-mt-24 rounded-lg'>
              <CardHeader>
                <CardTitle>新手快速开始</CardTitle>
                <CardDescription>
                  第一次接入建议按顺序完成，不要跳过验证步骤。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className='space-y-4'>
                  <li className='rounded-md border p-4'>
                    <div className='font-medium'>
                      1. 登录控制台并创建 API Key
                    </div>
                    <p className='text-muted-foreground mt-2 text-sm leading-6'>
                      进入控制台后打开令牌页面，新建一个用途明确的 Key，例如
                      claude-code、codex-local、backend-prod。不同工具建议使用不同
                      Key，方便限额和停用。
                    </p>
                  </li>
                  <li className='rounded-md border p-4'>
                    <div className='font-medium'>
                      2. 检查余额、分组和模型权限
                    </div>
                    <p className='text-muted-foreground mt-2 text-sm leading-6'>
                      钱包余额不足、令牌额度不足、模型未开放、分组没有可用渠道，都会导致请求失败。
                      如果出现
                      503，请优先检查目标模型在当前用户分组下是否有可用渠道。
                    </p>
                  </li>
                  <li className='rounded-md border p-4'>
                    <div className='font-medium'>3. 按工具填写 Base URL</div>
                    <p className='text-muted-foreground mt-2 text-sm leading-6'>
                      Codex CLI、OpenClaw、OpenAI SDK 填 {openAiBaseUrl}；Claude
                      Code 填 {anthropicBaseUrl}。填反时常见表现是
                      404、空响应、Malformed response 或工具无法识别模型。
                    </p>
                  </li>
                  <li className='rounded-md border p-4'>
                    <div className='font-medium'>4. 运行最小验证请求</div>
                    <p className='text-muted-foreground mt-2 text-sm leading-6'>
                      先请求模型列表或发送一句简单对话，确认鉴权、路由、分组和上游渠道都正常，再运行长上下文任务。
                    </p>
                  </li>
                </ol>
              </CardContent>
            </Card>

            <Card id='claude-code' className='scroll-mt-24 rounded-lg'>
              <CardHeader>
                <CardTitle>Claude Code 配置</CardTitle>
                <CardDescription>
                  Claude Code 使用 Anthropic 协议。Base URL
                  通常填写站点根地址，不要额外拼接 /v1/messages。
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-4'>
                <CodeBlock>{`# macOS / Linux 临时配置
export ANTHROPIC_BASE_URL=${anthropicBaseUrl}
export ANTHROPIC_API_KEY=sk-your-api-key
claude`}</CodeBlock>
                <CodeBlock>{`# Windows PowerShell 临时配置
$env:ANTHROPIC_BASE_URL="${anthropicBaseUrl}"
$env:ANTHROPIC_API_KEY="sk-your-api-key"
claude`}</CodeBlock>
                <p className='text-muted-foreground text-sm leading-6'>
                  如果使用 ccswitch，请把 Anthropic URL 设置为
                  {anthropicBaseUrl}，OpenAI URL 设置为 {openAiBaseUrl}。当
                  Claude Code 报 API returned an empty or malformed
                  response，通常说明地址填到了网页路径，或重复拼接了 /v1。
                </p>
              </CardContent>
            </Card>

            <Card id='codex-cli' className='scroll-mt-24 rounded-lg'>
              <CardHeader>
                <CardTitle>Codex CLI / OpenAI 兼容工具</CardTitle>
                <CardDescription>
                  Codex CLI、OpenClaw、OpenAI SDK 和大多数 OpenAI 兼容客户端使用
                  /v1 地址。
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-4'>
                <CodeBlock>{`# macOS / Linux
export OPENAI_BASE_URL=${openAiBaseUrl}
export OPENAI_API_KEY=sk-your-api-key
codex`}</CodeBlock>
                <CodeBlock>{`# Windows PowerShell
$env:OPENAI_BASE_URL="${openAiBaseUrl}"
$env:OPENAI_API_KEY="sk-your-api-key"
codex`}</CodeBlock>
                <CodeBlock>{`# cc-switch 示例
cc-switch add synthapi \\
  --anthropic-url ${anthropicBaseUrl} \\
  --openai-url ${openAiBaseUrl} \\
  --key sk-your-api-key
cc-switch use synthapi`}</CodeBlock>
              </CardContent>
            </Card>

            <Card id='sdk-examples' className='scroll-mt-24 rounded-lg'>
              <CardHeader>
                <CardTitle>项目代码接入示例</CardTitle>
                <CardDescription>
                  业务项目建议由服务端持有 API Key，不要把 Key
                  写入浏览器前端代码。
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-4'>
                <CodeBlock>{`import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "${openAiBaseUrl}"
});

const res = await client.chat.completions.create({
  model: "gpt-5.5",
  messages: [{ role: "user", content: "Hello" }],
  stream: false
});

console.log(res.choices[0].message.content);`}</CodeBlock>
                <CodeBlock>{`from openai import OpenAI

client = OpenAI(
    api_key="sk-your-api-key",
    base_url="${openAiBaseUrl}",
)

res = client.chat.completions.create(
    model="gpt-5.5",
    messages=[{"role": "user", "content": "Hello"}],
)
print(res.choices[0].message.content)`}</CodeBlock>
              </CardContent>
            </Card>

            <Card id='verify' className='scroll-mt-24 rounded-lg'>
              <CardHeader>
                <CardTitle>curl 验证命令</CardTitle>
                <CardDescription>
                  先验证模型列表，再验证实际对话。把 sk-your-api-key 替换为真实
                  Key。
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-4'>
                <CodeBlock>{`curl ${openAiBaseUrl}/models \\
  -H "Authorization: Bearer sk-your-api-key"`}</CodeBlock>
                <CodeBlock>{`curl ${openAiBaseUrl}/chat/completions \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-5.5",
    "messages": [
      {"role": "user", "content": "请用一句话说明当前 API 是否连接成功"}
    ],
    "stream": false
  }'`}</CodeBlock>
                <CodeBlock>{`curl ${anthropicCompatBaseUrl}/messages \\
  -H "x-api-key: sk-your-api-key" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-ops-4-7",
    "max_tokens": 256,
    "messages": [
      {"role": "user", "content": "Hello"}
    ]
  }'`}</CodeBlock>
              </CardContent>
            </Card>

            <Card id='endpoints' className='scroll-mt-24 rounded-lg'>
              <CardHeader>
                <CardTitle>常用接口</CardTitle>
                <CardDescription>
                  接口路径保持兼容，具体可用模型以模型广场和账号权限为准。
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

            <Card id='billing' className='scroll-mt-24 rounded-lg'>
              <CardHeader>
                <CardTitle>计费与日志说明</CardTitle>
                <CardDescription>
                  扣费结果以后台结算和使用日志为准，前端价格页用于展示当前配置。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className='text-muted-foreground list-disc space-y-2 pl-5 text-sm leading-6'>
                  {pricingNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <aside className='space-y-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto'>
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
                <div className='rounded-md border p-4'>
                  <div className='text-muted-foreground text-xs'>
                    微信联系方式
                  </div>
                  <div className='mt-1 font-mono text-lg font-semibold'>
                    a1124602166
                  </div>
                </div>
                <p className='text-primary font-medium'>
                  免费协助：API Key 创建、Base URL
                  配置、模型调用测试、错误码排查、Claude Code 与 Codex CLI
                  接入。
                </p>
              </CardContent>
            </Card>

            <Card className='rounded-lg'>
              <CardHeader>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <TerminalSquare className='size-4' />
                  你该看哪一节
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-3 text-sm leading-6'>
                <p>
                  使用 Claude Code：看 Claude Code 配置，地址填{' '}
                  {anthropicBaseUrl}。
                </p>
                <p>
                  使用 Codex CLI：看 Codex CLI / OpenAI 兼容工具，地址填{' '}
                  {openAiBaseUrl}。
                </p>
                <p>
                  写项目代码：看项目代码接入示例，并把 Key
                  放在服务端环境变量里。
                </p>
              </CardContent>
            </Card>

            <Card className='rounded-lg'>
              <CardHeader>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <AlertCircle className='size-4' />
                  常见错误
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                {errorRows.map(([code, reason]) => (
                  <div key={code} className='rounded-md border p-3'>
                    <div className='font-mono text-xs font-semibold'>
                      {code}
                    </div>
                    <p className='text-muted-foreground mt-1 text-sm leading-6'>
                      {reason}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className='rounded-lg'>
              <CardHeader>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <ShieldCheck className='size-4' />
                  安全建议
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-3 text-sm leading-6'>
                <p>
                  不要在浏览器前端、公开仓库、截图、客户端安装包中暴露 API Key。
                </p>
                <p>
                  生产环境按工具或业务创建不同
                  Key，并设置额度、模型范围和分组权限。
                </p>
                <p>
                  怀疑泄露时立即禁用旧 Key，重新创建新 Key，并检查最近使用日志。
                </p>
              </CardContent>
            </Card>

            <Card className='rounded-lg'>
              <CardHeader>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <LockKeyhole className='size-4' />
                  请求头速查
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-3 text-sm leading-6'>
                <div>
                  <div className='font-medium'>OpenAI 兼容</div>
                  <div className='text-muted-foreground font-mono text-xs break-all'>
                    Authorization: Bearer sk-your-api-key
                  </div>
                </div>
                <div>
                  <div className='font-medium'>Anthropic 兼容</div>
                  <div className='text-muted-foreground font-mono text-xs break-all'>
                    x-api-key: sk-your-api-key
                  </div>
                  <div className='text-muted-foreground font-mono text-xs break-all'>
                    anthropic-version: 2023-06-01
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className='rounded-lg'>
              <CardHeader>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <MessageSquare className='size-4' />
                  流式响应
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CodeBlock>{`{
  "model": "gpt-5.5",
  "messages": [
    { "role": "user", "content": "写一个简短标题" }
  ],
  "stream": true
}`}</CodeBlock>
              </CardContent>
            </Card>
          </aside>
        </section>
      </main>
    </PublicLayout>
  )
}
