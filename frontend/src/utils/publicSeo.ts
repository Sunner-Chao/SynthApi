import type { RouteLocationNormalizedLoaded } from 'vue-router'

const origin = 'https://synthapi.ecobim.club'

type PublicSeo = {
  title: string
  description: string
  canonical: string
  robots: string
}

const guideSeo: Record<string, Pick<PublicSeo, 'title' | 'description'>> = {
  'quick-start': {
    title: 'SynthAPI 快速开始：创建 API Key 并完成第一条请求',
    description: '从注册、创建 API Key 到完成第一条兼容 OpenAI 的模型请求。'
  },
  concepts: {
    title: 'SynthAPI 用户、分组、渠道与上游账号的关系',
    description: '理解 SynthAPI 四层配置关系，快速定位模型不可用问题。'
  },
  'user-guide': {
    title: 'SynthAPI 用户指南：API Key、模型、余额与用量',
    description: '管理 SynthAPI API Key、可用模型、余额、订阅和请求用量。'
  },
  'admin-guide': {
    title: 'SynthAPI 管理员指南：账号、渠道、分组和计费',
    description: '配置 SynthAPI 上游账号、渠道、模型分组、倍率和连接性监控。'
  },
  'api-reference': {
    title: 'SynthAPI API 接入指南：兼容 OpenAI 的调用示例',
    description: '使用 OpenAI SDK 接入 SynthAPI，配置 base URL、API Key、流式输出和错误处理。'
  },
  billing: {
    title: 'SynthAPI 余额、订阅和用量记录如何对账',
    description: '区分余额、冻结金额、订单状态与请求用量。'
  },
  monitoring: {
    title: 'SynthAPI 渠道监控：连通性与能力探测',
    description: '区分 DNS、TLS、HTTP 连通性和真实模型能力探测。'
  },
  updates: {
    title: 'SynthAPI 官方源码同步与定制保护',
    description: '了解 SynthAPI 同步 Sub2API 官方版本、保护定制和健康检查的流程。'
  },
  troubleshooting: {
    title: 'SynthAPI 503、524 和流式请求断开排查',
    description: '区分无可用账号、上游超时和流式断开，逐层检查模型、分组、渠道和账号。'
  },
  security: {
    title: 'SynthAPI 安全与隐私：API Key、日志和数据边界',
    description: '安全管理 API Key、上游凭据、日志、支付回调和客户数据。'
  }
}

export function resolvePublicSeo(route: Pick<RouteLocationNormalizedLoaded, 'path' | 'params'>): PublicSeo {
  const normalizedPath = route.path.replace(/\/$/, '') || '/'
  if (normalizedPath === '/' || normalizedPath === '/home') {
    return {
      title: 'SynthAPI - 多模型 AI API 网关',
      description: 'SynthAPI 是面向开发者与团队的多模型 AI API 网关，提供统一 API Key、兼容 OpenAI 的接口、渠道路由、用量计费和故障诊断。',
      canonical: `${origin}/home`,
      robots: 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'
    }
  }
  if (normalizedPath === '/about') {
    return {
      title: 'SynthAPI 是什么：产品、开源关系与能力边界',
      description: '了解 SynthAPI 与 Sub2API 的关系、多模型 AI API 网关能力、第三方依赖和不作出的服务承诺。',
      canonical: `${origin}/about`,
      robots: 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'
    }
  }
  if (normalizedPath === '/guide') {
    return {
      title: 'SynthAPI 产品手册与 API 使用指南',
      description: 'SynthAPI 文档中心，包含快速开始、API 接入、计费、监控、安全和 503/524 排查。',
      canonical: `${origin}/guide`,
      robots: 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'
    }
  }
  if (normalizedPath.startsWith('/guide/')) {
    const section = typeof route.params.section === 'string'
      ? route.params.section
      : normalizedPath.slice('/guide/'.length)
    const metadata = guideSeo[section]
    if (metadata) {
      return {
        ...metadata,
        canonical: `${origin}/guide/${section}`,
        robots: 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'
      }
    }
  }
  if (normalizedPath === '/model-plaza') {
    return {
      title: 'SynthAPI 可用模型与渠道',
      description: '查看 SynthAPI 当前公开的模型和渠道说明；实际可用范围取决于用户权限、分组和上游状态。',
      canonical: `${origin}/model-plaza`,
      robots: 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'
    }
  }
  return {
    title: 'SynthAPI',
    description: 'SynthAPI 用户与管理页面。',
    canonical: `${origin}/home`,
    robots: 'noindex,nofollow,noarchive'
  }
}

function upsertMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector)
  if (!element) {
    element = document.createElement('meta')
    document.head.appendChild(element)
  }
  Object.entries(attributes).forEach(([key, value]) => element?.setAttribute(key, value))
}

export function applyPublicSeo(route: Pick<RouteLocationNormalizedLoaded, 'path' | 'params'>) {
  const seo = resolvePublicSeo(route)
  document.title = seo.title
  upsertMeta('meta[name="description"]', { name: 'description', content: seo.description })
  upsertMeta('meta[name="robots"]', { name: 'robots', content: seo.robots })
  upsertMeta('meta[property="og:title"]', { property: 'og:title', content: seo.title })
  upsertMeta('meta[property="og:description"]', { property: 'og:description', content: seo.description })
  upsertMeta('meta[property="og:url"]', { property: 'og:url', content: seo.canonical })

  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!canonical) {
    canonical = document.createElement('link')
    canonical.rel = 'canonical'
    document.head.appendChild(canonical)
  }
  canonical.href = seo.canonical
}
