import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Code2,
  Download,
  Gauge,
  KeyRound,
  LifeBuoy,
  Menu,
  Play,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react'
import './styles.css'

type GuidePage = {
  id: string
  group: string
  title: string
  eyebrow: string
  summary: string
  reading: string
  icon: typeof Play
}
const pages: GuidePage[] = [
  {
    id: 'quick-start',
    group: '开始使用',
    title: '5 分钟跑通第一条请求',
    eyebrow: 'START HERE',
    summary:
      '从注册账号、创建 API Key，到调用一个聊天模型。照着做完，你会知道请求到底经过了哪些环节。',
    reading: '4 分钟',
    icon: Play,
  },
  {
    id: 'concepts',
    group: '开始使用',
    title: '先搞懂 4 个核心对象',
    eyebrow: 'BASICS',
    summary:
      '用户负责权限，分组负责路由，渠道负责上游地址，账号负责实际凭证。把这四层分开，排错会简单很多。',
    reading: '5 分钟',
    icon: BookOpen,
  },
  {
    id: 'user-guide',
    group: '使用指南',
    title: '用户控制台：余额、模型与用量',
    eyebrow: 'FOR USERS',
    summary: '掌握余额、模型、Key、用量和订阅这些用户侧核心页面。',
    reading: '6 分钟',
    icon: UserRound,
  },
  {
    id: 'admin-guide',
    group: '管理员手册',
    title: '管理员配置：账号、渠道、分组',
    eyebrow: 'FOR ADMINS',
    summary: '用最少配置建立一条可控路由，并知道每个开关会影响什么。',
    reading: '8 分钟',
    icon: Server,
  },
  {
    id: 'api-reference',
    group: '开发者',
    title: 'API 参考：兼容 OpenAI 与 Anthropic',
    eyebrow: 'API REFERENCE',
    summary: '常用接口、请求头、流式响应和媒体任务的统一接入方式。',
    reading: '7 分钟',
    icon: KeyRound,
  },
  {
    id: 'billing',
    group: '开发者',
    title: '计费与用量：看懂每一笔费用',
    eyebrow: 'BILLING',
    summary: '从模型倍率、分组倍率到日志落账，确认每一笔费用。',
    reading: '5 分钟',
    icon: WalletCards,
  },
  {
    id: 'monitoring',
    group: '运维',
    title: '监控与健康检查',
    eyebrow: 'OPERATIONS',
    summary: '覆盖渠道、账号、模型和请求成功率的完整健康判断。',
    reading: '6 分钟',
    icon: Gauge,
  },
  {
    id: 'updates',
    group: '运维',
    title: '更新与回滚：保持线上可控',
    eyebrow: 'UPDATES',
    summary: '更新前备份，更新后验收，失败时快速回到上一份健康镜像。',
    reading: '4 分钟',
    icon: Download,
  },
  {
    id: 'troubleshooting',
    group: '帮助支持',
    title: '503、524 和请求断开怎么排查',
    eyebrow: 'TROUBLESHOOTING',
    summary: '分清没有可用账号和上游超时，再选择对应修复动作。',
    reading: '8 分钟',
    icon: LifeBuoy,
  },
  {
    id: 'security',
    group: '帮助支持',
    title: '安全与隐私：把 Key 当密码管理',
    eyebrow: 'SECURITY',
    summary: '安全是 API 网关的基本运行条件。',
    reading: '5 分钟',
    icon: ShieldCheck,
  },
]
const modules = [
  ['快速开始', '注册、创建 Key、跑通第一条请求', Play, 'teal', 'quick-start'],
  ['用户指南', '余额、模型、用量和媒体请求', UserRound, 'blue', 'user-guide'],
  ['管理员手册', '账号、渠道、分组和计费配置', Server, 'amber', 'admin-guide'],
  ['API 参考', '兼容 OpenAI 的请求和错误码', KeyRound, 'rose', 'api-reference'],
] as const
const roles = [
  [
    '普通用户',
    '我需要创建 Key、调用模型并核对费用。',
    UserRound,
    'blue',
    [
      ['跑通第一条请求', 'quick-start'],
      ['管理余额和用量', 'user-guide'],
      ['看懂计费记录', 'billing'],
    ],
  ],
  [
    '管理员',
    '我需要配置上游、分组、监控和更新。',
    Server,
    'violet',
    [
      ['配置账号与渠道', 'admin-guide'],
      ['设置渠道监控', 'monitoring'],
      ['执行官方更新', 'updates'],
    ],
  ],
  [
    '开发者 / 运维',
    '我需要接入接口并快速定位失败原因。',
    Terminal,
    'teal',
    [
      ['阅读 API 参考', 'api-reference'],
      ['理解核心对象', 'concepts'],
      ['排查 503 / 524', 'troubleshooting'],
    ],
  ],
] as const
const route = [
  [
    '01',
    '第一次调用',
    '跑通第一条请求',
    '确认账号、Key、分组和渠道完整可用。',
    'quick-start',
  ],
  [
    '02',
    '开始管理',
    '搞懂 4 个核心对象',
    '分清用户、分组、渠道和上游账号的职责。',
    'concepts',
  ],
  [
    '03',
    '出现异常',
    '排查 503 / 524',
    '按状态码和日志顺序缩小故障范围。',
    'troubleshooting',
  ],
] as const
const pageSections: Record<string, string[]> = {
  'quick-start': [
    '你需要准备什么',
    '注册、登录并创建 API Key',
    '用 curl 验证',
    '成功判定',
  ],
  concepts: ['用户与 API Key', '分组', '渠道与账号'],
  'user-guide': ['首页与控制台', 'API Keys 与用量', '图片与视频请求'],
  'admin-guide': ['配置上游账号', '创建渠道与分组', '管理员权限'],
  'api-reference': ['统一地址与请求头', '常用接口', '错误码'],
  billing: ['扣费由三层倍率决定', '核对一笔费用'],
  monitoring: ['四层健康判断', '建议指标'],
  updates: ['更新前后', '回滚'],
  troubleshooting: ['503：没有可调度上游', '524：上游连接超时', '工单最小信息'],
  security: ['用户侧', '管理员侧'],
}

