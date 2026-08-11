<template>
  <figure class="diagram-frame" :aria-label="title">
    <div class="diagram-head"><span class="diagram-kicker">图示</span><span>{{ title }}</span></div>
    <div v-if="kind === 'pipeline'" class="diagram diagram-pipeline">
      <div class="diagram-node node-client"><Icon name="terminal" size="sm" /><span>客户端</span></div><Icon name="arrowRight" size="sm" class="diagram-arrow" />
      <div class="diagram-node node-key"><Icon name="key" size="sm" /><span>API Key</span></div><Icon name="arrowRight" size="sm" class="diagram-arrow" />
      <div class="diagram-node node-group"><Icon name="grid" size="sm" /><span>分组</span></div><Icon name="arrowRight" size="sm" class="diagram-arrow" />
      <div class="diagram-node node-upstream"><Icon name="server" size="sm" /><span>上游</span></div>
    </div>
    <div v-else-if="kind === 'concepts'" class="diagram diagram-concepts">
      <div class="diagram-node node-user"><Icon name="user" size="sm" /><span>用户 / Key</span></div>
      <div class="diagram-branch"><span>权限</span><span>路由</span></div>
      <div class="diagram-node node-group"><Icon name="grid" size="sm" /><span>分组</span></div>
      <div class="diagram-branch"><span>渠道</span><span>账号</span></div>
      <div class="diagram-node node-upstream"><Icon name="server" size="sm" /><span>上游响应</span></div>
    </div>
    <div v-else-if="kind === 'admin'" class="diagram diagram-stack">
      <div class="stack-step"><b>01</b><span>录入账号凭证</span></div><div class="stack-line"></div><div class="stack-step"><b>02</b><span>配置渠道入口</span></div><div class="stack-line"></div><div class="stack-step stack-active"><b>03</b><span>绑定分组模型</span></div><div class="stack-line"></div><div class="stack-step"><b>04</b><span>打开监控</span></div>
    </div>
    <div v-else-if="kind === 'billing'" class="diagram diagram-billing">
      <div class="billing-ring"><span>请求</span><small>校验余额</small></div><div class="billing-arrow">→</div><div class="billing-ring"><span>执行</span><small>记录用量</small></div><div class="billing-arrow">→</div><div class="billing-ring billing-ring-last"><span>结算</span><small>释放冻结</small></div>
    </div>
    <div v-else-if="kind === 'monitor'" class="diagram diagram-monitor">
      <div class="monitor-check"><Icon name="link" size="sm" /><span>连通性</span><small>DNS / TLS / HTTP</small></div><div class="monitor-connector"></div><div class="monitor-check"><Icon name="server" size="sm" /><span>可调度</span><small>账号 / 冷却 / 并发</small></div><div class="monitor-connector"></div><div class="monitor-check monitor-check-final"><Icon name="chart" size="sm" /><span>趋势</span><small>成功率 / P95</small></div>
    </div>
    <div v-else-if="kind === 'update'" class="diagram diagram-update">
      <div class="update-gate"><Icon name="download" size="sm" /><span>官方 Tag</span></div><div class="update-gate"><Icon name="shield" size="sm" /><span>定制保留</span></div><div class="update-gate"><Icon name="beaker" size="sm" /><span>构建检查</span></div><div class="update-gate update-gate-final"><Icon name="checkCircle" size="sm" /><span>健康切换</span></div>
    </div>
    <div v-else-if="kind === 'troubleshoot'" class="diagram diagram-troubleshoot">
      <div class="trouble-status"><b>503</b><span>无可用账号</span></div><div class="trouble-status"><b>524</b><span>上游超时</span></div><div class="trouble-status trouble-status-neutral"><b>200</b><span>检查用量</span></div>
    </div>
    <div v-else-if="kind === 'security'" class="diagram diagram-security">
      <div class="security-layer"><Icon name="key" size="sm" /><span>Key</span><small>只给应用</small></div><div class="security-layer"><Icon name="lock" size="sm" /><span>网关</span><small>HTTPS / 脱敏</small></div><div class="security-layer security-layer-last"><Icon name="shield" size="sm" /><span>上游</span><small>最小权限</small></div>
    </div>
    <div v-else class="diagram diagram-api">
      <div class="api-code"><span class="api-dot"></span><span class="api-dot"></span><span class="api-dot"></span><code>baseURL = /v1</code><code>Authorization: Bearer</code><code>model + messages</code></div><div class="api-response"><Icon name="checkCircle" size="md" /><span>JSON 响应</span></div>
    </div>
    <figcaption>示意图：实际可用模型、渠道和计费规则以管理员配置为准。</figcaption>
  </figure>
