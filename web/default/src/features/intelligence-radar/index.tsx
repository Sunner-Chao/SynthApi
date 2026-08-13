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
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  BrainCircuit,
  Code2,
  Download,
  Flame,
  Lightbulb,
  RefreshCw,
  ShieldCheck,
  Signal,
  Sparkles,
  Star,
  Users,
  Zap,
} from 'lucide-react'
import { getModelIntelligence } from './api'
import './styles.css'
import type { ModelIntelligencePayload, ModelIntelligencePoint } from './types'

const FALLBACK_POINTS: ModelIntelligencePoint[] = [
  {
    key: 'sol-ultra',
    label: 'GPT-5.6 Sol ultra',
    model: 'gpt-5.6-sol',
    effort: 'ultra',
    iq: 107.86,
    passed: 302,
    total: 420,
    average_price_usd: 21.865,
    average_minutes: 52.6,
    combined_cost_index: 100,
    cache_hit_rate: 97.8,
    runs_24h: 92,
    runs_48h: 184,
    runs_total: 1530,
    source_updated_at: '',
  },
  {
    key: 'sol-max',
    label: 'GPT-5.6 Sol max',
    model: 'gpt-5.6-sol',
    effort: 'max',
    iq: 103.57,
    passed: 290,
    total: 420,
    average_price_usd: 8.4547,
    average_minutes: 33.54,
    combined_cost_index: 34,
    cache_hit_rate: 97.7,
    runs_24h: 97,
    runs_48h: 199,
    runs_total: 1783,
    source_updated_at: '',
  },
  {
    key: 'sol-xhigh',
    label: 'GPT-5.6 Sol xhigh',
    model: 'gpt-5.6-sol',
    effort: 'xhigh',
    iq: 102.14,
    passed: 286,
    total: 420,
    average_price_usd: 6.2764,
    average_minutes: 25.89,
    combined_cost_index: 11.46,
    cache_hit_rate: 97.1,
    runs_24h: 84,
    runs_48h: 192,
    runs_total: 1640,
    source_updated_at: '',
  },
  {
    key: 'sol-high',
    label: 'GPT-5.6 Sol high',
    model: 'gpt-5.6-sol',
    effort: 'high',
    iq: 98.93,
    passed: 277,
    total: 420,
    average_price_usd: 4.6245,
    average_minutes: 20.99,
    combined_cost_index: 4.45,
    cache_hit_rate: 97.1,
    runs_24h: 96,
    runs_48h: 199,
    runs_total: 1506,
    source_updated_at: '',
  },
  {
    key: 'terra-xhigh',
    label: 'GPT-5.6 Terra xhigh',
    model: 'gpt-5.6-terra',
    effort: 'xhigh',
    iq: 96.43,
    passed: 270,
    total: 420,
    average_price_usd: 1.31,
    average_minutes: 20.1,
    combined_cost_index: 2.2,
    cache_hit_rate: 95.4,
    runs_24h: 76,
    runs_48h: 168,
    runs_total: 1200,
    source_updated_at: '',
  },
  {
    key: 'sol-medium',
    label: 'GPT-5.6 Sol medium',
    model: 'gpt-5.6-sol',
    effort: 'medium',
    iq: 95.36,
    passed: 267,
    total: 420,
    average_price_usd: 3.5591,
    average_minutes: 16.88,
    combined_cost_index: 1.76,
    cache_hit_rate: 97,
    runs_24h: 85,
    runs_48h: 197,
    runs_total: 1446,
    source_updated_at: '',
  },
]