function Mark() {
  return (
    <span className='guide-mark'>
      <img src='/logo.png?v=20260817' alt='' />
    </span>
  )
}
function GuideLink({
  id,
  children,
  className,
  select,
}: {
  id: string
  children: ReactNode
  className?: string
  select: (id: string) => void
}) {
  return (
    <a
      className={className}
      href={id ? '/docs#' + id : '/docs'}
      onClick={(event) => {
        event.preventDefault()
        select(id)
      }}
    >
      {children}
    </a>
  )
}
function Code({ children }: { children: string }) {
  return (
    <pre className='guide-code'>
      <code>{children}</code>
    </pre>
  )
}

function Body({ id }: { id: string }) {
  const copy: Record<string, ReactNode> = {
    'quick-start': (
      <>
        <h2>你需要准备什么</h2>
        <ul>
          <li>已完成邮箱验证的站点账号。</li>
          <li>可用余额或管理员开通的免费额度。</li>
          <li>一个启用模型和渠道的分组。</li>
        </ul>
        <h2>注册、登录并创建 API Key</h2>
        <p>
          打开首页选择“注册”，完成邮箱验证后登录。进入 API Keys，点击“新建
          Key”，填写用途明确的名称并选择分组。密钥只在创建成功时完整显示一次，请立即复制并放入密码管理器。
        </p>
        <blockquote>
          API Key 等同于调用权限。不要把它写进前端代码、公开仓库、截图或工单。
        </blockquote>
        <h2>用 curl 验证</h2>
        <Code>
          {
            'curl https://你的域名/v1/chat/completions \\\n  -H "Authorization: Bearer sk-替换成你的密钥" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"gpt-4o-mini","messages":[{"role":"user","content":"只回复：连接成功"}]}\''
          }
        </Code>
        <h2>成功判定</h2>
        <table>
          <thead>
            <tr>
              <th>检查项</th>
              <th>正常表现</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>登录</td>
              <td>能看到控制台侧栏</td>
            </tr>
            <tr>
              <td>API Key</td>
              <td>启用且绑定正确分组</td>
            </tr>
            <tr>
              <td>请求</td>
              <td>返回 200 JSON</td>
            </tr>
            <tr>
              <td>计费</td>
              <td>出现对应的用量记录</td>
            </tr>
          </tbody>
        </table>
      </>
    ),
    concepts: (
      <>
        <h2>用户与 API Key</h2>
        <p>
          用户是登录站点的人，Key 是调用入口的凭证。一个应用一个
          Key，不同环境分开，泄露后立即禁用并新建。
        </p>
        <h2>分组</h2>
        <p>
          分组包含模型白名单、渠道排序、倍率和权限。最终能否调用取决于用户权限、Key
          绑定、分组状态和渠道可用性。
        </p>
        <h2>渠道与账号</h2>
        <p>
          渠道保存上游地址和平台类型，账号保存 OAuth、API Key 或其他凭证。出现{' '}
          <code>no available accounts</code> 时先看账号池，再看域名和容器。
        </p>
        <blockquote>
          <strong>一句话记忆：</strong>用户/Key
          决定能不能进来，分组决定允许调用什么，渠道决定发到哪里，账号决定由谁发出。
        </blockquote>
      </>
    ),
    'user-guide': (
      <>
        <h2>首页与控制台</h2>
        <p>
          控制台展示余额、订阅状态、近期用量和可用模型。冻结金额可能来自正在结算的请求或订单，不要重复相加。
        </p>
        <h2>API Keys 与用量</h2>
        <p>
          每个 Key
          都有名称、状态、绑定分组和最近使用时间。用量记录按时间、模型、token、媒体数量和费用展示。
        </p>
        <h2>图片与视频请求</h2>
        <p>
          图片使用 <code>/v1/images/generations</code>；视频和 Seedance
          使用提交任务、轮询或回调、下载结果的异步流程。
        </p>
      </>
    ),
    'admin-guide': (
      <>
        <h2>配置上游账号</h2>
        <p>
          确认凭证状态、并发上限和冷却策略，生产修改前先记录当前配置和回滚信息。
        </p>
        <h2>创建渠道与分组</h2>
        <p>
          渠道负责 Base
          URL、平台类型、优先级、权重、超时时间和模型映射。将模型、渠道和用户权限放入同一分组，先用低成本模型验证。
        </p>
        <h2>管理员权限</h2>
        <p>
          管理员账号使用强密码和最小权限；修改密钥、支付、OAuth
          或回调配置后检查审计记录。
        </p>
      </>
    ),
    'api-reference': (
      <>
        <h2>统一地址与请求头</h2>
        <p>
          OpenAI 客户端使用站点地址加 <code>/v1</code>；Anthropic
          客户端使用站点根地址。
        </p>
        <Code>
          {
            'curl https://你的域名/v1/models \\\n  -H "Authorization: Bearer sk-your-api-key"\n\ncurl https://你的域名/v1/messages \\\n  -H "x-api-key: sk-your-api-key" \\\n  -H "anthropic-version: 2023-06-01"'
          }
        </Code>
        <h2>常用接口</h2>
        <table>
          <thead>
            <tr>
              <th>方法</th>
              <th>路径</th>
              <th>用途</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>GET</td>
              <td>
                <code>/v1/models</code>
              </td>
              <td>模型列表</td>
            </tr>
            <tr>
              <td>POST</td>
              <td>
                <code>/v1/chat/completions</code>
              </td>
              <td>对话补全</td>
            </tr>
            <tr>
              <td>POST</td>
              <td>
                <code>/v1/responses</code>
              </td>
              <td>Responses</td>
            </tr>
            <tr>
              <td>POST</td>
              <td>
                <code>/v1/messages</code>
              </td>
              <td>Claude Messages</td>
            </tr>
            <tr>
              <td>POST</td>
              <td>
                <code>/v1/videos/generations</code>
              </td>
              <td>Seedance 视频任务</td>
            </tr>
          </tbody>
        </table>
        <h2>错误码</h2>
        <p>
          <code>401</code> Key 错误，<code>403</code> 权限问题，<code>429</code>{' '}
          限流，<code>503</code> 没有可用上游，<code>524</code> 代理等待超时。
        </p>
      </>
    ),
    billing: (
      <>
        <h2>扣费由三层倍率决定</h2>
        <p>模型倍率、分组倍率和实际 token 或媒体任务用量共同决定最终金额。</p>
        <h2>核对一笔费用</h2>
        <ol>
          <li>记录请求 ID、模型和时间。</li>
          <li>在用量日志确认输入、输出、缓存和媒体数量。</li>
          <li>将日志金额与钱包余额变化对照。</li>
        </ol>
      </>
    ),
    monitoring: (
      <>
        <h2>四层健康判断</h2>
        <p>
          站点健康只证明进程和数据库能工作；还要分别验证渠道连通、账号可调度和目标模型能力。
        </p>
        <div className='guide-callout-grid'>
          <div>
            <b>站点</b>
            <span>HTTP、数据库、Redis</span>
          </div>
          <div>
            <b>渠道</b>
            <span>DNS、TLS、上游响应</span>
          </div>
          <div>
            <b>账号</b>
            <span>过期、冷却、并发、额度</span>
          </div>
          <div>
            <b>模型</b>
            <span>映射、权限、请求格式</span>
          </div>
        </div>
        <h2>建议指标</h2>
        <p>
          记录成功率、P95 延迟、429/503/524 分布、渠道冷却数量和媒体任务完成率。
        </p>
      </>
    ),
    updates: (
      <>
        <h2>更新前后</h2>
        <p>
          备份数据库、应用数据、环境变量、Nginx、SSL 和当前镜像。更新后确认容器
          healthy，打开首页、登录页、控制台和文档页，并检查
          Logo、证书和静态资源。
        </p>
        <h2>回滚</h2>
        <p>切回上一份健康镜像，恢复对应 compose 配置并重新执行健康检查。</p>
      </>
    ),
    troubleshooting: (
      <>
        <h2>503：没有可调度上游</h2>
        <p>确认请求模型、Key 分组、分组模型与渠道、账号状态和最近失败原因。</p>
        <h2>524：上游连接超时</h2>
        <p>
          检查上游网络、DNS、TLS、渠道超时、反向代理超时和客户端 read timeout。
        </p>
        <h2>工单最小信息</h2>
        <p>
          提供时间、请求 ID、HTTP 状态码、模型、是否流式和分组 ID；不要提供
          Key、Cookie 或 Authorization 头。
        </p>
      </>
    ),
    security: (
      <>
        <h2>用户侧</h2>
        <ul>
          <li>每个应用和环境使用独立 Key。</li>
          <li>不要把 Key 放在浏览器、公共 CI 日志或前端源码中。</li>
          <li>泄露后立即禁用旧 Key 并轮换。</li>
        </ul>
        <h2>管理员侧</h2>
        <ul>
          <li>生产启用 HTTPS，后台使用强密码和最小权限。</li>
          <li>上游凭证只存服务端，日志默认脱敏。</li>
          <li>更新前保留数据库和配置备份。</li>
        </ul>
      </>
    ),
  }
  return copy[id] || copy['quick-start']
}