</template>

<script setup lang="ts">
import Icon from '@/components/icons/Icon.vue'
defineProps<{ kind: 'pipeline' | 'admin' | 'api' | 'billing' | 'monitor' | 'update' | 'troubleshoot' | 'security' | 'concepts'; title: string }>()
</script>

<style scoped>
.diagram-frame { border: 1px solid #29456f; border-radius: .65rem; background: linear-gradient(145deg, rgba(12, 29, 56, .96), rgba(9, 21, 43, .98)); padding: 1.35rem; box-shadow: 0 22px 45px rgba(0, 4, 18, .28); }
.diagram-head { display: flex; align-items: center; gap: .65rem; color: #edf4ff; font-size: .82rem; font-weight: 750; }
.diagram-kicker { border-radius: .35rem; background: linear-gradient(135deg, #0ea5b7, #0f766e); padding: .23rem .45rem; color: white; font-size: .62rem; }
.diagram { min-height: 220px; padding: 1.4rem .3rem .8rem; }
.diagram-node { display: flex; min-width: 4.5rem; flex-direction: column; align-items: center; gap: .42rem; border: 1px solid rgba(32, 211, 230, .5); border-radius: .6rem; background: linear-gradient(155deg, rgba(9, 101, 124, .34), rgba(9, 34, 59, .8)); padding: .85rem .5rem; color: #72ecf5; font-size: .7rem; font-weight: 750; box-shadow: inset 0 0 22px rgba(21, 187, 214, .12); }
.diagram-pipeline { display: flex; align-items: center; justify-content: space-between; gap: .25rem; }
.diagram-arrow { flex-shrink: 0; color: #2dd4bf; }
.diagram-concepts { display: grid; grid-template-columns: 1fr .72fr 1fr .72fr 1fr; align-items: center; gap: .35rem; }
.diagram-concepts .diagram-node { min-height: 9.5rem; justify-content: center; }
.diagram-concepts .node-group { border-color: rgba(153, 96, 255, .65); color: #bb8cff; background: linear-gradient(155deg, rgba(89, 47, 160, .45), rgba(22, 25, 68, .88)); box-shadow: inset 0 0 24px rgba(123, 73, 226, .17); }
.diagram-concepts .node-upstream { border-color: rgba(65, 151, 255, .72); color: #63b2ff; background: linear-gradient(155deg, rgba(31, 88, 160, .48), rgba(13, 31, 65, .9)); box-shadow: inset 0 0 24px rgba(52, 124, 235, .18); }
.diagram-branch { display: flex; flex-direction: column; align-items: center; gap: .3rem; color: #64748b; font-size: .62rem; }
.diagram-branch span { position: relative; }
.diagram-branch span::before { content: ''; position: absolute; top: 50%; right: calc(100% + .22rem); width: .7rem; border-top: 1px dashed #5eead4; }
.diagram-stack { padding-top: .9rem; }
.stack-step { display: flex; align-items: center; gap: .65rem; border: 1px solid #e2e8f0; border-radius: .45rem; background: white; padding: .42rem .6rem; color: #64748b; font-size: .68rem; }
.stack-step { border-color: #284365; background: #0b1b35; color: #9eb2d2; }
.stack-step b { color: #14b8a6; font-size: .62rem; }
.stack-active { border-color: #5eead4; background: #ccfbf1; color: #115e59; }
.dark .stack-active { background: rgba(13, 148, 136, .2); color: #99f6e4; }
.stack-line { height: .45rem; margin-left: .95rem; border-left: 1px dashed #5eead4; }
.diagram-billing, .diagram-monitor, .diagram-security { display: flex; align-items: center; justify-content: space-between; gap: .35rem; }
.billing-ring, .monitor-check, .security-layer { display: flex; min-width: 4.35rem; flex-direction: column; align-items: center; gap: .25rem; text-align: center; color: #0f766e; font-size: .68rem; font-weight: 700; }
.billing-ring::before { content: ''; position: absolute; width: 4.2rem; height: 4.2rem; border: 2px solid #5eead4; border-radius: 50%; }
.billing-ring { position: relative; height: 4.2rem; justify-content: center; }
.billing-ring small, .monitor-check small, .security-layer small { display: block; color: #64748b; font-size: .54rem; font-weight: 500; line-height: 1.25; }
.billing-ring small, .monitor-check small, .security-layer small { color: #94a3b8; }
.billing-arrow { color: #2dd4bf; font-size: 1.1rem; }
.monitor-check { padding: .65rem .35rem; border: 1px solid #99f6e4; border-radius: .5rem; background: rgba(255, 255, 255, .75); }
.monitor-check { background: rgba(10, 28, 51, .8); }
.monitor-connector { flex: 1; border-top: 1px dashed #5eead4; }
.update-gate { display: flex; align-items: center; gap: .5rem; border-bottom: 1px solid #99f6e4; padding: .45rem 0; color: #0f766e; font-size: .7rem; font-weight: 700; }
.update-gate::after { content: '通过'; margin-left: auto; border-radius: .3rem; background: #ccfbf1; padding: .15rem .35rem; color: #0f766e; font-size: .55rem; }
.update-gate::after { background: rgba(13, 148, 136, .2); color: #99f6e4; }
.update-gate-final { color: #047857; }
.diagram-troubleshoot { display: grid; grid-template-columns: repeat(3, 1fr); align-items: center; gap: .45rem; }
.trouble-status { display: flex; min-height: 5rem; flex-direction: column; align-items: center; justify-content: center; gap: .3rem; border: 1px solid #fecaca; border-radius: .5rem; background: #fff1f2; color: #be123c; text-align: center; }
.trouble-status b { font-size: 1.1rem; }
.trouble-status span { font-size: .62rem; }
.trouble-status-neutral { border-color: #99f6e4; background: #f0fdfa; color: #0f766e; }
.trouble-status { border-color: rgba(251, 113, 133, .35); background: rgba(159, 18, 57, .15); }
.trouble-status-neutral { border-color: rgba(45, 212, 191, .3); background: rgba(13, 148, 136, .12); }
.security-layer { min-height: 5.4rem; justify-content: center; border: 1px solid #99f6e4; border-radius: .5rem; background: rgba(255, 255, 255, .75); }
.security-layer { background: rgba(10, 28, 51, .8); }
.api-code { display: flex; flex-direction: column; gap: .4rem; border-radius: .5rem; background: #0f172a; padding: .8rem; color: #a7f3d0; font-size: .62rem; }
.api-dot { display: inline-block; width: .35rem; height: .35rem; margin-right: .15rem; border-radius: 50%; background: #fb7185; }
.api-dot:nth-child(2) { background: #facc15; }.api-dot:nth-child(3) { background: #4ade80; }
.api-response { display: flex; align-items: center; justify-content: center; gap: .45rem; margin-top: .7rem; color: #047857; font-size: .7rem; font-weight: 700; }
.diagram-api { min-height: 150px; }
figcaption { margin-top: .75rem; color: #8094b7; font-size: .62rem; line-height: 1.5; }
@media (max-width: 640px) { .diagram-frame { padding: .8rem; } .diagram-node { min-width: 3.8rem; padding: .6rem .25rem; font-size: .59rem; } .diagram-arrow { width: .85rem; } .diagram { min-height: 132px; } }
</style>
