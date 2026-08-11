<template>
  <div class="guide-shell" :class="isGuideHome ? 'guide-shell-home' : 'guide-shell-article'">
    <header v-if="!isGuideHome" class="guide-topbar">
      <div class="guide-topbar-brand">
        <button class="guide-icon-button guide-mobile-menu" aria-label="打开文档目录" title="打开文档目录" @click="mobileNavOpen = true"><Icon name="menu" size="md" /></button>
        <router-link to="/guide" class="guide-brand-link"><span class="guide-mark"><Icon name="book" size="sm" /></span><span><b>SynthAPI</b><em>产品手册</em></span></router-link>
      </div>
      <div class="guide-topbar-actions">
        <span>当前版本&nbsp; 0.1.173 <Icon name="chevronDown" size="xs" /></span>
        <a href="/downloads/SynthAPI-产品使用手册-v0.1.173.pdf" download><Icon name="download" size="sm" />下载手册</a>
        <router-link to="/home"><Icon name="home" size="sm" />返回站点</router-link>
      </div>
    </header>

    <div v-if="mobileNavOpen" class="guide-overlay" @click="mobileNavOpen = false"></div>
    <div class="guide-frame">
      <aside class="guide-sidebar" :class="{ 'guide-sidebar-open': mobileNavOpen }" aria-label="产品手册目录">
        <div class="guide-sidebar-brand"><span class="guide-mark"><Icon name="book" size="sm" /></span><span><b>SynthAPI</b><em>产品手册</em></span></div>
        <div class="guide-sidebar-mobile-head"><span>文档目录</span><button class="guide-icon-button" aria-label="关闭文档目录" title="关闭文档目录" @click="mobileNavOpen = false"><Icon name="x" size="sm" /></button></div>
        <label class="guide-search"><Icon name="search" size="sm" /><input v-model="searchQuery" type="search" placeholder="搜索文档..." aria-label="搜索文档" /><kbd v-if="!searchQuery">⌘K</kbd></label>

        <template v-if="isGuideHome">
          <nav class="guide-home-sidebar-actions" aria-label="开始使用">
            <router-link to="/guide/quick-start" class="home-sidebar-action home-sidebar-action-cyan"><Icon name="play" size="lg" /><span><b>普通用户开始使用</b><small>快速上手，完成第一次调用</small></span></router-link>
            <router-link to="/guide/admin-guide" class="home-sidebar-action home-sidebar-action-violet"><Icon name="cog" size="lg" /><span><b>管理员配置指南</b><small>系统配置与权限管理</small></span></router-link>
          </nav>
          <nav class="guide-home-sidebar-nav" aria-label="文档快捷入口">
            <router-link to="/guide"><Icon name="document" size="sm" />所有文档</router-link>
            <router-link to="/guide/updates"><Icon name="sync" size="sm" />更新日志<span>v0.1.173</span></router-link>
            <router-link to="/guide/monitoring"><Icon name="chart" size="sm" />API 状态<i></i><b>正常</b></router-link>
            <router-link to="/guide/troubleshooting"><Icon name="questionCircle" size="sm" />常见问题</router-link>
            <a href="mailto:support@synthapi.ecobim.club"><Icon name="chat" size="sm" />联系我们</a>
          </nav>
        </template>
        <nav v-else class="guide-nav" aria-label="文档章节">
          <div v-for="group in filteredGroups" :key="group.label" class="guide-nav-group"><p class="guide-nav-label">{{ group.label }}</p><button v-for="item in group.items" :key="item.id" type="button" class="guide-nav-item" :class="{ 'guide-nav-item-active': item.id === currentPage.id }" @click="selectPage(item.id)"><Icon :name="item.icon" size="sm" /><span>{{ item.title }}</span><Icon v-if="item.id === currentPage.id" name="chevronRight" size="xs" class="guide-nav-current" /></button></div>
          <p v-if="filteredGroups.length === 0" class="guide-nav-empty">没有匹配的章节。换个关键词试试。</p>
        </nav>
        <div class="guide-help-card"><Icon name="sparkles" size="sm" /><div><b>需要帮助？</b><span>查看常见问题或联系我们的团队</span></div><Icon name="arrowRight" size="sm" /></div>
      </aside>

      <main v-if="isGuideHome" class="guide-home-main">
        <div class="guide-home-toprow"><button class="guide-icon-button guide-home-menu" aria-label="打开文档目录" title="打开文档目录" @click="mobileNavOpen = true"><Icon name="menu" size="md" /></button><label class="guide-home-search"><Icon name="search" size="sm" /><input v-model="searchQuery" type="search" placeholder="API Key、503、渠道监控..." aria-label="搜索产品手册" /><kbd v-if="!searchQuery">⌘K</kbd></label><div class="guide-home-wordmark"><span class="guide-cube-mark">✦</span><span><b>SynthAPI</b><em>产品手册</em></span></div></div>
        <section class="guide-home-hero">
          <div class="guide-home-copy"><p class="guide-eyebrow">SYNTHAPI DOCUMENTATION</p><h1>先选身份，再按步骤完成</h1><span class="guide-title-underline"></span><p>从第一次调用到管理员运维，把复杂配置拆成能照着操作的短步骤。<br />所有说明均基于 SynthAPI 当前版本。</p><div class="guide-home-actions"><router-link class="guide-primary-action" to="/guide/quick-start"><Icon name="play" size="sm" />普通用户开始使用</router-link><router-link class="guide-secondary-action" to="/guide/admin-guide"><Icon name="cog" size="sm" />管理员配置指南</router-link></div></div>
          <div class="guide-home-hero-visual" aria-hidden="true"><span class="visual-grid"></span><div class="visual-stack visual-stack-back"></div><div class="visual-stack visual-stack-middle"></div><div class="visual-stack visual-stack-front"><i></i><i></i><i></i></div><span class="visual-spark visual-spark-one"></span><span class="visual-spark visual-spark-two"></span></div>
        </section>
        <section class="guide-home-search-band"><div v-if="searchQuery" class="guide-search-results"><router-link v-for="page in landingSearchResults" :key="page.id" :to="`/guide/${page.id}`"><Icon :name="page.icon" size="sm" /><span><strong>{{ page.title }}</strong><small>{{ page.group }} · {{ page.reading }}</small></span><Icon name="chevronRight" size="xs" /></router-link><p v-if="landingSearchResults.length === 0">没有匹配结果，请换一个更短的关键词。</p></div></section>
        <section class="guide-home-section"><div class="guide-home-heading"><div><p>模块导航</p><h2>按模块查找</h2></div><span>查看所有模块 <Icon name="arrowRight" size="sm" /></span></div><div class="guide-module-grid"><router-link v-for="entry in moduleEntries.slice(0, 4)" :key="entry.to" :to="entry.to" class="guide-module-entry"><span :class="`guide-module-icon guide-module-icon-${entry.tone}`"><Icon :name="entry.icon" size="lg" /></span><div><h3>{{ entry.title }}</h3><p>{{ entry.description }}</p></div><span class="guide-module-arrow"><Icon name="arrowRight" size="sm" /></span></router-link></div></section>
        <section class="guide-role-band"><div class="guide-home-heading"><div><p>身份导航</p><h2>按身份阅读</h2></div><span>选择你的身份，查看相关内容</span></div><div class="guide-role-grid"><article v-for="(role, roleIndex) in rolePaths" :key="role.title" class="guide-role-path"><span class="guide-role-avatar" :class="`guide-role-avatar-${roleIndex}`"><i></i><b></b></span><div><h3>{{ role.title }}</h3><p>{{ role.description }}</p></div><ol><li v-for="(step, index) in role.steps" :key="step.to"><b>{{ String(index + 1).padStart(2, '0') }}</b><router-link :to="step.to">{{ step.label }}<Icon name="arrowRight" size="xs" /></router-link></li></ol></article></div></section>
        <section class="guide-reading-route"><div class="guide-home-heading"><div><p>推荐路线</p><h2>第一次使用，按 01 → 02 → 03 阅读</h2></div><span>约 20 分钟建立完整认识</span></div><div class="guide-reading-list"><router-link v-for="item in readingRoute" :key="item.number" :to="item.to"><strong>{{ item.number }}</strong><div><small>{{ item.for }}</small><h3>{{ item.title }}</h3><p>{{ item.description }}</p></div><Icon name="arrowRight" size="sm" /></router-link></div></section>
        <section class="guide-download-band"><div><p>离线阅读</p><h2>下载完整产品使用手册</h2><span>PDF 适合阅读和打印；PPTX 保留可编辑页面，内容与当前在线指南一致。</span></div><div class="guide-download-actions"><a href="/downloads/SynthAPI-产品使用手册-v0.1.173.pdf" download><Icon name="download" size="sm" />下载 PDF</a><a href="/downloads/SynthAPI-产品使用手册-v0.1.173.pptx" download><Icon name="document" size="sm" />下载 PPTX</a></div></section>
      </main>

      <main v-else class="guide-article-main">
        <div class="guide-article-container"><div class="guide-breadcrumb"><span>产品手册</span><Icon name="chevronRight" size="xs" /><span>{{ currentPage.group }}</span><Icon name="chevronRight" size="xs" /><strong>{{ currentPage.title }}</strong></div><section class="guide-intro"><div class="guide-intro-copy"><p class="guide-eyebrow">{{ currentPage.eyebrow }}</p><h1>{{ currentPage.title }}</h1><span class="guide-title-underline"></span><p class="guide-summary">{{ currentPage.summary }}</p><div class="guide-meta"><span><Icon name="clock" size="xs" />阅读约 {{ currentPage.reading }}</span><span><Icon name="calendar" size="xs" />更新于 {{ currentPage.updated }}</span></div></div><GuideDiagram :kind="currentPage.diagram" :title="currentPage.diagramTitle" /></section><section v-if="currentScreenshots.length > 0" aria-label="页面操作截图"><GuideScreenshot v-for="screenshot in currentScreenshots" :key="screenshot.src" v-bind="screenshot" /></section><div class="guide-workspace"><article class="guide-article" v-html="renderedContent"></article><aside v-if="toc.length > 0" class="guide-toc" aria-label="本页目录"><p>本页目录</p><a v-for="item in toc" :key="item.id" :href="`#${item.id}`">{{ item.title }}</a><div class="guide-toc-help"><span>这篇内容有帮助吗？</span><button aria-label="有帮助"><Icon name="check" size="sm" /></button><button aria-label="没有帮助"><Icon name="x" size="sm" /></button></div></aside></div><nav class="guide-pager" aria-label="文档翻页"><button v-if="previousPage" type="button" class="guide-pager-button" @click="selectPage(previousPage.id)"><Icon name="arrowLeft" size="sm" /><span><small>上一篇</small>{{ previousPage.title }}</span></button><span v-else></span><button v-if="nextPage" type="button" class="guide-pager-button guide-pager-next" @click="selectPage(nextPage.id)"><span><small>下一篇</small>{{ nextPage.title }}</span><Icon name="arrowRight" size="sm" /></button></nav></div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import Icon from '@/components/icons/Icon.vue'
