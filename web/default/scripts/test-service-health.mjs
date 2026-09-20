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
import { createElement } from 'react'
import i18next from 'i18next'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { initReactI18next } from 'react-i18next'
import { RecentRequestStrip } from '../src/features/channel-monitor/components/success-rate-strip.tsx'
import { ModelPerfBadge } from '../src/features/pricing/components/model-perf-badge.tsx'
import {
  toUptimeSeries,
  summarizeUptime,
} from '../src/features/pricing/lib/performance-health.ts'
import zh from '../src/i18n/locales/zh.json'
import {
  serviceHealth,
  recentRequestHealth,
  summarizeHealth,
  summarizeRecentRequests,
} from '../src/lib/service-health.ts'

assert.equal(serviceHealth(90, 100), 'healthy')
assert.equal(serviceHealth(89.99, 100), 'warning')
assert.equal(serviceHealth(50, 100), 'warning')
assert.equal(serviceHealth(49.99, 10), 'critical')
assert.equal(serviceHealth(0, 9), 'warning')
assert.equal(serviceHealth(0), 'warning')
assert.equal(serviceHealth(100, 0), 'unknown')
assert.equal(serviceHealth(Number.NaN, 50), 'unknown')
assert.equal(serviceHealth(100, Number.NaN), 'unknown')
// Completion remains successful regardless of long duration or low throughput.
assert.equal(recentRequestHealth(true, 10), 'healthy')
assert.equal(recentRequestHealth(false, 1), 'warning')
assert.equal(recentRequestHealth(false, 2), 'warning')
assert.equal(recentRequestHealth(false, 3), 'critical')
const uneven = [
  { success_rate: 100, request_count: 99, success_count: 99 },
  { success_rate: 0, request_count: 1, success_count: 0 },
  { success_rate: 0, request_count: 0 },
]
assert.equal(summarizeHealth(uneven).success_rate, 99)
assert.equal(summarizeHealth([]).request_count, 0)
assert(Number.isNaN(summarizeHealth([]).success_rate))
const groups = uneven.map((sample, index) => ({
  ...sample,
  group: String(index),
  series: [{ ...sample, ts: 1789376400 }],
}))
const series = toUptimeSeries(groups)
assert.equal(series.length, 1)
assert.equal(series[0].uptime_pct, 99)
assert.equal(series[0].incidents, 0)
assert.equal(summarizeUptime(series).success_rate, 99)
const emptySeries = toUptimeSeries([
  { series: [{ ts: 1789376400, success_rate: 0, request_count: 0 }] },
])
assert(Number.isNaN(emptySeries[0].uptime_pct))
assert.equal(emptySeries[0].incidents, 0)
const recent = [
  ...Array(30).fill({ success: false }),
  ...Array(30).fill({ success: true }),
]
assert.equal(summarizeRecentRequests(recent).success_rate, 100)
assert.equal(summarizeRecentRequests(recent).request_count, 30)
console.log(
  'Service health: thresholds, sparse data, weighted summaries and recent request windows passed'
)

await i18next.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
  interpolation: { escapeValue: false },
})
const strip = renderToStaticMarkup(
  createElement(RecentRequestStrip, {
    requests: [
      {
        ts: 1,
        success: true,
        latency_ms: 180000,
        output_tokens: 1000,
        generation_ms: 180000,
        throughput_available: true,
      },
      ...[2, 3, 4].map((ts) => ({ ts, success: false })),
      { ts: 5, success: true, latency_ms: 300000 },
      { ts: 6, success: false },
    ],
  })
)
const colors = [...strip.matchAll(/data-service-health="([^"]+)"/g)]
  .map((match) => match[1])
  .slice(-6)
assert.deepEqual(colors, [
  'healthy',
  'warning',
  'warning',
  'critical',
  'healthy',
  'warning',
])
const badge = renderToStaticMarkup(
  createElement(ModelPerfBadge, {
    perf: {
      avg_latency_ms: 100000,
      avg_tps: 5,
      success_rate: 95,
      request_count: 20,
    },
  })
)
assert(badge.includes('data-service-health="healthy"'))
assert.equal((badge.match(/bg-emerald-500/g) ?? []).length, 3)
console.log(
  'Rendered regression checks passed: slow successes stay green, consecutive failures and all three badge bars use the shared policy'
)

assert.deepEqual(Object.keys(zh), ['translation'])
i18next.addResourceBundle('zh', 'translation', zh.translation)
await i18next.changeLanguage('zh')
assert.equal(
  i18next.t('Recent {{count}} requests', { count: 30 }),
  '最近 30 次请求'
)
assert.equal(i18next.t('Some requests failed'), '部分请求失败')
assert(
  i18next
    .t(
      'Green: success rate ≥90%. Yellow: below 90%. Red: below 50% with at least 10 requests. Gray: no data.'
    )
    .startsWith('绿色')
)
console.log('Chinese health labels and request-window translation verified')