function Sidebar({
  home,
  current,
  query,
  setQuery,
  select,
  mobile,
  close,
}: {
  home: boolean
  current: string
  query: string
  setQuery: (value: string) => void
  select: (id: string) => void
  mobile: boolean
  close: () => void
}) {
  const groups = useMemo(
    () =>
      pages
        .filter((page) =>
          (page.title + page.summary)
            .toLowerCase()
            .includes(query.toLowerCase())
        )
        .reduce<Array<{ label: string; items: GuidePage[] }>>((out, page) => {
          const found = out.find((item) => item.label === page.group)
          if (found) found.items.push(page)
          else out.push({ label: page.group, items: [page] })
          return out
        }, []),
    [query]
  )
  return (
    <>
      <>
        {mobile && (
          <button
            className='guide-overlay'
            aria-label='关闭文档目录'
            onClick={close}
          />
        )}
      </>
      <aside
        className={'guide-sidebar ' + (mobile ? 'guide-sidebar-open' : '')}
      >
        <div className='guide-sidebar-brand'>
          <Mark />
          <span>
            <b>SynthAPI</b>
            <em>产品手册</em>
          </span>
        </div>
        <div className='guide-sidebar-mobile-head'>
          <span>文档目录</span>
          <button
            className='guide-icon-button'
            aria-label='关闭文档目录'
            onClick={close}
          >
            <X />
          </button>
        </div>
        <label className='guide-search'>
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder='搜索文档...'
            aria-label='搜索文档'
          />
          <kbd>{query ? '' : '⌘K'}</kbd>
        </label>
        {home ? (
          <>
            <nav className='guide-home-sidebar-actions'>
              <GuideLink
                id='quick-start'
                select={select}
                className='home-sidebar-action home-sidebar-action-cyan'
              >
                <Play />
                <span>
                  <b>普通用户开始使用</b>
                  <small>快速上手，完成第一次调用</small>
                </span>
              </GuideLink>
              <GuideLink
                id='admin-guide'
                select={select}
                className='home-sidebar-action home-sidebar-action-violet'
              >
                <Server />
                <span>
                  <b>管理员配置指南</b>
                  <small>系统配置与权限管理</small>
                </span>
              </GuideLink>
            </nav>
            <nav className='guide-home-sidebar-nav'>
              <GuideLink id='' select={select}>
                <BookOpen />
                所有文档
              </GuideLink>
              <GuideLink id='updates' select={select}>
                <Download />
                更新日志<span>v2026</span>
              </GuideLink>
              <GuideLink id='monitoring' select={select}>
                <Gauge />
                API 状态
                <i />
                <b>正常</b>
              </GuideLink>
              <GuideLink id='troubleshooting' select={select}>
                <LifeBuoy />
                常见问题
              </GuideLink>
              <a href='mailto:support@synthapi.ecobim.club'>
                <Sparkles />
                联系我们
              </a>
            </nav>
          </>
        ) : (
          <nav className='guide-nav'>
            {groups.map((group) => (
              <div className='guide-nav-group' key={group.label}>
                <p className='guide-nav-label'>{group.label}</p>
                {group.items.map((page) => {
                  const Icon = page.icon
                  return (
                    <button
                      type='button'
                      className={
                        'guide-nav-item ' +
                        (page.id === current ? 'guide-nav-item-active' : '')
                      }
                      key={page.id}
                      onClick={() => select(page.id)}
                    >
                      <Icon />
                      <span>{page.title}</span>
                      {page.id === current && (
                        <ChevronRight className='guide-nav-current' />
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>
        )}
        <div className='guide-help-card'>
          <Sparkles />
          <div>
            <b>需要帮助？</b>
            <span>查看常见问题或联系我们的团队</span>
          </div>
          <ArrowRight />
        </div>
      </aside>
    </>
  )
}

function Home({
  query,
  setQuery,
  select,
  open,
}: {
  query: string
  setQuery: (value: string) => void
  select: (id: string) => void
  open: () => void
}) {
  const results = pages.filter((page) =>
    (page.title + page.summary).toLowerCase().includes(query.toLowerCase())
  )
  return (
    <main className='guide-home-main'>
      <div className='guide-home-toprow'>
        <button
          type='button'
          className='guide-icon-button guide-home-menu'
          aria-label='打开文档目录'
          onClick={open}
        >
          <Menu />
        </button>
        <label className='guide-home-search'>
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder='API Key、503、渠道监控...'
            aria-label='搜索产品手册'
          />
          <kbd>{query ? '' : '⌘K'}</kbd>
        </label>
        <div className='guide-home-wordmark'>
          <Mark />
          <span>
            <b>SynthAPI</b>
            <em>产品手册</em>
          </span>
        </div>
      </div>
      <section className='guide-home-hero'>
        <div className='guide-home-copy'>
          <p className='guide-eyebrow'>SYNTHAPI DOCUMENTATION</p>
          <h1>先选身份，再按步骤完成</h1>
          <span className='guide-title-underline' />
          <p>
            从第一次调用到管理员运维，把复杂配置拆成能照着操作的短步骤。
            <br />
            所有说明均基于 SynthAPI 当前版本。
          </p>
          <div className='guide-home-actions'>
            <GuideLink
              id='quick-start'
              select={select}
              className='guide-primary-action'
            >
              <Play />
              普通用户开始使用
            </GuideLink>
            <GuideLink
              id='admin-guide'
              select={select}
              className='guide-secondary-action'
            >
              <Server />
              管理员配置指南
            </GuideLink>
          </div>
        </div>
        <div className='guide-home-hero-visual'>
          <span className='visual-grid' />
          <div className='visual-stack visual-stack-back' />
          <div className='visual-stack visual-stack-middle' />
          <div className='visual-stack visual-stack-front'>
            <i />
            <i />
            <i />
          </div>
        </div>
      </section>
      {query && (
        <div className='guide-search-results'>
          {results.map((page) => {
            const Icon = page.icon
            return (
              <GuideLink id={page.id} select={select} key={page.id}>
                <Icon />
                <span>
                  <strong>{page.title}</strong>
                  <small>
                    {page.group} · {page.reading}
                  </small>
                </span>
                <ChevronRight />
              </GuideLink>
            )
          })}
        </div>
      )}
      <section className='guide-home-section'>
        <div className='guide-home-heading'>
          <div>
            <p>模块导航</p>
            <h2>按模块查找</h2>
          </div>
          <span>
            查看所有模块 <ArrowRight />
          </span>
        </div>
        <div className='guide-module-grid'>
          {modules.map(([title, description, Icon, tone, id]) => (
            <GuideLink
              id={id}
              select={select}
              key={id}
              className='guide-module-entry'
            >
              <span className={'guide-module-icon guide-module-icon-' + tone}>
                <Icon />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
              <span className='guide-module-arrow'>
                <ArrowRight />
              </span>
            </GuideLink>
          ))}
        </div>
      </section>
      <section className='guide-role-band'>
        <div className='guide-home-heading'>
          <div>
            <p>身份导航</p>
            <h2>按身份阅读</h2>
          </div>
          <span>选择你的身份，查看相关内容</span>
        </div>
        <div className='guide-role-grid'>
          {roles.map(([title, description, Icon, tone, steps]) => (
            <article className='guide-role-path' key={title}>
              <span className={'guide-role-avatar guide-role-avatar-' + tone}>
                <Icon />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
              <ol>
                {steps.map(([label, id], index) => (
                  <li key={id}>
                    <b>{String(index + 1).padStart(2, '0')}</b>
                    <GuideLink id={id} select={select}>
                      {label}
                      <ArrowRight />
                    </GuideLink>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </section>
      <section className='guide-reading-route'>
        <div className='guide-home-heading'>
          <div>
            <p>推荐路线</p>
            <h2>第一次使用，按 01 → 02 → 03 阅读</h2>
          </div>
          <span>约 20 分钟建立完整认识</span>
        </div>
        <div className='guide-reading-list'>
          {route.map(([number, role, title, description, id]) => (
            <GuideLink id={id} select={select} key={number}>
              <strong>{number}</strong>
              <div>
                <small>{role}</small>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
              <ArrowRight />
            </GuideLink>
          ))}
        </div>
      </section>
      <section className='guide-download-band'>
        <div>
          <p>离线阅读</p>
          <h2>下载完整产品使用手册</h2>
          <span>在线指南持续更新，生产配置请以当前站点为准。</span>
        </div>
        <div className='guide-download-actions'>
          <a href='/docs' download>
            <Download />
            下载手册
          </a>
          <Link to='/sign-up'>
            <Play />
            开始使用
          </Link>
        </div>
      </section>
    </main>
  )
}

function Article({
  page,
  select,
}: {
  page: GuidePage
  select: (id: string) => void
}) {
  useEffect(() => {
    document
      .querySelectorAll<HTMLElement>('.guide-article h2')
      .forEach((heading, index) => {
        heading.id = `guide-section-${index + 1}`
      })
  }, [page.id])
  const index = pages.findIndex((item) => item.id === page.id)
  const previous = pages[index - 1]
  const next = pages[index + 1]
  const sections = pageSections[page.id] ?? pageSections['quick-start']
  return (
    <main className='guide-article-main'>
      <div className='guide-article-container'>
        <div className='guide-breadcrumb'>
          <span>产品手册</span>
          <ChevronRight />
          <span>{page.group}</span>
          <ChevronRight />
          <strong>{page.title}</strong>
        </div>
        <section className='guide-intro'>
          <div className='guide-intro-copy'>
            <p className='guide-eyebrow'>{page.eyebrow}</p>
            <h1>{page.title}</h1>
            <span className='guide-title-underline' />
            <p className='guide-summary'>{page.summary}</p>
            <div className='guide-meta'>
              <span>
                <Clock3 />
                阅读约 {page.reading}
              </span>
              <span>
                <CalendarDays />
                更新于 2026-08-19
              </span>
            </div>
          </div>
          <div className='guide-article-visual'>
            <div />
            <div />
            <div />
            <span>
              <Code2 />
            </span>
          </div>
        </section>
        <div className='guide-workspace'>
          <article className='guide-article'>{Body({ id: page.id })}</article>
          <aside className='guide-toc'>
            <p>本页目录</p>
            {sections.map((section, sectionIndex) => (
              <button
                type='button'
                key={section}
                onClick={() =>
                  document
                    .getElementById(`guide-section-${sectionIndex + 1}`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              >
                {section}
              </button>
            ))}
            <div className='guide-toc-help'>
              <span>这篇内容有帮助吗？</span>
              <button aria-label='有帮助'>
                <Check />
              </button>
              <button aria-label='没有帮助'>
                <X />
              </button>
            </div>
          </aside>
        </div>
        <nav className='guide-pager'>
          <span>
            {previous && (
              <button
                type='button'
                className='guide-pager-button'
                onClick={() => select(previous.id)}
              >
                <ArrowLeft />
                <span>
                  <small>上一篇</small>
                  {previous.title}
                </span>
              </button>
            )}
          </span>
          <span>
            {next && (
              <button
                type='button'
                className='guide-pager-button guide-pager-next'
                onClick={() => select(next.id)}
              >
                <span>
                  <small>下一篇</small>
                  {next.title}
                </span>
                <ArrowRight />
              </button>
            )}
          </span>
        </nav>
      </div>
    </main>
  )
}

function Topbar({ open }: { open: () => void }) {
  return (
    <header className='guide-topbar'>
      <div className='guide-topbar-brand'>
        <button
          className='guide-icon-button guide-mobile-menu'
          aria-label='打开文档目录'
          onClick={open}
        >
          <Menu />
        </button>
        <a href='/docs' className='guide-brand-link'>
          <Mark />
          <span>
            <b>SynthAPI</b>
            <em>产品手册</em>
          </span>
        </a>
      </div>
      <div className='guide-topbar-actions'>
        <span>
          当前版本 2026.08 <ChevronRight />
        </span>
        <a href='/docs' download>
          <Download />
          下载手册
        </a>
        <Link to='/'>
          <ArrowLeft />
          返回站点
        </Link>
      </div>
    </header>
  )
}

export function Docs() {
  const [current, setCurrent] = useState(() =>
    window.location.hash.replace(/^#/, '')
  )
  const [query, setQuery] = useState('')
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const onHash = () => setCurrent(window.location.hash.replace(/^#/, ''))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const select = (id: string) => {
    setCurrent(id)
    setQuery('')
    setMobile(false)
    window.history.replaceState(null, '', id ? '/docs#' + id : '/docs')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const page = pages.find((item) => item.id === current) || pages[0]
  const home = !current
  return (
    <div
      className={
        'guide-shell ' + (home ? 'guide-shell-home' : 'guide-shell-article')
      }
    >
      {!home && <Topbar open={() => setMobile(true)} />}
      <div className='guide-frame'>
        <Sidebar
          home={home}
          current={current}
          query={query}
          setQuery={setQuery}
          select={select}
          mobile={mobile}
          close={() => setMobile(false)}
        />
        {home ? (
          <Home
            query={query}
            setQuery={setQuery}
            select={select}
            open={() => setMobile(true)}
          />
        ) : (
          <Article page={page} select={select} />
        )}
      </div>
    </div>
  )
}