import GuideDiagram from '@/components/Guide/GuideDiagram.vue'
import GuideScreenshot, { type GuideScreenshotMarker } from '@/components/Guide/GuideScreenshot.vue'

type IconName = 'play' | 'book' | 'user' | 'key' | 'server' | 'dollar' | 'chart' | 'refresh' | 'shield' | 'questionCircle'
type DiagramKind = 'pipeline' | 'admin' | 'api' | 'billing' | 'monitor' | 'update' | 'troubleshoot' | 'security' | 'concepts'
type GuidePage = {
  id: string
  group: string
  icon: IconName
  eyebrow: string
  title: string
  summary: string
  reading: string
  updated: string
  diagram: DiagramKind
  diagramTitle: string
  content: string
}

const pages: GuidePage[] = [
  {
    id: 'quick-start', group: '开始使用', icon: 'play', eyebrow: 'START HERE', title: '5 分钟跑通第一条请求',
    summary: '从注册账号、创建 API Key，到调用一个聊天模型。照着做完，你会知道请求到底经过了哪些环节。', reading: '4 分钟', updated: '2026-08-10', diagram: 'pipeline', diagramTitle: '一条请求的路径',
    content: String.raw`# 5 分钟跑通第一条请求

这页只做一件事：让你用自己的 API Key 得到一次成功响应。首次使用不需要理解所有高级设置。

## 你需要准备什么

- 一个已经完成邮箱验证的站点账号。
- 账户中有可用余额，或管理员已为你的用户开通免费额度。
- 一个可用的模型分组。分组是“允许使用哪些模型、走哪些渠道”的规则集合。

## 第 1 步：注册并登录

打开站点首页，选择“注册”，填写邮箱和密码，完成邮件验证后登录。如果站点关闭了公开注册，请联系管理员创建账号。忘记密码时使用“忘记密码”，不要重复注册同一个邮箱。

## 第 2 步：创建 API Key

进入“API Keys”，点击“新建 Key”，填写一个便于识别的名称，选择分组后创建。密钥只在创建成功时完整显示一次，建议立即复制并放进密码管理器。

> API Key 等同于调用权限。不要把它写进前端代码、公开仓库、截图或工单。

## 第 3 步：先用 curl 验证

将下面的地址替换成你的站点域名，将 \`sk-替换成你的密钥\` 换成真实 Key。模型名必须是分组中已启用的模型。

~~~bash
curl https://你的域名/v1/chat/completions \
  -H "Authorization: Bearer sk-替换成你的密钥" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "只回复：连接成功"}]
  }'
~~~

看到 HTTP \`200\`，并在 \`choices[0].message.content\` 中看到回复，就说明账号、Key、分组和至少一个渠道都已打通。

## 成功判定

| 检查项 | 正常表现 |
| --- | --- |
| 登录 | 能看到控制台侧栏 |
| API Key | 状态为启用，且绑定了正确分组 |
| 请求 | 返回 \`200\`，响应体是 JSON |
| 计费 | “用量记录”出现一条对应记录 |

## 常见坑

\`401\` 通常是 Key 缺失、复制不完整或已禁用；\`403\` 多半是用户权限或分组不允许；\`404\` 常见于把 \`/v1\` 写成了 \`/api\`；\`503\` 不是 Key 格式问题，优先按“503/524 排查”检查渠道和账号池。

下一步可以阅读[概念速查](/guide/concepts)，理解用户、分组、渠道、账号之间的关系。`
  },
  {
    id: 'concepts', group: '开始使用', icon: 'book', eyebrow: 'BASICS', title: '先搞懂 4 个核心对象',
    summary: '用户负责权限，分组负责路由，渠道负责上游地址，账号负责实际凭证。把这四层分开，排错会简单很多。', reading: '5 分钟', updated: '2026-08-10', diagram: 'concepts', diagramTitle: '配置关系图',
    content: String.raw`# 先搞懂 4 个核心对象

## 用户：谁可以调用

用户是登录站点的人。管理员可以设置角色、余额、订阅、状态和可用分组。删除用户会使其 Key 失效，但不会自动修复一个已经失败的上游渠道；渠道属于系统配置，和某个用户不是同一个对象。

## API Key：用什么身份调用

Key 是调用入口的凭证，可绑定一个默认分组，也可以按站点策略使用多个分组。禁用 Key 会立即阻止新请求，历史用量不会被删除。轮换 Key 时先创建新 Key，验证成功后再停用旧 Key，避免业务中断。

## 分组：请求走哪条规则

分组包含模型白名单、渠道排序、倍率和权限。一个模型可能在多个分组出现，最终能否调用取决于“用户权限 + Key 绑定 + 分组状态 + 渠道可用性”。分组名称只是展示文字，排错时要看分组 ID 和模型配置。

## 渠道：上游服务入口

渠道保存上游 Base URL、平台类型、优先级、权重、超时时间和状态。它回答“请求发给哪家上游”。渠道健康不等于账号健康：渠道 URL 可达，但池内账号可能全部过期、限流或额度耗尽。

## 账号：真正发出请求的凭证

账号属于渠道，保存 OAuth、API Key 或其他上游凭证。调度器会跳过禁用、冷却、过期和并发达到上限的账号。出现 \`no available accounts\` 时，先看账号池，再看域名和容器。

## 一句话记忆

**用户/Key 决定“能不能进来”，分组决定“允许调用什么”，渠道决定“发到哪里”，账号决定“由谁发出”。**

## 推荐的排错顺序

1. 看响应状态码和请求模型。
2. 确认 Key 未禁用、绑定分组正确。
3. 确认分组启用该模型且至少有一个启用渠道。
4. 在渠道详情检查账号状态、最近失败和冷却时间。
5. 最后检查上游 DNS、网络和超时。

这套顺序能避免把用户问题误判成服务器问题。`
  },
  {
    id: 'user-guide', group: '使用指南', icon: 'user', eyebrow: 'FOR USERS', title: '用户控制台：余额、模型与用量',
    summary: '掌握用户侧最常用的几个页面：看余额、选模型、管理 Key、查用量和处理订阅。', reading: '6 分钟', updated: '2026-08-10', diagram: 'api', diagramTitle: '用户侧工作流',
    content: String.raw`# 用户控制台：余额、模型与用量

## 首页与控制台

登录后，控制台展示当前余额、订阅状态、近期用量和可用模型。余额是计费前的可用金额，冻结金额可能来自正在结算的请求或订单；两者不要相加后重复判断。

## API Keys 页面

每个 Key 都有名称、状态、绑定分组、创建时间和最近使用时间。日常建议：一个应用一个 Key；不同环境分开；不再使用就禁用；怀疑泄露就立即删除并新建。Key 绑定的分组变更后，新请求按最新权限判断。

## 可用渠道与模型

“可用渠道”用于查看管理员开放给你的模型和路由说明。模型名要原样复制，例如 \`gpt-4o-mini\` 与 \`GPT-4O-MINI\` 不是同一个字符串。图片、视频等媒体模型还会受到请求格式、文件大小和上游能力限制。

## 用量记录

用量记录按时间、模型、请求类型、输入/输出 token、媒体数量和费用展示。流式请求可能在连接结束后才写入最终用量；请求刚结束时暂时看不到记录不代表没有扣费。以记录页最终金额为准。

## 充值、订阅与兑换码

充值增加余额，订阅通常改变有效期、倍率或额度，兑换码则按管理员设置兑换余额或权益。支付完成但余额未变化时，先查看订单状态，再等待异步回调；不要连续重复支付。订单号、支付时间和金额是提交工单时最有用的信息。

## 图片与视频请求

图片请求通常使用 \`/v1/images/generations\` 或兼容的响应格式；视频和 Seedance 可能是“提交任务 -> 轮询/回调 -> 下载结果”。媒体请求耗时更长，客户端应设置合理超时并保留请求 ID，不要把 60 秒内无响应直接当作失败。

## 账号删除后为什么还可能报错

删除的是用户对象，不会删除管理员配置的渠道和上游账号。若删除用户后仍看到 503，说明请求可能来自另一个 Key、另一个用户，或渠道账号池本身不可用，应查看服务端日志中的 \`group_id\`、模型和 \`no available accounts\`。
`
  },
  {
    id: 'admin-guide', group: '管理员手册', icon: 'server', eyebrow: 'FOR ADMINS', title: '管理员配置：账号、渠道、分组',
    summary: '用最少的配置建立一条可控路由，并知道每个开关会影响什么。生产环境修改前请先保留凭证和回滚信息。', reading: '8 分钟', updated: '2026-08-10', diagram: 'admin', diagramTitle: '管理员配置顺序',
    content: String.raw`# 管理员配置：账号、渠道、分组

## 推荐配置顺序

1. 在“账号”中录入上游凭证，确认账号状态可用。
2. 在“渠道”中填写 Base URL、平台类型和超时策略。
3. 在“分组”中添加模型、绑定渠道并设置排序/倍率。
4. 创建一个测试用户和 Key，先发一条低成本请求。
5. 打开监控，确认成功率和延迟趋势后再放量。

## 账号配置

账号名称用于识别，凭证字段只在服务端保存和使用。OAuth 账号要关注过期时间、刷新状态和最近一次失败；API Key 账号要确认上游权限包含目标模型。不要把完整 token 放在备注、截图或日志里。

## 渠道配置

渠道的 Base URL 应填写上游 API 根地址，不要重复拼接 \`/v1\`；是否需要 \`/v1\` 取决于平台适配器。超时时间需要覆盖正常响应，但也要防止单个上游长时间占住连接。优先级越高不一定永远独占，具体还受权重、冷却和并发限制影响。

## 分组与模型

分组是用户能看到的“产品线路”。添加模型时同时确认：模型名称、输入输出能力、价格倍率、是否允许流式、是否允许图片/视频。只配置模型而没有可用渠道，用户仍会收到 \`503\`。

## 定价与倍率

倍率是内部结算规则，不代表上游真实报价。改价前先检查现有订阅和历史记录的口径；新价格通常只影响后续请求。对媒体模型单独核对图片尺寸、视频时长、音频时长等计费维度。

## 连接性监控

监控支持“仅连通性”模式：只验证 DNS、TLS、HTTP 状态和响应耗时，不发送真实生成内容，适合你之前配置的 \`gpt-image-02\` 上游。若要验证完整能力，必须明确使用测试账号、低成本模型和限流窗口。

## 修改后的成功判定

不要只看页面上的“正常”标签。至少完成一次无真实生成的连通性检查、一次低成本真实请求，并在用量记录和监控趋势中核对结果。`
  },
  {
    id: 'api-reference', group: 'API 参考', icon: 'key', eyebrow: 'FOR DEVELOPERS', title: 'API 接入：兼容 OpenAI 的最小示例',
    summary: '大多数 OpenAI SDK 只需修改 baseURL 和 API Key。下面给出聊天、流式、图片和错误处理的最小模板。', reading: '7 分钟', updated: '2026-08-10', diagram: 'api', diagramTitle: 'SDK 接入位置',
    content: String.raw`# API 接入：兼容 OpenAI 的最小示例

## 统一入口

将 SDK 的 \`baseURL\` 指向 \`https://你的域名/v1\`，认证使用 \`Authorization: Bearer <API_KEY>\`。不要把站点域名写成上游域名，也不要同时拼接两个 \`/v1\`。

~~~python
from openai import OpenAI

client = OpenAI(
    api_key="sk-你的Key",
    base_url="https://你的域名/v1",
)
response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "你好"}],
)
print(response.choices[0].message.content)
~~~

## 流式输出

将 \`stream=True\` 后逐个读取 \`delta.content\`。客户端要设置连接读取超时，并在异常时记录请求 ID；不要在代理层把流式响应缓存成整段 JSON。

~~~python
stream = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "用三句话介绍 API 网关"}],
    stream=True,
)
for chunk in stream:
    text = chunk.choices[0].delta.content or ""
    print(text, end="", flush=True)
~~~

## 图片和视频

图片一般使用 \`images.generate\`，视频/Seedance 可能使用站点提供的专用路径。以“可用模型”页面和实际 OpenAPI 文档为准，不要根据模型名称猜请求格式。媒体接口返回任务 ID 时，应轮询任务状态并设置最大等待时间。

## 错误处理表

| 状态 | 含义 | 第一动作 |
| --- | --- | --- |
| \`400\` | 参数或格式错误 | 检查模型、必填字段和 JSON |
| \`401\` | Key 无效 | 重新复制 Key，确认未禁用 |
| \`403\` | 没有权限 | 检查用户、Key 与分组 |
| \`404\` | 路径或模型不存在 | 核对 \`/v1\` 和模型名 |
| \`429\` | 限流或并发达到上限 | 降低并发并等待冷却 |
| \`500\` | 网关内部异常 | 记录请求 ID，查看服务日志 |
| \`503\` | 没有可调度上游 | 查账号、渠道和分组 |
| \`524\` | 上游连接超时 | 查上游网络和超时时间 |

## 不要忽略请求 ID

响应头或错误体中的请求 ID 是服务端定位日志的索引。提交问题时同时提供时间（含时区）、模型、状态码、请求 ID 和是否流式；不要提供 API Key 或完整 prompt。`
  },
  {
    id: 'billing', group: '运营与计费', icon: 'dollar', eyebrow: 'MONEY & QUOTA', title: '余额、订阅与用量怎么对账',
    summary: '把“余额变化”“订单状态”“用量记录”三件事分开核对，能快速定位支付成功但额度未到账等问题。', reading: '5 分钟', updated: '2026-08-10', diagram: 'billing', diagramTitle: '一次请求的计费链路',
    content: String.raw`# 余额、订阅与用量怎么对账

## 三个数字不要混看

- **可用余额**： 当前可以用于扣费的金额。
- **冻结金额**： 请求或订单结算期间暂时锁定的金额。
- **累计用量**： 按请求记录统计的历史费用，不等于当前余额。

## 一次请求如何计费

网关先校验权限和余额，再选择渠道和账号。请求完成后根据模型、输入输出 token、媒体数量或任务时长计算费用，写入用量记录并释放/结算冻结金额。上游失败通常不会产生完整成功费用，但重试、部分输出和媒体任务应以记录页为准。

## 支付未到账

1. 在“我的订单”确认订单是否为已支付。
2. 核对支付渠道、订单号、金额和支付时间。
3. 刷新控制台，等待异步回调处理。
4. 仍未到账时提交订单号，不要重复支付。

支付宝、Stripe、Airwallex 等渠道的回调地址必须使用当前域名且可从公网访问。更换域名后要同步检查支付配置、Caddy/反向代理和回调白名单。

## 管理员核账

管理员在用量、订单和审计日志中交叉核对。改价或倍率后，保留变更时间和操作者；不要直接修改历史用量来“对齐”金额，这会破坏审计和用户争议处理。

## 退款与订阅

退款是否恢复余额、撤销订阅或保留已消耗额度，取决于站点运营规则。对外说明时写清生效时间、不可退款条件和处理时限，页面配置与客服口径保持一致。`
  },
  {
    id: 'monitoring', group: '运维与监控', icon: 'chart', eyebrow: 'OPERATIONS', title: '渠道监控：先测连通，再测能力',
    summary: '监控的目标是提前发现失效渠道，而不是制造请求。优先使用仅连通性模式，必要时才安排受控的真实探测。', reading: '6 分钟', updated: '2026-08-10', diagram: 'monitor', diagramTitle: '监控判定层级',
    content: String.raw`# 渠道监控：先测连通，再测能力

## 两种探测模式

**仅连通性** 只检查 DNS、TCP/TLS、HTTP 响应和耗时，不提交真实生成任务。它适合图片上游、付费模型和不希望产生费用的生产环境。

**能力探测** 会发送受控请求，验证鉴权、模型和响应格式，可能产生上游费用或消耗额度。启用前应限制频率、指定测试模型，并记录探测成本。

## 建议的监控字段

| 字段 | 看什么 |
| --- | --- |
| 成功率 | 最近窗口的可用程度 |
| P50/P95 延迟 | 普通请求和慢请求的差异 |
| 最近错误 | \`401/429/503/524\` 的分布 |
| 账号池 | 可调度、冷却、过期和禁用数量 |
| 最后探测 | 是否真的按计划运行 |

## 如何判断“渠道正常”

渠道状态正常只表示最近一次检查通过，不代表每个账号都有额度，也不代表所有模型都支持。对 \`gpt-image-02\` 这类媒体模型，要同时确认模型白名单、媒体能力和账号池；只看 URL 返回 \`200\` 不够。

## 降噪和告警

给同一错误设置冷却窗口，避免一个上游波动触发大量重复告警。把“无可用账号”“上游超时”“参数错误”分开统计：前两类需要运维动作，最后一类通常要改调用方。

## 无真实请求的验收清单

1. 检查渠道开关、Base URL 和平台类型。
2. 使用仅连通性模式跑一次探测。
3. 确认响应耗时、HTTP 状态和 TLS 均正常。
4. 在监控页面确认记录已写入。
5. 只有业务需要时，另行安排真实能力探测。`
  },
  {
    id: 'updates', group: '运维与监控', icon: 'refresh', eyebrow: 'SOURCE UPDATE', title: '左上角更新：官方同步与定制保护',
    summary: '更新按钮同步 Wei-Shaw/sub2api 的官方版本，同时保留支付宝、域名、购买链接、媒体上游等本地定制。', reading: '5 分钟', updated: '2026-08-10', diagram: 'update', diagramTitle: '一次更新的安全门',
    content: String.raw`# 左上角更新：官方同步与定制保护

## 更新做了什么

点击左上角版本入口后，系统读取官方 Git 标签，生成隔离候选工作树，将生产定制合并回候选版本，构建新镜像并做健康检查。只有全部通过才切换线上容器；失败会保留原镜像。

官方源是 \`Wei-Shaw/sub2api\`，\`EcoBIM-LStwin/SynthAPI\` 是同步备份，不是更新依据。版本号以官方 tag 为准，例如 \`v0.1.173\`。

## 为什么以前会失败

官方和本地同时编辑同一个文件时，普通 Git 合并会停在冲突状态。现在更新器通常在重叠块保留本地定制，官方没有重叠的新增和修复照常进入；认证页则做单独三方合并，在重叠块采用官方安全实现，同时保留非冲突的品牌定制。候选结果仍要经过定制守卫、镜像编译、版本输出和容器健康检查。

## 状态怎么看

| 状态 | 含义 | 该做什么 |
| --- | --- | --- |
| \`running\` | 正在抓取、合并、构建或健康检查 | 等待，不要连续点击 |
| \`succeeded\` | 新版本已切换 | 刷新页面并验证关键功能 |
| \`failed\` | 候选未通过某一道检查 | 看 phase/message，保留原版本 |
| \`rolled_back\` | 新容器不健康，已恢复旧镜像 | 先处理构建或运行时错误 |

## 点击后显示失败怎么办

先看失败阶段：\`fetching_official\` 是网络或 tag 问题；\`verifying_customizations\` 是定制保护缺失；\`building_image\` 是依赖或编译问题；\`health_check\` 是新容器启动/数据库迁移/配置问题。不要直接删除状态文件或手动改线上镜像。

## 开发流程约定

另一个开发流程完成后可以直接点击更新。它的已提交改动会作为生产快照参与合并；未提交改动也会在 \`snapshot\` 策略下先保存。建议开发完成后先跑测试、记录改动点，再更新并检查支付、域名、媒体和监控。

## 回滚原则

更新器会保留上一镜像和部署标签。只有确认新版本健康后才推进生产分支；如果备份仓库推送失败，线上版本仍可成功，但应尽快修复备份同步。`
  },
  {
    id: 'troubleshooting', group: '帮助支持', icon: 'questionCircle', eyebrow: 'TROUBLESHOOTING', title: '503、524 和请求断开怎么排查',
    summary: '先分清是“没有可用账号”还是“上游超时”，再决定是补账号、调整渠道，还是处理调用方超时。', reading: '8 分钟', updated: '2026-08-10', diagram: 'troubleshoot', diagramTitle: '错误定位路径',
    content: String.raw`# 503、524 和请求断开怎么排查

## 503：没有可调度上游

当日志出现 \`no available accounts\`，通常表示目标分组里没有可用账号。常见原因：账号过期、凭证失效、额度耗尽、并发达到上限、正在冷却，或渠道/模型没有绑定到该分组。渠道页面显示“正常”并不能排除账号池为空。

**排查顺序：** 确认请求模型 -> 查 Key 绑定分组 -> 查分组模型与渠道 -> 查账号状态/冷却 -> 看最近一次失败原因。修复后先发低成本请求，再观察监控成功率。

## 524：上游连接超时

\`524\` 常见于反向代理已经连到服务器，但上游在代理等待窗口内没有返回。图片、视频和长文本更容易触发。检查上游网络、DNS、TLS、渠道超时、Caddy 超时和客户端 read timeout；不要只把所有超时无限调大。

## 请求“断了”

流式请求断开可能来自客户端、Caddy、上游或网关进程。保留请求 ID并确认：是否使用 \`stream=True\`、代理是否缓存、是否有 idle timeout、容器是否重启。若每次都在固定秒数断开，优先查同值的代理/客户端超时。

## 服务器健康但 API 仍 503

健康检查只证明进程和数据库能工作，不证明某个模型有可用上游。把“站点健康”“渠道连通”“账号可调度”“模型能力”当成四个独立层级分别验证。

## 最小工单信息

请提供发生时间（含时区）、请求 ID、HTTP 状态码、模型、是否流式、用户/分组 ID（不要提供 Key）以及同一时间监控截图。完整 prompt、Cookie、Authorization 头和上游 token 不要发给任何人。

## 快速恢复动作

- 临时把分组切到另一条已验证渠道。
- 降低客户端并发，给 429/冷却留出时间。
- 对媒体任务使用异步轮询，不要让浏览器长连接等待。
- 修复账号或渠道后，再恢复原优先级。

若错误持续超过监控窗口，查看管理员“运维监控”中的上游错误分布和容器日志。`
  },
  {
    id: 'security', group: '帮助支持', icon: 'shield', eyebrow: 'SECURITY', title: '安全与隐私：把 Key 当密码管理',
    summary: '安全不是额外步骤，而是 API 网关的基本运行条件。下面是用户和管理员都应该执行的最低要求。', reading: '5 分钟', updated: '2026-08-10', diagram: 'security', diagramTitle: '最小权限边界',
    content: String.raw`# 安全与隐私：把 Key 当密码管理

## 用户侧

- 每个应用、环境使用独立 Key。
- 不把 Key 放在浏览器、移动端包、公共 CI 日志或前端源码中。
- 定期轮换，泄露后立即禁用旧 Key。
- 工单只提供脱敏后的请求 ID，不提供 Authorization 头。

## 管理员侧

- 生产域名启用 HTTPS，后台账号使用强密码和最小权限。
- 上游凭证只存服务端，日志默认脱敏。
- 支付回调、OAuth 回调和管理接口限制来源与权限。
- 更新前保留数据库和配置备份，更新后核对定制守卫。
- 监控探测默认使用仅连通性模式，避免无意消耗真实额度。

## 数据边界

请求可能经过网关、上游和日志系统。管理员应在隐私政策中说明保留时间、用途和删除方式；用户不要提交密码、身份证件、支付卡号或未授权的第三方数据。

## 发生泄露时

1. 立即禁用泄露的 Key 或账号。
2. 轮换上游凭证和管理密码。
3. 查询审计日志，确认影响时间和来源。
4. 检查是否有异常余额消耗或渠道变更。
5. 记录处置结果，并通知受影响人员。

安全问题应通过管理员配置的支持渠道报告，不要在公开 Issue 粘贴密钥或完整日志。`
  }
]

