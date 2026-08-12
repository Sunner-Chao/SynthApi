<template>
  <div class="about-page">
    <header class="about-header">
      <RouterLink to="/home" class="brand-link" aria-label="返回 SynthAPI 首页">
        <img src="/logo.svg" alt="SynthAPI" />
        <span>SynthAPI</span>
      </RouterLink>
      <nav aria-label="主要导航">
        <RouterLink to="/guide">产品手册</RouterLink>
        <RouterLink to="/guide/api-reference">API 接入</RouterLink>
        <RouterLink to="/guide/security">安全与隐私</RouterLink>
      </nav>
    </header>

    <main>
      <section class="intro">
        <p class="eyebrow">PRODUCT FACTS</p>
        <h1>SynthAPI 是什么</h1>
        <p class="lead">
          SynthAPI 是面向开发者与团队的多模型 AI API 网关，通过统一 API Key 和兼容 OpenAI 的接口，
          提供模型接入、渠道路由、用量计费、运行监控和故障诊断。
        </p>
      </section>

      <section aria-labelledby="relationship-title">
        <h2 id="relationship-title">与 Sub2API 的关系</h2>
        <p>
          SynthAPI 是基于 Sub2API 开源项目构建并持续维护的独立服务品牌。上游开源代码、历史贡献和
          第三方组件的权利仍归原权利人所有，并继续适用各自许可证。SynthAPI 的部署、文档与定制能力
          不改变上游项目的权属。
        </p>
        <p>
          SynthAPI 不隶属于 OpenAI、Anthropic、Google 或其他模型提供商，也不应被描述为这些公司的
          官方服务、官方 API 或合作产品。
        </p>
      </section>

      <section aria-labelledby="scope-title">
        <h2 id="scope-title">能力与边界</h2>
        <div class="fact-grid">
          <article>
            <h3>统一接入</h3>
            <p>客户端使用站点 API Key，通过兼容接口访问当前已启用的模型与渠道。</p>
          </article>
          <article>
            <h3>路由与计量</h3>
            <p>网关负责权限、分组、渠道选择、流式转发、用量记录和运营计费。</p>
          </article>
          <article>
            <h3>运行诊断</h3>
            <p>渠道监控和错误记录用于区分账号不可用、上游超时、参数错误与客户端断开。</p>
          </article>
          <article>
            <h3>第三方依赖</h3>
            <p>模型可用性取决于账号权限、额度、并发、渠道健康和上游服务状态。</p>
          </article>
        </div>
      </section>

      <section aria-labelledby="claims-title">
        <h2 id="claims-title">不作出的承诺</h2>
        <ul>
          <li>不承诺任何第三方模型永久可用、零故障、零封号或固定服务水平。</li>
          <li>不把站点健康检查等同于每个模型和渠道均可用。</li>
          <li>不公开或要求用户提供 API Key、Authorization 头、Cookie、上游 token 或完整敏感请求。</li>
          <li>价格、试用额度、支付方式和支持范围以站点当时的可见规则为准。</li>
        </ul>
      </section>

      <section class="next-steps" aria-labelledby="next-title">
        <h2 id="next-title">继续了解</h2>
        <RouterLink to="/guide/quick-start">五分钟快速开始</RouterLink>
        <RouterLink to="/guide/api-reference">API 接入指南</RouterLink>
        <RouterLink to="/guide/troubleshooting">503 与 524 排查</RouterLink>
      </section>
    </main>
  </div>
</template>

<style scoped>
.about-page { min-height: 100vh; background: #f7fafc; color: #172033; }
.about-header { display: flex; min-height: 64px; align-items: center; justify-content: space-between; border-bottom: 1px solid #dce5ec; background: #fff; padding: 0 32px; }
.brand-link { display: flex; align-items: center; gap: 10px; color: #10263b; font-weight: 700; }
.brand-link img { width: 34px; height: 34px; }
.about-header nav { display: flex; gap: 22px; font-size: 14px; }
.about-header nav a, .next-steps a { color: #087f73; }
main { width: min(920px, calc(100% - 40px)); margin: 0 auto; padding: 72px 0 96px; }
section { margin-top: 54px; }
.intro { margin-top: 0; }
.eyebrow { margin: 0 0 12px; color: #087f73; font-size: 12px; font-weight: 800; letter-spacing: .12em; }
h1 { max-width: 760px; margin: 0; font-size: 48px; line-height: 1.1; }
h2 { margin: 0 0 18px; font-size: 27px; }
h3 { margin: 0 0 9px; font-size: 18px; }
p, li { font-size: 16px; line-height: 1.85; }
.lead { max-width: 780px; color: #42566b; font-size: 20px; }
.fact-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.fact-grid article { border: 1px solid #dce5ec; border-radius: 8px; background: #fff; padding: 22px; }
.fact-grid p { margin: 0; color: #52667a; }
ul { padding-left: 22px; }
.next-steps { display: flex; flex-wrap: wrap; align-items: center; gap: 18px; border-top: 1px solid #dce5ec; padding-top: 32px; }
.next-steps h2 { width: 100%; }
@media (max-width: 680px) {
  .about-header { align-items: flex-start; padding: 14px 20px; }
  .about-header nav { flex-direction: column; gap: 6px; text-align: right; }
  main { padding-top: 48px; }
  h1 { font-size: 38px; }
  .fact-grid { grid-template-columns: 1fr; }
}
</style>