const FALLBACK_DATA: ModelIntelligencePayload = {
  source: 'CodexRadar',
  source_url: 'https://codexradar.com',
  mode: 'weighted_latest_3',
  refreshed_at: new Date().toISOString(),
  source_updated_at: '',
  cache_seconds: 60,
  stale: true,
  runs_24h_total: 1921,
  runs_48h_total: 3840,
  runs_total: 29327,
  points: FALLBACK_POINTS,
  rankings: FALLBACK_POINTS,
  community: {
    overall_score: 4.1,
    positive_rate: 81.6,
    recommend_index: 4.4,
    discussion_heat: 92.7,
    trust_index: 4.6,
    rating_count: 413,
    updated_at: '',
  },
  insights: [
    {
      key: 'daily',
      title: '日常开发',
      model: 'gpt-5.6-sol',
      model_label: 'GPT-5.6 Sol medium',
      effort: 'medium',
      iq: 95.36,
      average_cost_usd: 3.5591,
      average_duration_minutes: 16.88,
    },
    {
      key: 'hard',
      title: '难题攻坚',
      model: 'gpt-5.6-sol',
      model_label: 'GPT-5.6 Sol ultra',
      effort: 'ultra',
      iq: 107.86,
      average_cost_usd: 21.865,
      average_duration_minutes: 52.6,
    },
    {
      key: 'automation',
      title: '后台自动化',
      model: 'gpt-5.6-luna',
      model_label: 'GPT-5.6 Luna xhigh',
      effort: 'xhigh',
      iq: 87.5,
      average_cost_usd: 0.3142,
      average_duration_minutes: 23.82,
    },
    {
      key: 'value',
      title: '成本优先',
      model: 'gpt-5.6-terra',
      model_label: 'GPT-5.6 Terra medium',
      effort: 'medium',
      iq: 57.14,
      average_cost_usd: 0.6183,
      average_duration_minutes: 8.94,
    },
  ],
}

const axisLabels = [
  { label: '推理能力', icon: BrainCircuit },
  { label: '创造力', icon: Lightbulb },
  { label: '知识广度', icon: Sparkles },
  { label: '逻辑性', icon: ShieldCheck },
  { label: '指令遵循', icon: Signal },
  { label: '代码能力', icon: Code2 },
]