const route = useRoute()
const router = useRouter()
const searchQuery = ref('')
const mobileNavOpen = ref(false)
const isGuideHome = computed(() => !route.params.section)

type GuideScreenshotData = {
  src: string
  alt: string
  title: string
  caption: string
  markers: GuideScreenshotMarker[]
}

const screenshotsByPage: Partial<Record<string, GuideScreenshotData[]>> = {
  'quick-start': [
    {
      src: '/guide/screenshots/synthapi-login.png',
      alt: 'SynthAPI 登录页面真实截图，标出邮箱、密码和登录按钮',
      title: '登录页：按 1、2、3 完成登录',
      caption: '先输入已验证邮箱和密码，再提交登录。',
      markers: [
        { number: 1, x: 35, y: 50, label: '输入邮箱', description: '填写注册时验证过的邮箱地址。' },
        { number: 2, x: 67, y: 59, label: '输入密码', description: '确认大小写和密码管理器填充内容。' },
        { number: 3, x: 67, y: 67, label: '提交登录', description: '登录后再进入 API Keys 创建密钥。' }
      ]
    }
  ],
  'user-guide': [
    {
      src: '/guide/screenshots/synthapi-home.png',
      alt: 'SynthAPI 站点首页真实截图，标出开始按钮、文档和登录入口',
      title: '站点首页：三个常用入口',
      caption: '新用户从“立即开始”进入，已有账号可直接登录，手册入口始终位于顶部。',
      markers: [
        { number: 1, x: 16, y: 34, label: '立即开始', description: '进入注册或登录流程。' },
        { number: 2, x: 81, y: 7, label: '产品手册', description: '遇到配置问题时打开在线指南。' },
        { number: 3, x: 88, y: 7, label: '登录', description: '已有账号直接进入控制台。' }
      ]
    }
  ],
  updates: [
    {
      src: '/guide/screenshots/synthapi-guide-quick-start-before.png',
      alt: 'SynthAPI 在线产品手册真实截图，标出章节目录、正文和本页目录',
      title: '在线手册：从入口快速定位操作',
      caption: '左侧选章节，中间看操作步骤，右侧在当前页面内跳转。',
      markers: [
        { number: 1, x: 11, y: 30, label: '选择章节', description: '按业务主题进入对应说明。' },
        { number: 2, x: 46, y: 61, label: '阅读正文', description: '按标题顺序完成当前操作。' },
        { number: 3, x: 84, y: 59, label: '页内跳转', description: '长页面可直接定位小节。' }
      ]
    }
  ]
}

