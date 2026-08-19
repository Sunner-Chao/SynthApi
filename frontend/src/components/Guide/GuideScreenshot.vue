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
.guide-shot { margin: 0; border-bottom: 1px solid #172a49; padding: 2.5rem 0; }
.guide-shot-frame { position: relative; overflow: hidden; border: 1px solid #29456f; border-radius: .6rem; background: #0b1b35; box-shadow: 0 18px 45px rgba(0, 4, 18, .32); }
.guide-shot-frame img { display: block; width: 100%; height: auto; }
.guide-shot-marker { position: absolute; display: flex; width: 1.45rem; height: 1.45rem; transform: translate(-50%, -50%); align-items: center; justify-content: center; border: 2px solid white; border-radius: 9999px; background: #e11d48; color: white; font-size: .66rem; font-weight: 800; box-shadow: 0 3px 10px rgba(159, 18, 57, .38); }
.guide-shot figcaption { display: flex; flex-wrap: wrap; align-items: baseline; gap: .45rem .8rem; margin-top: 1rem; }
.guide-shot figcaption strong { color: #f8fafc; font-size: .92rem; }
.guide-shot figcaption span { color: #94a3b8; font-size: .78rem; }
.guide-shot-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; margin-top: 1.15rem; }
.guide-shot-steps li { display: flex; min-width: 0; gap: .7rem; }
.guide-shot-steps > li > span { display: flex; width: 1.7rem; height: 1.7rem; flex: 0 0 1.7rem; align-items: center; justify-content: center; border-radius: 9999px; background: #e11d48; color: white; font-size: .72rem; font-weight: 800; }
.guide-shot-steps p { min-width: 0; margin: 0; color: #d9e5f6; font-size: .8rem; line-height: 1.45; }
.guide-shot-steps strong, .guide-shot-steps small { display: block; }
.guide-shot-steps small { margin-top: .2rem; color: #94a3b8; font-size: .72rem; font-weight: 400; }
.guide-shot-note { margin-top: .85rem; color: #94a3b8; font-size: .68rem; line-height: 1.5; }

@media (max-width: 720px) {
  .guide-shot { padding: 1.8rem 0; }
  .guide-shot-marker { width: 1.25rem; height: 1.25rem; font-size: .58rem; }
  .guide-shot-steps { grid-template-columns: 1fr; }
}
</style>
