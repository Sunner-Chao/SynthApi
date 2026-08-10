<template>
  <figure class="guide-shot">
    <div class="guide-shot-frame">
      <img :src="src" :alt="alt" loading="lazy" />
      <span
        v-for="marker in markers"
        :key="marker.number"
        class="guide-shot-marker"
        :style="{ left: `${marker.x}%`, top: `${marker.y}%` }"
        :aria-label="`步骤 ${marker.number}：${marker.label}`"
      >
        {{ marker.number }}
      </span>
    </div>
    <figcaption>
      <strong>{{ title }}</strong>
      <span>{{ caption }}</span>
    </figcaption>
    <ol class="guide-shot-steps">
      <li v-for="marker in markers" :key="`step-${marker.number}`">
        <span>{{ marker.number }}</span>
        <p><strong>{{ marker.label }}</strong><small>{{ marker.description }}</small></p>
      </li>
    </ol>
    <p class="guide-shot-note">截图来自 SynthAPI 实际页面；界面可能随版本调整，请以站点当前显示为准。</p>
  </figure>
</template>

<script setup lang="ts">
export type GuideScreenshotMarker = {
  number: number
  x: number
  y: number
  label: string
  description: string
}

defineProps<{
  src: string
  alt: string
  title: string
  caption: string
  markers: GuideScreenshotMarker[]
}>()
</script>

<style scoped>
.guide-shot { margin: 0; border-bottom: 1px solid #e2e8f0; padding: 2.5rem 0; }
.dark .guide-shot { border-color: #1e293b; }
.guide-shot-frame { position: relative; overflow: hidden; border: 1px solid #cbd5e1; border-radius: .5rem; background: #e2e8f0; box-shadow: 0 16px 42px rgba(15, 23, 42, .12); }
.dark .guide-shot-frame { border-color: #334155; background: #1e293b; }
.guide-shot-frame img { display: block; width: 100%; height: auto; }
.guide-shot-marker { position: absolute; display: flex; width: 2rem; height: 2rem; transform: translate(-50%, -50%); align-items: center; justify-content: center; border: 3px solid white; border-radius: 9999px; background: #e11d48; color: white; font-size: .82rem; font-weight: 800; box-shadow: 0 4px 14px rgba(159, 18, 57, .4); }
.guide-shot figcaption { display: flex; flex-wrap: wrap; align-items: baseline; gap: .45rem .8rem; margin-top: 1rem; }
.guide-shot figcaption strong { color: #0f172a; font-size: .92rem; }
.dark .guide-shot figcaption strong { color: #f8fafc; }
.guide-shot figcaption span { color: #64748b; font-size: .78rem; }
.dark .guide-shot figcaption span { color: #94a3b8; }
.guide-shot-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; margin-top: 1.15rem; }
.guide-shot-steps li { display: flex; min-width: 0; gap: .7rem; }
.guide-shot-steps > li > span { display: flex; width: 1.7rem; height: 1.7rem; flex: 0 0 1.7rem; align-items: center; justify-content: center; border-radius: 9999px; background: #e11d48; color: white; font-size: .72rem; font-weight: 800; }
.guide-shot-steps p { min-width: 0; margin: 0; color: #334155; font-size: .8rem; line-height: 1.45; }
.dark .guide-shot-steps p { color: #e2e8f0; }
.guide-shot-steps strong, .guide-shot-steps small { display: block; }
.guide-shot-steps small { margin-top: .2rem; color: #64748b; font-size: .72rem; font-weight: 400; }
.dark .guide-shot-steps small { color: #94a3b8; }
.guide-shot-note { margin-top: .85rem; color: #94a3b8; font-size: .68rem; line-height: 1.5; }

@media (max-width: 720px) {
  .guide-shot { padding: 1.8rem 0; }
  .guide-shot-marker { width: 1.55rem; height: 1.55rem; border-width: 2px; font-size: .68rem; }
  .guide-shot-steps { grid-template-columns: 1fr; }
}
</style>