const moduleEntries = [
  { title: '快速开始', description: '注册、创建 Key、跑通第一条请求', icon: 'play' as const, tone: 'teal', to: '/guide/quick-start' },
  { title: '用户指南', description: '余额、模型、用量和媒体请求', icon: 'user' as const, tone: 'blue', to: '/guide/user-guide' },
  { title: '管理员手册', description: '账号、渠道、分组和计费配置', icon: 'server' as const, tone: 'amber', to: '/guide/admin-guide' },
  { title: 'API 参考', description: '兼容 OpenAI 的请求和错误码', icon: 'key' as const, tone: 'rose', to: '/guide/api-reference' },
  { title: '运维帮助', description: '监控、更新、503 与 524 排查', icon: 'chart' as const, tone: 'violet', to: '/guide/monitoring' }
]

const rolePaths = [
  { title: '普通用户', description: '我需要创建 Key、调用模型并核对费用。', icon: 'user' as const, steps: [
    { label: '跑通第一条请求', to: '/guide/quick-start' }, { label: '管理余额和用量', to: '/guide/user-guide' }, { label: '看懂计费记录', to: '/guide/billing' }
  ] },
  { title: '管理员', description: '我需要配置上游、分组、监控和更新。', icon: 'server' as const, steps: [
    { label: '配置账号与渠道', to: '/guide/admin-guide' }, { label: '设置渠道监控', to: '/guide/monitoring' }, { label: '执行官方更新', to: '/guide/updates' }
  ] },
  { title: '开发者 / 运维', description: '我需要接入接口并快速定位失败原因。', icon: 'terminal' as const, steps: [
    { label: '阅读 API 参考', to: '/guide/api-reference' }, { label: '理解核心对象', to: '/guide/concepts' }, { label: '排查 503 / 524', to: '/guide/troubleshooting' }
  ] }
]