function formatCompact(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function formatTime(value: string) {
  if (!value) return '等待实时同步'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function shortModelLabel(value: string) {
  return value.replace(/^GPT-[\d.]+\s*/i, '')
}

function intelligenceColor(index: number) {
  return ['#ffc928', '#ff9d17', '#00f6ff', '#37f792', '#8f64ff', '#cf32ff'][
    index % 6
  ]
}

function RadarDisplay({ points }: { points: ModelIntelligencePoint[] }) {
  const [focused, setFocused] = useState<ModelIntelligencePoint | null>(null)
  const dots = points.slice(0, 14).map((point, index) => {
    const angle =
      (index / Math.max(1, Math.min(points.length, 14))) * Math.PI * 2 -
      Math.PI / 2
    const normalized = Math.max(0.18, Math.min(0.94, (point.iq - 45) / 70))
    const radius = 54 + normalized * 157
    return {
      point,
      x: 250 + Math.cos(angle) * radius,
      y: 250 + Math.sin(angle) * radius,
      color: intelligenceColor(index),
    }
  })

  return (
    <div className='intelligence-radar-display'>
      <div className='intelligence-axis-list' aria-hidden='true'>
        {axisLabels.map(({ label, icon: Icon }) => (
          <div key={label}>
            <Icon />
            <span>{label}</span>
          </div>
        ))}
      </div>
      <svg viewBox='0 0 500 500' role='img' aria-label='模型智力实时雷达'>
        <defs>
          <radialGradient id='radarGlow'>
            <stop offset='0%' stopColor='#3aff9c' stopOpacity='.46' />
            <stop offset='72%' stopColor='#21f29a' stopOpacity='.08' />
            <stop offset='100%' stopColor='#21f29a' stopOpacity='0' />
          </radialGradient>
          <linearGradient id='radarSweep' x1='0' y1='0' x2='1' y2='0'>
            <stop offset='0%' stopColor='#28ff9d' stopOpacity='.04' />
            <stop offset='100%' stopColor='#58ffae' stopOpacity='.82' />
          </linearGradient>
          <filter id='dotGlow'>
            <feGaussianBlur stdDeviation='5' result='blur' />
            <feMerge>
              <feMergeNode in='blur' />
              <feMergeNode in='SourceGraphic' />
            </feMerge>
          </filter>
        </defs>
        <circle
          cx='250'
          cy='250'
          r='232'
          fill='url(#radarGlow)'
          opacity='.42'
        />
        {Array.from({ length: 9 }).map((_, index) => (
          <circle
            key={index}
            cx='250'
            cy='250'
            r={26 + index * 25}
            className='radar-grid-circle'
          />
        ))}
        {Array.from({ length: 12 }).map((_, index) => {
          const angle = (index / 12) * Math.PI * 2
          return (
            <line
              key={index}
              x1='250'
              y1='250'
              x2={250 + Math.cos(angle) * 225}
              y2={250 + Math.sin(angle) * 225}
              className='radar-grid-line'
            />
          )
        })}
        {Array.from({ length: 12 }).map((_, index) => {
          const angle = (index / 12) * Math.PI * 2 - Math.PI / 2
          const x = 250 + Math.cos(angle) * 238
          const y = 250 + Math.sin(angle) * 238 + 4
          return (
            <text
              key={`angle-${index}`}
              x={x}
              y={y}
              textAnchor='middle'
              className='radar-angle-label'
            >
              {index * 30}
            </text>
          )
        })}
        <g className='radar-sweep'>
          <path
            d='M250 250 L250 28 A222 222 0 0 1 442 139 Z'
            fill='url(#radarSweep)'
          />
          <line
            x1='250'
            y1='250'
            x2='442'
            y2='139'
            className='radar-sweep-edge'
          />
        </g>
        <circle cx='250' cy='250' r='7' className='radar-core' />
        {dots.map(({ point, x, y, color }) => (
          <g
            key={point.key}
            className='radar-model-dot'
            tabIndex={0}
            role='button'
            aria-label={`${point.label} IQ ${point.iq}`}
            onMouseEnter={() => setFocused(point)}
            onMouseLeave={() => setFocused(null)}
            onFocus={() => setFocused(point)}
            onBlur={() => setFocused(null)}
          >
            <circle
              cx={x}
              cy={y}
              r='11'
              fill={color}
              opacity='.18'
              filter='url(#dotGlow)'
            />
            <circle
              cx={x}
              cy={y}
              r='5.5'
              fill={color}
              stroke='#dffff1'
              strokeWidth='1.4'
            />
          </g>
        ))}
      </svg>
      <div className='radar-focus-readout'>
        {focused ? (
          <>
            <strong>{focused.label}</strong>
            <span>
              IQ {focused.iq.toFixed(1)} · {focused.passed}/{focused.total}
            </span>
          </>
        ) : (
          <>
            <strong>扫描全模型生态</strong>
            <span>聚焦光点查看实时智力样本</span>
          </>
        )}
      </div>
      <div className='radar-legend' aria-hidden='true'>
        <strong>雷达图例</strong>
        {points.slice(0, 4).map((point, index) => (
          <span key={point.key}>
            <i style={{ background: intelligenceColor(index) }} />
            {shortModelLabel(point.label)}
          </span>
        ))}
      </div>
    </div>
  )
}

function DownloadReport({ data }: { data: ModelIntelligencePayload }) {
  const download = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `synthapi-intelligence-radar-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }
  return (
    <button
      type='button'
      className='radar-download-button'
      onClick={download}
      title='下载实时数据报告'
    >
      <Download />
      <span>数据报告下载</span>
    </button>
  )
}

function RadarObserver() {
  return (
    <div
      className='radar-observer-scene'
      data-observer-release='20260812-reference-frontstage-v4'
      style={{
        backgroundImage: "url('/radar-assets/comic-command-deck-v2.png')",
      }}
      aria-hidden='true'
    />
  )
}

export function IntelligenceRadar() {
  const query = useQuery({
    queryKey: ['model-intelligence-radar'],
    queryFn: getModelIntelligence,
    refetchInterval: 60_000,
    staleTime: 45_000,
    retry: 1,
  })
  const data =
    query.data?.success && query.data.data ? query.data.data : FALLBACK_DATA
  const rankings = data.rankings.length ? data.rankings : FALLBACK_POINTS
  const topPoints = useMemo(
    () => [...data.points].sort((a, b) => b.iq - a.iq),
    [data.points]
  )
  const community =
    data.community.rating_count > 0 ? data.community : FALLBACK_DATA.community
  const stale = data.stale || query.isError
  const sampleCards = [
    {
      label: '24H 活跃样本',
      value: data.runs_24h_total,
      note: '滚动测试',
      percent: Math.min(100, data.runs_24h_total / 25),
    },
    {
      label: '48H 活跃样本',
      value: data.runs_48h_total,
      note: '趋势确认',
      percent: Math.min(100, data.runs_48h_total / 50),
    },
    {
      label: '历史测试总量',
      value: data.runs_total,
      note: '全量档案',
      percent: Math.min(100, data.runs_total / 350),
    },
  ]

  return (
    <div className='intelligence-page'>
      <div className='intelligence-stage'>
        <div
          className='intelligence-stage-backdrop'
          style={{
            backgroundImage: "url('/radar-assets/comic-command-deck-v2.png')",
          }}
          aria-hidden='true'
        />
        <div className='comic-halftone' aria-hidden='true' />
        <div
          className='comic-speed-lines comic-speed-lines-left'
          aria-hidden='true'
        />
        <div
          className='comic-speed-lines comic-speed-lines-right'
          aria-hidden='true'
        />
        <div className='comic-sticker comic-sticker-left' aria-hidden='true'>
          MIND
          <br />
          OVER
          <br />
          MODEL!
        </div>
        <div className='comic-sticker comic-sticker-right' aria-hidden='true'>
          SCAN!
        </div>
        <div className='intelligence-screen-plane'>
        <header className='intelligence-header'>
          <div className='intelligence-brand-mini'>
            <div className='intelligence-brand-orbit'>
              <BrainCircuit />
            </div>
            <div>
              <strong>GPT RADAR</strong>
              <span>INTELLIGENCE STATION</span>
            </div>
          </div>
          <div className='intelligence-title'>
            <Zap />
            <div>
              <h1>GPT 模型智力雷达</h1>
              <p>MODEL INTELLIGENCE RADAR STATION</p>
            </div>
          </div>
          <div className='intelligence-header-status'>
            <div>
              <strong>v1.0.0</strong>
              <span>
                <i className={stale ? 'is-stale' : ''} />
                {stale ? '缓存数据' : '实时运行'}
              </span>
              <small>
                更新 {formatTime(data.source_updated_at || data.refreshed_at)}
              </small>
            </div>
            <DownloadReport data={data} />
          </div>
        </header>

        <main className='intelligence-grid'>
          <section className='radar-panel ranking-panel'>
            <div className='radar-panel-title amber'>
              <BrainCircuit />
              <div>
                <h2>智力排行榜</h2>
                <span>MODEL IQ RANKING</span>
              </div>
            </div>
            <div className='ranking-list'>
              {rankings.slice(0, 6).map((point, index) => (
                <article
                  key={point.key}
                  className={`ranking-row ranking-${index + 1}`}
                >
                  <span className='ranking-index'>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className='ranking-orb'>
                    <Sparkles />
                  </div>
                  <div className='ranking-name'>
                    <strong title={point.label}>
                      {shortModelLabel(point.label)}
                    </strong>
                    <span>IQ 智力指数</span>
                    <b>{point.iq.toFixed(1)}</b>
                  </div>
                  <div className='ranking-tests'>
                    <strong>
                      {point.passed.toFixed(0)}/{point.total.toFixed(0)}
                    </strong>
                    <span>得分/测试项</span>
                  </div>
                </article>
              ))}
            </div>
            <a
              className='radar-source-link'
              href={data.source_url}
              target='_blank'
              rel='noreferrer'
            >
              数据源 · CODEXRADAR.COM
            </a>
          </section>

          <section className='radar-panel sample-panel'>
            <div className='radar-panel-title cyan'>
              <Activity />
              <div>
                <h2>样本雷达</h2>
                <span>LIVE SAMPLE RADAR</span>
              </div>
            </div>
            <div className='sample-card-list'>
              {sampleCards.map((card, index) => (
                <article key={card.label} className='sample-card'>
                  <div>
                    <strong>{card.label}</strong>
                    {index === 0 && <Zap />}
                  </div>
                  <b>{formatCompact(card.value)}</b>
                  <span>{card.note} / 60s</span>
                  <div className='sample-progress'>
                    <i style={{ width: `${card.percent}%` }} />
                  </div>
                  <small>数据覆盖 {Math.round(card.percent)}%</small>
                </article>
              ))}
            </div>
          </section>

          <section className='radar-panel live-radar-panel'>
            <div className='live-radar-heading'>
              <div>
                <h2>实时模型表现雷达图</h2>
                <span>REAL-TIME MODEL PERFORMANCE RADAR</span>
              </div>
              <div className='signal-strength'>
                <span>信号强度</span>
                <Signal />
              </div>
            </div>
            <RadarDisplay points={topPoints} />
            <div className='radar-footer'>
              <span>扫描范围：全模型生态</span>
              <span>
                刷新周期：60s <i />
              </span>
            </div>
          </section>

          <section className='radar-panel community-panel'>
            <div className='radar-panel-title violet'>
              <Users />
              <div>
                <h2>社区体感分</h2>
                <span>COMMUNITY SENTIMENT</span>
              </div>
            </div>
            <div className='community-score'>
              <span>综合体感评分</span>
              <strong>
                {community.overall_score.toFixed(1)} <small>/ 5.0</small>
              </strong>
              <div className='community-stars'>
                {Array.from({ length: 5 }).map((_, index) => (
                  <Star
                    key={index}
                    className={
                      index < Math.round(community.overall_score) ? 'is-on' : ''
                    }
                  />
                ))}
              </div>
              <p>
                <Users /> 基于 {community.rating_count.toLocaleString('zh-CN')}{' '}
                个社区评价
              </p>
            </div>
            <div className='community-metrics'>
              <article>
                <span>正面评价率</span>
                <strong>{community.positive_rate.toFixed(1)}%</strong>
              </article>
              <article>
                <span>推荐指数</span>
                <strong>{community.recommend_index.toFixed(1)}/5</strong>
              </article>
              <article>
                <span>讨论热度</span>
                <strong>
                  <Flame />
                  {community.discussion_heat.toFixed(1)}
                </strong>
              </article>
              <article>
                <span>信任指数</span>
                <strong>{community.trust_index.toFixed(1)}/5</strong>
              </article>
            </div>
          </section>

          <section className='radar-panel updates-panel'>
            <div className='updates-title'>
              <Activity />
              <h2>近期重要动态</h2>
              <span>RECENT INTELLIGENCE SIGNALS</span>
              <button
                type='button'
                onClick={() => query.refetch()}
                title='立即刷新'
                disabled={query.isFetching}
              >
                <RefreshCw className={query.isFetching ? 'is-spinning' : ''} />
              </button>
            </div>
            <div className='updates-list'>
              {(data.insights.length ? data.insights : FALLBACK_DATA.insights)
                .slice(0, 4)
                .map((item, index) => (
                  <article key={item.key}>
                    <span className={`update-tag tag-${index + 1}`}>
                      {item.title}
                    </span>
                    <time>{index * 3 + 2} 分钟前</time>
                    <div>
                      <strong>{item.model_label}</strong>
                      <p>
                        IQ {item.iq.toFixed(1)} · 平均 $
                        {item.average_cost_usd.toFixed(2)} ·{' '}
                        {item.average_duration_minutes.toFixed(1)} 分钟
                      </p>
                    </div>
                  </article>
                ))}
            </div>
          </section>
        </main>
        </div>
        <div className='radar-foreground-deck' aria-hidden='true'>
          <span />
          <span />
          <span />
        </div>
        <RadarObserver />
      </div>
    </div>
  )
}