const readingRoute = [
  { number: '01', for: '第一次调用', title: '跑通第一条请求', description: '确认账号、Key、分组和渠道完整可用。', to: '/guide/quick-start' },
  { number: '02', for: '开始管理', title: '搞懂 4 个核心对象', description: '分清用户、分组、渠道和上游账号的职责。', to: '/guide/concepts' },
  { number: '03', for: '出现异常', title: '排查 503 / 524', description: '按状态码和日志顺序缩小故障范围。', to: '/guide/troubleshooting' }
]

const currentPage = computed(() => {
  const requested = String(route.params.section || 'quick-start')
  return pages.find((page) => page.id === requested) || pages[0]
})

const currentScreenshots = computed(() => screenshotsByPage[currentPage.value.id] || [])
const landingSearchResults = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return []
  return pages.filter((page) => `${page.title} ${page.summary} ${page.content}`.toLowerCase().includes(query)).slice(0, 6)
})

const groups = computed(() => {
  const result: Array<{ label: string; items: GuidePage[] }> = []
  for (const page of pages) {
    const group = result.find((item) => item.label === page.group)
    if (group) group.items.push(page)
    else result.push({ label: page.group, items: [page] })
  }
  return result
})

const filteredGroups = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return groups.value
  return groups.value.map((group) => ({
    ...group,
    items: group.items.filter((page) => `${page.title} ${page.summary} ${page.content}`.toLowerCase().includes(query))
  })).filter((group) => group.items.length > 0)
})

const previousPage = computed(() => pages[pages.findIndex((page) => page.id === currentPage.value.id) - 1])
const nextPage = computed(() => pages[pages.findIndex((page) => page.id === currentPage.value.id) + 1])

const toc = computed(() => {
  const headings = [...currentPage.value.content.matchAll(/^##\s+(.+)$/gm)]
  return headings.map((match, index) => ({ title: match[1].trim(), id: `guide-section-${index + 1}` }))
})

const renderedContent = computed(() => {
  const markdown = currentPage.value.content.replace(/\\`/g, '`')
  const parsed = marked.parse(markdown, { breaks: true }) as string
  let headingIndex = 0
  const withAnchors = parsed.replace(/<h2>([\s\S]*?)<\/h2>/g, (_match, title) => {
    headingIndex += 1
    return `<h2 id="guide-section-${headingIndex}">${title}</h2>`
  })
  return DOMPurify.sanitize(withAnchors, { ADD_ATTR: ['target', 'rel'] })
})

function selectPage(id: string) {
  mobileNavOpen.value = false
  searchQuery.value = ''
  if (String(route.params.section || '') !== id) router.push(`/guide/${id}`)
}

watch(() => route.params.section, () => window.scrollTo({ top: 0, behavior: 'smooth' }))
</script>

<style scoped>
.guide-shell { --cyan: #19c6e8; --blue: #468cff; --violet: #875cf5; --ink: #061129; --sidebar-width: clamp(260px, 20.3125vw, 416px); min-height: 100vh; font-family: Inter, "Microsoft YaHei", Arial, sans-serif; letter-spacing: 0; }
.guide-shell * { box-sizing: border-box; }
.guide-frame { display: flex; min-height: 100vh; }
.guide-mark { display: inline-flex; width: 44px; height: 44px; flex: 0 0 44px; align-items: center; justify-content: center; border: 1px solid rgba(49, 217, 255, .6); border-radius: 9px; color: white; background: linear-gradient(145deg, #14cbe9, #0874dc); box-shadow: 0 0 26px rgba(23, 194, 239, .55); }
.guide-icon-button { display: inline-flex; width: 38px; height: 38px; align-items: center; justify-content: center; border: 1px solid transparent; border-radius: 7px; }
.guide-overlay { position: fixed; inset: 0; z-index: 79; background: rgba(0, 8, 24, .68); backdrop-filter: blur(3px); }
.guide-sidebar { display: flex; width: var(--sidebar-width); flex: 0 0 var(--sidebar-width); flex-direction: column; color: #9cb0d5; background: radial-gradient(circle at 5% 2%, rgba(0, 189, 255, .18), transparent 22%), linear-gradient(145deg, #061a34 0%, #020d20 48%, #06162d 100%); border-right: 1px solid rgba(86, 139, 210, .25); }
.guide-sidebar-brand { display: flex; align-items: center; gap: 17px; height: 132px; padding: 0 38px; }
.guide-sidebar-brand > * { transform: translateY(18px); }
.guide-sidebar-brand .guide-mark { width: 64px; height: 64px; flex-basis: 64px; border-radius: 14px; }
.guide-sidebar-brand > span:last-child, .guide-brand-link > span:last-child, .guide-home-wordmark > span:last-child { display: flex; flex-direction: column; }
.guide-sidebar-brand b, .guide-brand-link b, .guide-home-wordmark b { color: white; font-size: 22px; font-style: normal; font-weight: 780; line-height: 1.05; }
.guide-sidebar-brand em, .guide-brand-link em, .guide-home-wordmark em { margin-top: 6px; color: #8da0c4; font-size: 13px; font-style: normal; line-height: 1; }
.guide-sidebar-brand b { font-size: 30px; }
.guide-sidebar-brand em { font-size: 16px; }
.guide-sidebar-mobile-head { display: none; }
.guide-search { display: flex; height: 52px; margin: 30px 36px 30px; align-items: center; gap: 12px; border: 1px solid rgba(91, 143, 207, .38); border-radius: 9px; background: rgba(18, 40, 73, .68); padding: 0 16px; color: #9cb0d5; box-shadow: inset 0 0 24px rgba(15, 51, 93, .45); }
.guide-shell-home .guide-search { height: 76px; margin-top: 31px; margin-bottom: 38px; border-radius: 13px; padding: 0 24px; }
.guide-search input { min-width: 0; flex: 1; border: 0; background: transparent; color: #e4eeff; font-size: 14px; outline: none; }
.guide-search input::placeholder { color: #8095ba; }
.guide-search kbd, .guide-home-search kbd { flex: 0 0 auto; color: #7f91b1; font-size: 12px; }
.guide-home-sidebar-actions { display: grid; gap: 18px; padding: 0 37px; }
.home-sidebar-action { display: flex; min-height: 105px; align-items: center; gap: 22px; border: 1px solid rgba(255, 255, 255, .35); border-radius: 13px; padding: 20px 25px; color: white; box-shadow: 0 12px 28px rgba(0, 0, 0, .24); transition: transform .2s, box-shadow .2s; }
.home-sidebar-action:hover { transform: translateY(-2px); box-shadow: 0 16px 34px rgba(0, 0, 0, .34); }
.home-sidebar-action-cyan { background: linear-gradient(145deg, #08bbdd, #078fdf); }
.home-sidebar-action-violet { background: linear-gradient(145deg, #7352ed, #3d31c9); }
.home-sidebar-action > svg { flex: 0 0 auto; opacity: .85; }
.home-sidebar-action span { min-width: 0; }
.home-sidebar-action b, .home-sidebar-action small { display: block; }
.home-sidebar-action b { font-size: 19px; font-weight: 750; }
.home-sidebar-action small { margin-top: 7px; color: rgba(236, 244, 255, .72); font-size: 14px; line-height: 1.35; }
.guide-home-sidebar-nav { display: grid; gap: 3px; margin-top: 34px; padding: 0 48px; }
.guide-home-sidebar-nav a { display: flex; height: 56px; align-items: center; gap: 16px; color: #8499bd; font-size: 16px; }
.guide-home-sidebar-nav a:hover { color: #32d4ee; }
.guide-home-sidebar-nav a span { margin-left: auto; border: 1px solid #233d62; border-radius: 7px; background: #112847; padding: 4px 7px; font-size: 10px; }
.guide-home-sidebar-nav a i { width: 8px; height: 8px; margin-left: auto; border-radius: 50%; background: #20d9dd; box-shadow: 0 0 10px #20d9dd; }
.guide-home-sidebar-nav a b { color: #20d9dd; font-size: 11px; font-weight: 650; }
.guide-help-card { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; margin: auto 37px 36px; border: 1px solid rgba(72, 125, 190, .33); border-radius: 13px; background: rgba(19, 43, 78, .62); padding: 20px 18px; color: #37d5ef; }
.guide-help-card b, .guide-help-card span { display: block; }
.guide-help-card b { color: #f2f7ff; font-size: 15px; }
.guide-help-card span { margin-top: 5px; color: #8197bb; font-size: 13px; line-height: 1.45; }
.guide-topbar { position: sticky; top: 0; z-index: 60; display: flex; height: 78px; align-items: center; justify-content: space-between; border-bottom: 1px solid #152743; background: rgba(3, 14, 34, .97); padding: 0 37px; color: #9eb1d5; backdrop-filter: blur(12px); }
.guide-topbar-brand { display: flex; align-items: center; gap: 10px; }
.guide-brand-link { display: flex; align-items: center; gap: 11px; }
.guide-brand-link .guide-mark { width: 50px; height: 50px; flex-basis: 50px; border-radius: 11px; }
.guide-brand-link b { font-size: 24px; }
.guide-brand-link em { margin-top: 2px; font-size: 15px; }
.guide-topbar-actions { display: flex; height: 100%; align-items: center; }
.guide-topbar-actions > span, .guide-topbar-actions > a { display: inline-flex; min-height: 28px; align-items: center; gap: 8px; border-left: 1px solid #1b2b47; padding: 0 29px; color: #a5b5d5; font-size: 15px; }
.guide-topbar-actions > span { border-left: 0; }
.guide-topbar-actions a:hover { color: #35d8f2; }
.guide-mobile-menu, .guide-home-menu { display: none; }
.guide-nav { padding: 4px 25px 28px; }
.guide-nav-group { margin-bottom: 17px; }
.guide-nav-label { margin-bottom: 8px; padding: 0 14px; color: #7288ad; font-size: 12px; font-weight: 800; letter-spacing: .12em; }
.guide-nav-item { display: flex; width: 100%; min-height: 46px; align-items: center; gap: 13px; border: 1px solid transparent; border-radius: 7px; padding: 10px 14px; color: #91a5ca; font-size: 15px; line-height: 1.35; text-align: left; }
.guide-nav-item:hover { color: #40d7ef; background: rgba(24, 65, 110, .35); }
.guide-nav-item-active { border-color: #1662a7; color: #3edaf2; background: linear-gradient(90deg, rgba(15, 94, 156, .42), rgba(42, 71, 128, .3)); }
.guide-nav-item span { min-width: 0; }
.guide-nav-current { margin-left: auto; flex: 0 0 auto; }
.guide-nav-empty { padding: 18px; color: #7186aa; font-size: 12px; }

.guide-home-main { position: relative; min-width: 0; flex: 1; overflow: hidden; border-radius: 30px 0 0 30px; color: #061129; background: #f8fbff; }
.guide-home-toprow { display: grid; grid-template-columns: minmax(480px, 808px) 1fr auto; align-items: center; gap: 32px; height: 128px; padding: 0 74px; }
.guide-home-search { position: relative; display: flex; height: 58px; align-items: center; gap: 14px; border: 1px solid #edf1f7; border-radius: 11px; background: rgba(255, 255, 255, .95); padding: 0 17px; color: #74849e; box-shadow: 0 12px 30px rgba(41, 79, 129, .12); }
.guide-home-search::before { content: ''; position: absolute; inset: -9px; z-index: -1; border-radius: 16px; background: rgba(255, 255, 255, .72); }
.guide-home-search input { min-width: 0; flex: 1; border: 0; background: transparent; color: #101d35; font-size: 14px; outline: none; }
.guide-home-wordmark { display: flex; grid-column: 3; align-items: center; gap: 13px; }
.guide-home-wordmark b { color: #08142c; font-size: 22px; }
.guide-home-wordmark em { color: #6f7e98; font-size: 13px; }
.guide-cube-mark { display: inline-flex; width: 40px; height: 40px; align-items: center; justify-content: center; color: white; font-size: 22px; background: linear-gradient(145deg, #13d2ee, #4c58ec); clip-path: polygon(50% 0, 96% 25%, 96% 75%, 50% 100%, 4% 75%, 4% 25%); }
.guide-home-hero { position: relative; display: grid; min-height: 295px; grid-template-columns: minmax(0, 1.15fr) minmax(330px, .85fr); align-items: center; gap: 20px; padding: 25px 100px 34px; background: radial-gradient(circle at 85% 15%, rgba(107, 163, 255, .12), transparent 31%), linear-gradient(135deg, #fbfdff, #f5f9ff); }
.guide-home-hero::before { content: ''; position: absolute; inset: 0; opacity: .27; background-image: linear-gradient(rgba(74, 136, 221, .12) 1px, transparent 1px), linear-gradient(90deg, rgba(74, 136, 221, .12) 1px, transparent 1px); background-size: 65px 65px; mask-image: linear-gradient(90deg, transparent 42%, black); }
.guide-home-copy { position: relative; z-index: 2; }
.guide-eyebrow { color: #139dd8; font-size: 11px; font-weight: 800; letter-spacing: .14em; }
.guide-home-copy .guide-eyebrow { visibility: hidden; }
.guide-home-copy h1 { margin-top: 12px; color: #071228; font-size: clamp(42px, 4vw, 67px); font-weight: 850; line-height: 1.08; }
.guide-title-underline { display: block; width: 255px; height: 7px; margin-top: 15px; border-radius: 99px; background: linear-gradient(90deg, #16c9e6, #2e7ff3, #8e51eb); }
.guide-home-copy > p:not(.guide-eyebrow) { margin-top: 24px; color: #6a7b97; font-size: 15px; line-height: 1.8; }
.guide-home-actions { display: none; gap: 12px; margin-top: 24px; }
.guide-primary-action, .guide-secondary-action { display: inline-flex; min-height: 45px; align-items: center; justify-content: center; gap: 9px; border: 1px solid transparent; border-radius: 7px; padding: 0 18px; font-size: 13px; font-weight: 750; }
.guide-primary-action { color: white; background: linear-gradient(100deg, #12bad9, #157ee7); box-shadow: 0 10px 23px rgba(10, 154, 220, .25); }
.guide-secondary-action { border-color: #d6e0f2; color: #3b43a6; background: white; }
.guide-home-hero-visual { position: relative; z-index: 1; width: 100%; height: 235px; perspective: 800px; }
.visual-grid { position: absolute; inset: 15px -20px -10px 15px; transform: rotateX(62deg) rotateZ(-30deg); opacity: .3; background-image: linear-gradient(#71bff2 1px, transparent 1px), linear-gradient(90deg, #71bff2 1px, transparent 1px); background-size: 32px 32px; mask-image: radial-gradient(ellipse, black, transparent 70%); }
.visual-stack { position: absolute; left: 50%; top: 50%; width: 280px; height: 150px; border: 1px solid rgba(159, 191, 237, .75); border-radius: 18px; transform: translate(-50%, -50%) rotateX(62deg) rotateZ(-29deg); background: linear-gradient(135deg, rgba(255,255,255,.9), rgba(219,233,255,.72)); box-shadow: 28px 38px 55px rgba(46, 90, 164, .14); }
.visual-stack-back { margin-top: -33px; margin-left: 44px; opacity: .45; }
.visual-stack-middle { margin-top: -8px; margin-left: 18px; opacity: .7; }
.visual-stack-front { display: flex; align-items: center; justify-content: center; gap: 15px; }
.visual-stack-front i { width: 48px; height: 48px; border: 1px solid rgba(90, 165, 255, .6); border-radius: 9px; background: linear-gradient(145deg, rgba(255,255,255,.9), rgba(75,152,255,.7)); box-shadow: 0 13px 20px rgba(40, 102, 211, .24); }
.visual-stack-front i:nth-child(2) { background: linear-gradient(145deg, #1ce7ee, #4279f4); transform: translateY(18px); }
.visual-stack-front i:nth-child(3) { background: linear-gradient(145deg, #c4d8ff, #ffffff); }
.visual-spark { position: absolute; width: 7px; height: 7px; border-radius: 50%; background: #28d2e8; box-shadow: 0 0 15px #28d2e8; }
.visual-spark-one { left: 15%; bottom: 22%; }.visual-spark-two { right: 11%; top: 19%; background: #7a6df3; box-shadow: 0 0 15px #7a6df3; }
.guide-home-search-band { position: absolute; left: 0; right: 0; top: 99px; z-index: 30; height: 0; }
.guide-search-results { position: absolute; left: 74px; top: 0; width: min(808px, calc(100vw - var(--sidebar-width) - 148px)); border: 1px solid #d9e4f5; border-radius: 8px; background: white; padding: 7px; box-shadow: 0 17px 40px rgba(20, 48, 88, .2); }
.guide-search-results a { display: flex; align-items: center; gap: 10px; border-radius: 6px; padding: 9px 11px; color: #445875; }
.guide-search-results a:hover { color: #0c8dd3; background: #f2f8ff; }
.guide-search-results a span { min-width: 0; flex: 1; }
.guide-search-results strong, .guide-search-results small { display: block; }
.guide-search-results strong { font-size: 12px; }.guide-search-results small { margin-top: 2px; color: #8798b3; font-size: 10px; }
.guide-search-results > p { padding: 12px; color: #7486a3; font-size: 12px; text-align: center; }
.guide-home-section, .guide-role-band, .guide-reading-route { padding: 25px 74px 30px; }
.guide-home-heading { display: flex; align-items: end; justify-content: space-between; gap: 28px; margin-bottom: 28px; }
.guide-home-heading > div > p, .guide-download-band > div > p { display: none; }
.guide-home-heading h2, .guide-download-band h2 { color: #0b1730; font-size: 18px; font-weight: 780; }
.guide-home-heading > span { display: inline-flex; align-items: center; gap: 7px; color: #7586a2; font-size: 12px; }
.guide-module-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; }
.guide-module-entry { display: grid; min-width: 0; min-height: 210px; grid-template-columns: auto 1fr; grid-template-rows: 1fr auto; gap: 0 16px; border: 1px solid #e3e9f2; border-radius: 8px; background: rgba(255, 255, 255, .88); padding: 24px 22px 18px; box-shadow: 0 9px 24px rgba(32, 65, 111, .08); }
.guide-module-entry:hover { border-color: #9bdcf2; transform: translateY(-2px); }
.guide-module-icon { display: inline-flex; width: 55px; height: 55px; align-items: center; justify-content: center; border-radius: 10px; }
.guide-module-icon-teal { color: #0daacc; background: #e1f8fc; }.guide-module-icon-blue { color: #5746d9; background: #efedff; }.guide-module-icon-amber { color: #df8705; background: #fff5e3; }.guide-module-icon-rose { color: #c8379b; background: #ffecf8; }
.guide-module-entry h3 { color: #0b1730; font-size: 16px; font-weight: 780; }.guide-module-entry p { margin-top: 8px; color: #697a96; font-size: 12px; line-height: 1.55; }
.guide-module-arrow { display: inline-flex; width: 33px; height: 33px; align-items: center; justify-content: center; border-radius: 50%; color: #328adf; background: #f3f8ff; }
.guide-role-band { padding-top: 5px; }
.guide-role-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 26px; }
.guide-role-path { display: grid; min-width: 0; min-height: 305px; grid-template-columns: auto 1fr; gap: 12px 15px; border: 1px solid #cfe1f7; border-radius: 8px; background: rgba(255,255,255,.72); padding: 17px 20px 13px; }
.guide-role-path:nth-child(2) { border-color: #ded4f4; }.guide-role-path:nth-child(3) { border-color: #c5ebed; }
.guide-role-avatar { position: relative; display: inline-flex; width: 58px; height: 58px; align-items: center; justify-content: center; overflow: hidden; border: 2px solid #b6d9f5; border-radius: 50%; background: #d8f0ff; }
.guide-role-avatar::before { content: ''; position: absolute; top: 11px; width: 23px; height: 24px; border-radius: 50% 50% 45% 45%; background: #f6bf90; box-shadow: inset 0 10px 0 #172c51; }
.guide-role-avatar i { position: absolute; bottom: -5px; width: 39px; height: 27px; border-radius: 50% 50% 0 0; background: #59b9ea; }
.guide-role-avatar-1 { border-color: #d6c8fb; background: #eee7ff; }.guide-role-avatar-1::before { box-shadow: inset 0 10px 0 #513824; }.guide-role-avatar-1 i { background: #6f3ed0; }
.guide-role-avatar-2 { border-color: #bce9ef; background: #ddfaff; }.guide-role-avatar-2::before { box-shadow: inset 0 10px 0 #092e4b; }.guide-role-avatar-2 i { background: #0a6174; }
.guide-role-path h3 { color: #0c1831; font-size: 15px; font-weight: 780; }.guide-role-path > div > p { margin-top: 7px; color: #70809b; font-size: 11px; line-height: 1.5; }
.guide-role-path ol { grid-column: 1 / -1; border-radius: 8px; background: rgba(255,255,255,.86); padding: 6px 12px; }
.guide-role-path li { display: grid; grid-template-columns: 35px 1fr; align-items: center; border-bottom: 1px solid #edf1f6; padding: 8px 0; }.guide-role-path li:last-child { border-bottom: 0; }
.guide-role-path li > b { display: inline-flex; width: 26px; height: 26px; align-items: center; justify-content: center; border-radius: 7px; color: #318bdc; background: #eff7ff; font-size: 10px; }.guide-role-path:nth-child(2) li > b { color: #7646df; background: #f3eeff; }.guide-role-path:nth-child(3) li > b { color: #12a5b1; background: #eafafa; }
.guide-role-path li a { display: flex; align-items: center; justify-content: space-between; color: #5d6f8d; font-size: 11px; }.guide-role-path li a:hover { color: #168fcf; }
.guide-reading-route { max-width: 1200px; margin: 0 auto; padding-top: 40px; padding-bottom: 60px; }
.guide-reading-list { border-top: 1px solid #d9e3f1; }.guide-reading-list > a { display: grid; grid-template-columns: 75px 1fr auto; align-items: center; gap: 18px; border-bottom: 1px solid #dfe7f2; padding: 18px 8px; color: #14213b; }.guide-reading-list > a > strong { color: #397edb; font-size: 25px; }.guide-reading-list small { color: #1199c5; font-size: 10px; font-weight: 700; }.guide-reading-list h3 { margin-top: 3px; font-size: 14px; font-weight: 750; }.guide-reading-list p { margin-top: 4px; color: #70819b; font-size: 11px; }
.guide-download-band { display: flex; align-items: center; justify-content: space-between; gap: 30px; background: #07152e; padding: 42px 65px; color: white; }.guide-download-band h2 { color: white; }.guide-download-band > div > span { display: block; margin-top: 9px; color: #93a8ca; font-size: 12px; }.guide-download-actions { display: flex; gap: 10px; }.guide-download-actions a { display: inline-flex; min-height: 42px; align-items: center; gap: 8px; border: 1px solid #315079; border-radius: 7px; padding: 0 15px; color: white; font-size: 12px; }.guide-download-actions a:first-child { border-color: #21bfdc; background: #0c87af; }

.guide-shell-article { color: #b3c2df; background: #020c1f; }
.guide-shell-article .guide-frame { min-height: calc(100vh - 78px); }
.guide-shell-article .guide-sidebar { position: sticky; top: 78px; height: calc(100vh - 78px); overflow-y: auto; }
.guide-shell-article .guide-sidebar-brand { display: none; }
.guide-article-main { min-width: 0; flex: 1; background-color: #020c1f; background-image: radial-gradient(circle at 63% 3%, rgba(26, 77, 150, .18), transparent 34%), linear-gradient(rgba(33, 74, 127, .085) 1px, transparent 1px), linear-gradient(90deg, rgba(33, 74, 127, .085) 1px, transparent 1px); background-size: auto, 32px 32px, 32px 32px; }
.guide-article-container { width: 100%; padding: 32px 58px 70px; }
.guide-breadcrumb { display: flex; align-items: center; gap: 10px; color: #8295b8; font-size: 15px; }.guide-breadcrumb strong { color: #d8e2f4; font-weight: 600; }
.guide-intro { display: grid; grid-template-columns: minmax(0, .76fr) minmax(520px, 1fr); align-items: start; gap: 62px; border-bottom: 1px solid #172a49; padding: 18px 0 38px; }
.guide-intro-copy { padding-top: 60px; }
.guide-intro :deep(.diagram-frame) { min-height: 320px; }
.guide-intro h1 { margin-top: 15px; color: white; font-size: clamp(36px, 3.7vw, 56px); font-weight: 850; line-height: 1.08; }.guide-intro .guide-title-underline { width: min(100%, 455px); height: 6px; margin-top: 18px; }
.guide-summary { margin-top: 22px; color: #9aaed0; font-size: 18px; line-height: 1.75; }.guide-meta { display: flex; gap: 22px; margin-top: 23px; color: #8094b9; font-size: 15px; }.guide-meta span { display: inline-flex; align-items: center; gap: 7px; }
.guide-workspace { display: grid; grid-template-columns: minmax(0, 1fr) 415px; gap: 52px; padding: 40px 0 50px; }
.guide-article { min-width: 0; color: #a9bad8; font-size: 18px; line-height: 1.85; }
.guide-article :deep(h1) { display: none; }
.guide-article :deep(h2) { scroll-margin-top: 88px; margin: 42px 0 14px; border: 0; padding: 0; color: #f7f9ff; font-size: 24px; font-weight: 780; line-height: 1.35; }.guide-article :deep(h2:first-of-type) { margin-top: 0; }.guide-article :deep(h2:nth-of-type(3n+1)) { color: #38d7ed; }.guide-article :deep(h2:nth-of-type(3n+2)) { color: #a27af8; }.guide-article :deep(h2:nth-of-type(3n)) { color: #4b9cff; }
.guide-article :deep(p) { margin: 11px 0; }.guide-article :deep(ul), .guide-article :deep(ol) { margin: 12px 0 18px 24px; padding-left: 16px; }.guide-article :deep(li) { margin: 6px 0; }.guide-article :deep(li::marker) { color: #27cbe6; }.guide-article :deep(strong) { color: #f7f9ff; font-weight: 700; }
.guide-article :deep(code) { border: 1px solid #244369; border-radius: 5px; background: #0b1c37; padding: 2px 6px; color: #78e8f4; font-size: .86em; }.guide-article :deep(pre) { overflow-x: auto; margin: 20px 0; border: 1px solid #1f3a62; border-radius: 8px; background: #06142b; padding: 18px; color: #b8f7ee; font-size: 12px; line-height: 1.75; }.guide-article :deep(pre code) { border: 0; background: transparent; padding: 0; color: inherit; }.guide-article :deep(blockquote) { margin: 18px 0; border-left: 3px solid #28cbe6; background: rgba(25, 84, 128, .24); padding: 12px 17px; color: #8fe8ef; }.guide-article :deep(table) { display: block; width: 100%; overflow-x: auto; margin: 20px 0; border-collapse: collapse; font-size: 12px; }.guide-article :deep(th), .guide-article :deep(td) { min-width: 112px; border: 1px solid #213c61; padding: 9px 11px; text-align: left; vertical-align: top; }.guide-article :deep(th) { background: #0d1e39; color: #f1f6ff; }.guide-article :deep(a) { color: #39d8ed; text-decoration: underline; text-underline-offset: 3px; }
.guide-toc { position: sticky; top: 112px; align-self: start; border-left: 1px solid #183051; padding-left: 44px; }.guide-toc > p { margin-bottom: 18px; color: #8296ba; font-size: 13px; font-weight: 800; letter-spacing: .12em; }.guide-toc > a { display: block; margin: 0; border-left: 2px solid transparent; padding: 9px 0 9px 22px; color: #7f93b7; font-size: 16px; line-height: 1.45; }.guide-toc > a:first-of-type { border-left-color: #28cee6; color: #36d8e9; }.guide-toc > a:hover { color: #45d9ee; }.guide-toc-help { display: flex; align-items: center; gap: 10px; margin-top: 25px; border-top: 1px solid #172a49; padding-top: 20px; color: #7488ac; font-size: 13px; }.guide-toc-help span { margin-right: auto; }.guide-toc-help button { color: #7e93b7; }
.guide-pager { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; border-top: 1px solid #172a49; padding: 22px 0 0; }.guide-pager-button { display: flex; min-width: 0; align-items: center; gap: 12px; border: 1px solid #1c385d; border-radius: 8px; padding: 12px 15px; color: #c0cde3; text-align: left; }.guide-pager-button:hover { border-color: #2599c5; background: rgba(16, 75, 113, .2); }.guide-pager-next { justify-content: flex-end; text-align: right; }.guide-pager-button span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 700; }.guide-pager-button small { display: block; margin-bottom: 2px; color: #7285a7; font-size: 10px; font-weight: 500; }

@media (max-width: 1180px) {
  .guide-sidebar { width: 260px; flex-basis: 260px; }
  .guide-home-toprow { padding: 0 35px; }.guide-home-hero { padding-right: 45px; padding-left: 45px; }.guide-home-section, .guide-role-band { padding-right: 35px; padding-left: 35px; }
  .guide-module-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.guide-role-grid { grid-template-columns: 1fr; }
  .guide-intro { grid-template-columns: 1fr; gap: 30px; }.guide-intro-copy { padding-top: 0; }.guide-workspace { grid-template-columns: 1fr; }.guide-toc { display: none; }
}
@media (max-width: 900px) {
  .guide-sidebar { position: fixed !important; left: 0; top: 0 !important; z-index: 80; height: 100vh !important; width: min(318px, 88vw); transform: translateX(-102%); transition: transform .25s ease; box-shadow: 18px 0 45px rgba(0,0,0,.45); }.guide-sidebar-open { transform: translateX(0); }
  .guide-sidebar-brand { display: flex !important; }.guide-sidebar-mobile-head { display: flex; align-items: center; justify-content: space-between; padding: 0 28px 6px; color: #dbe8fb; font-size: 13px; }
  .guide-mobile-menu, .guide-home-menu { display: inline-flex; }.guide-topbar { height: 64px; padding: 0 16px; }.guide-topbar-actions > span { display: none; }.guide-topbar-actions > a { padding: 0 11px; }.guide-topbar-actions > a span { display: none; }
  .guide-home-toprow { grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; height: 82px; padding: 0 18px; }.guide-home-wordmark em { display: none; }.guide-home-wordmark b { font-size: 16px; }.guide-cube-mark { width: 32px; height: 32px; }
  .guide-home-hero { grid-template-columns: 1fr; padding: 42px 28px; }.guide-home-hero-visual { display: none; }.guide-home-search-band { top: 74px; }.guide-search-results { left: 68px; width: calc(100% - 86px); }
  .guide-article-container { padding-right: 25px; padding-left: 25px; }
}
@media (max-width: 640px) {
  .guide-topbar-actions > a { font-size: 0; }.guide-topbar-actions > a svg { width: 18px; height: 18px; }.guide-brand-link em { display: none; }
  .guide-home-toprow { grid-template-columns: auto 1fr; }.guide-home-wordmark { display: none; }.guide-home-search { height: 48px; }.guide-home-search kbd { display: none; }
  .guide-home-copy h1 { max-width: 100%; overflow-wrap: anywhere; font-size: 34px; line-height: 1.16; }.guide-home-copy > p:not(.guide-eyebrow) br { display: none; }.guide-title-underline { width: 190px; height: 5px; }.guide-home-actions { align-items: stretch; flex-direction: column; }
  .guide-home-section, .guide-role-band, .guide-reading-route { padding-right: 18px; padding-left: 18px; }.guide-home-heading { align-items: start; flex-direction: column; gap: 8px; margin-bottom: 17px; }.guide-module-grid { grid-template-columns: 1fr; }.guide-module-entry { min-height: 135px; }.guide-role-path { min-height: 0; padding: 15px; }
  .guide-reading-list > a { grid-template-columns: 45px 1fr; gap: 10px; }.guide-reading-list > a > svg { display: none; }.guide-download-band { align-items: stretch; flex-direction: column; padding: 36px 20px; }.guide-download-actions { flex-direction: column; }
  .guide-article-container { padding: 22px 18px 50px; }.guide-intro { padding: 34px 0 28px; }.guide-intro :deep(.diagram-frame) { min-height: 0; }.guide-intro h1 { font-size: 34px; }.guide-summary, .guide-article { font-size: 14px; }.guide-meta { gap: 12px; }.guide-workspace { padding-top: 22px; }.guide-pager-button { padding: 10px; }.guide-pager-button span { font-size: 10px; }
}
</style>
