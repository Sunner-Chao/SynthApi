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
import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import {
  Activity,
  CircleDollarSign,
  Clock3,
  Cpu,
  Eye,
  EyeOff,
  Gauge,
  MoonStar,
  MoreHorizontal,
  Radio,
  Sparkles,
  Sun,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import dayjs from '@/lib/dayjs'
import {
  formatCompactNumber,
  formatLogQuota,
  formatUseTime,
} from '@/lib/format'
import { useTheme } from '@/context/theme-provider'
import { useIsAdmin } from '@/hooks/use-admin'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getUserQuotaDates } from '@/features/dashboard/api'
import { calculateDashboardStats } from '@/features/dashboard/lib/stats'
import type { QuotaDataItem } from '@/features/dashboard/types'
import { getLogStats, getUserLogStats } from '../api'
import { DEFAULT_LOG_STATS, LOG_TYPE_ENUM } from '../constants'
import { parseLogOther } from '../lib/format'
import {
  buildApiParams,
  getDefaultTimeRange,
  isTimingLogType,
} from '../lib/utils'
import type { LogStatistics, UsageLog } from '../types'
import './common-logs-command-center-day.css'
import './common-logs-command-center.css'
import { useUsageLogsContext } from './usage-logs-provider'

const route = getRouteApi('/_authenticated/usage-logs/$section')

const MODEL_COLORS = ['#19a9ff', '#695cff', '#13c8c1', '#9a5cff', '#39d29f']

interface CommonLogsCommandCenterProps {
  logs: UsageLog[]
  total: number
  isFetching: boolean
  children: ReactNode
  viewSwitch?: ReactNode
}

interface TrendPoint {
  timestamp: number
  label: string
  requests: number
  tokens: number
  quota: number
}

interface LogSparkPoint {
  index: number
  latency: number
  error: number
}

interface ModelSlice {
  name: string
  value: number
  color: string
}

function buildTrendData(items: QuotaDataItem[]): TrendPoint[] {
  const buckets = new Map<number, TrendPoint>()

  for (const item of items) {
    const timestamp = Number(item.created_at) || 0
    if (timestamp <= 0) continue
    const current = buckets.get(timestamp) ?? {
      timestamp,
      label: dayjs(timestamp * 1000).format('HH:mm'),
      requests: 0,
      tokens: 0,
      quota: 0,
    }
    current.requests += Number(item.count) || 0
    current.tokens += Number(item.token_used) || 0
    current.quota += Number(item.quota) || 0
    buckets.set(timestamp, current)
  }

  return Array.from(buckets.values()).sort(
    (left, right) => left.timestamp - right.timestamp
  )
}

function buildModelDistribution(items: QuotaDataItem[], otherLabel: string) {
  const counts = new Map<string, number>()

  for (const item of items) {
    const model = item.model_name?.trim() || otherLabel
    counts.set(model, (counts.get(model) ?? 0) + (Number(item.count) || 0))
  }

  const ranked = Array.from(counts.entries()).sort(
    (left, right) => right[1] - left[1]
  )
  const top = ranked.slice(0, 4)
  const remainder = ranked.slice(4).reduce((sum, [, count]) => sum + count, 0)
  const slices =
    remainder > 0 ? [...top, [otherLabel, remainder] as const] : top

  return slices.map(
    ([name, value], index): ModelSlice => ({
      name,
      value,
      color: MODEL_COLORS[index % MODEL_COLORS.length],
    })
  )
}

function buildLogSpark(logs: UsageLog[]): LogSparkPoint[] {
  return [...logs]
    .filter((log) => isTimingLogType(log.type))
    .sort((left, right) => left.created_at - right.created_at)
    .slice(-14)
    .map((log, index) => {
      const other = parseLogOther(log.other)
      const hasStreamError =
        other?.stream_status?.status != null &&
        other.stream_status.status !== 'ok'
      return {
        index,
        latency: Number(log.use_time) || 0,
        error: log.type === LOG_TYPE_ENUM.ERROR || hasStreamError ? 1 : 0,
      }
    })
}

function formatPercent(value: number): string {
  return `${value.toFixed(value >= 10 ? 1 : 2)}%`
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function getActivePointIndex(
  value: number | string | null | undefined
): number | null {
  if (value === null || value === undefined || value === '') return null
  const index = Number(value)
  return Number.isInteger(index) && index >= 0 ? index : null
}

function Panel(props: {
  title: string
  icon: LucideIcon
  className?: string
  actions?: ReactNode
  children: ReactNode
}) {
  const Icon = props.icon
  return (
    <section className={`command-panel ${props.className ?? ''}`}>
      <svg
        className='command-panel-frame'
        viewBox='0 0 400 300'
        preserveAspectRatio='none'
        aria-hidden='true'
      >
        <path
          className='command-panel-frame-outer'
          vectorEffect='non-scaling-stroke'
          d='M20 7 Q200 18 380 7 C390 10 395 20 396 34 C402 103 402 218 388 278 C386 288 378 294 366 295 Q200 284 34 295 C22 294 14 288 12 278 C-2 218 -2 103 4 34 C5 20 10 10 20 7 Z'
        />
        <path
          className='command-panel-frame-inner'
          vectorEffect='non-scaling-stroke'
          d='M27 16 Q200 24 373 16 C381 19 386 27 387 40 C392 108 392 211 380 271 C378 279 372 284 362 285 Q200 277 38 285 C28 284 22 279 20 271 C8 211 8 108 13 40 C14 27 19 19 27 16 Z'
        />
      </svg>
      {props.actions ? null : (
        <span className='command-panel-cut' aria-hidden='true' />
      )}
      <div className='command-panel-title'>
        <span>
          <Icon aria-hidden='true' />
          {props.title}
        </span>
        {props.actions ?? <MoreHorizontal aria-hidden='true' />}
      </div>
      <div className='command-panel-content'>{props.children}</div>
    </section>
  )
}

function MetricProgress(props: {
  label: string
  value: string
  percent: number
  tone: 'cyan' | 'teal' | 'violet'
}) {
  return (
    <div className='command-progress'>
      <div>
        <span>{props.label}</span>
        <strong>{props.value}</strong>
      </div>
      <div className='command-progress-track'>
        <span
          className={`command-progress-fill command-progress-${props.tone}`}
          style={{ width: `${clampPercent(props.percent)}%` }}
        />
      </div>
    </div>
  )
}

function MiniSparkline(props: {
  data: Array<Record<string, number | string>>
  dataKey: string
  color: string
}) {
  if (props.data.length === 0) return <div className='command-spark-empty' />

  return (
    <div className='command-kpi-spark' aria-hidden='true'>
      <ResponsiveContainer width='100%' height='100%'>
        <AreaChart
          data={props.data}
          margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
        >
          <Area
            type='monotone'
            dataKey={props.dataKey}
            stroke={props.color}
            fill={props.color}
            fillOpacity={0.13}
            strokeWidth={1.7}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function KpiCard(props: {
  label: string
  scope: string
  value: string
  icon: LucideIcon
  color: string
  data: Array<Record<string, number | string>>
  dataKey: string
}) {
  const Icon = props.icon
  return (
    <article className='command-kpi'>
      <svg
        className='command-kpi-frame'
        viewBox='0 0 320 128'
        preserveAspectRatio='none'
        aria-hidden='true'
      >
        <path
          vectorEffect='non-scaling-stroke'
          d='M12 2 Q160 14 308 2 C314 3 317 7 318 14 C320 48 320 83 316 114 C315 122 310 126 301 126 Q160 115 19 126 C10 126 5 122 4 114 C0 83 0 48 2 14 C3 7 6 3 12 2 Z'
        />
      </svg>
      <div className='command-kpi-topline'>
        <span>{props.label}</span>
        <Icon aria-hidden='true' />
      </div>
      <div className='command-kpi-value'>{props.value}</div>
      <div className='command-kpi-scope'>{props.scope}</div>
      <MiniSparkline
        data={props.data}
        dataKey={props.dataKey}
        color={props.color}
      />
    </article>
  )
}

/**
 * Y domain that keeps a real series readable when its values sit in a narrow
 * band (typical for per-bucket quota, where every point is a small fraction).
 * A [0, dataMax] domain flattens those into a near-straight line; anchoring to
 * the actual min/max with padding restores the shape without altering data.
 */
function getPaddedDomain(
  points: TrendPoint[],
  key: 'requests' | 'tokens' | 'quota'
): [number, number] {
  const values = points
    .map((point) => Number(point[key]) || 0)
    .filter((value) => Number.isFinite(value))
  if (values.length === 0) return [0, 1]

  const min = Math.min(...values)
  const max = Math.max(...values)
  if (max === min) {
    const pad = Math.abs(max) > 0 ? Math.abs(max) * 0.25 : 1
    return [min >= 0 ? Math.max(0, min - pad) : min - pad, max + pad]
  }

  const pad = (max - min) * 0.18
  return [min >= 0 ? Math.max(0, min - pad) : min - pad, max + pad]
}

function formatAxisNumber(value: number): string {
  return formatCompactNumber(Number(value) || 0)
}

function formatAxisQuota(value: number): string {
  return formatLogQuota(Number(value) || 0).replace(/(\.\d{2})\d+/, '$1')
}

function TrendReadout(props: {
  label: string
  value: string
  tone: 'cyan' | 'teal' | 'violet' | 'magenta'
  isLive: boolean
  liveLabel: string
}) {
  const displayLabel =
    props.isLive && props.label !== '—'
      ? `${props.liveLabel} · ${props.label}`
      : props.label

  return (
    <div className={`command-readout is-${props.tone}`}>
      <span className='command-readout-label'>{displayLabel}</span>
      <strong className='command-readout-value'>{props.value}</strong>
    </div>
  )
}

export function CommonLogsCommandCenter(props: CommonLogsCommandCenterProps) {
  const { t } = useTranslation()
  const { resolvedTheme, setTheme } = useTheme()
  const isAdmin = useIsAdmin()
  const searchParams = route.useSearch()
  const { sensitiveVisible, setSensitiveVisible } = useUsageLogsContext()
  const [focusedModelIndex, setFocusedModelIndex] = useState<number | null>(
    null
  )
  const [livePointIndex, setLivePointIndex] = useState<number | null>(null)
  const [requestPointIndex, setRequestPointIndex] = useState<number | null>(
    null
  )
  const [tokenPointIndex, setTokenPointIndex] = useState<number | null>(null)
  const [costPointIndex, setCostPointIndex] = useState<number | null>(null)

  const timeRange = useMemo(() => {
    const defaults = getDefaultTimeRange()
    return {
      start: searchParams.startTime
        ? new Date(searchParams.startTime)
        : defaults.start,
      end: searchParams.endTime ? new Date(searchParams.endTime) : defaults.end,
    }
  }, [searchParams.startTime, searchParams.endTime])

  const statsQuery = useQuery({
    queryKey: ['usage-logs-stats', isAdmin, searchParams],
    queryFn: async (): Promise<LogStatistics> => {
      const params = buildApiParams({
        page: 1,
        pageSize: 1,
        searchParams,
        columnFilters: [],
        isAdmin,
      })
      const result = isAdmin
        ? await getLogStats(params)
        : await getUserLogStats(params)
      return result.success
        ? result.data || DEFAULT_LOG_STATS
        : DEFAULT_LOG_STATS
    },
    placeholderData: (previousData) => previousData,
  })

  const quotaQuery = useQuery({
    queryKey: [
      'usage-logs-command-quota',
      isAdmin,
      timeRange.start.getTime(),
      timeRange.end.getTime(),
      isAdmin ? searchParams.username : '',
    ],
    queryFn: async (): Promise<QuotaDataItem[]> => {
      const result = await getUserQuotaDates(
        {
          start_timestamp: timeRange.start,
          end_timestamp: timeRange.end,
          username: isAdmin ? searchParams.username || undefined : undefined,
        },
        isAdmin
      )
      return result.success ? result.data || [] : []
    },
    placeholderData: (previousData) => previousData,
  })

  const quotaData = quotaQuery.data ?? []
  const totals = useMemo(() => calculateDashboardStats(quotaData), [quotaData])
  const trendData = useMemo(() => buildTrendData(quotaData), [quotaData])
  const modelData = useMemo(
    () => buildModelDistribution(quotaData, t('Other')),
    [quotaData, t]
  )
  const logSpark = useMemo(() => buildLogSpark(props.logs), [props.logs])

  const pageMetrics = useMemo(() => {
    const requestLogs = props.logs.filter((log) => isTimingLogType(log.type))
    const count = requestLogs.length
    const timingLogs = requestLogs.filter(
      (log) => Number.isFinite(log.use_time) && log.use_time > 0
    )
    const errorCount = requestLogs.filter((log) => {
      const other = parseLogOther(log.other)
      return (
        log.type === LOG_TYPE_ENUM.ERROR ||
        (other?.stream_status?.status != null &&
          other.stream_status.status !== 'ok')
      )
    }).length
    const streamCount = requestLogs.filter((log) => log.is_stream).length
    const fastLineCount = requestLogs.filter(
      (log) => parseLogOther(log.other)?.ingress_line === 'fast'
    ).length
    const activeModels = new Set(
      requestLogs.map((log) => log.model_name).filter(Boolean)
    ).size
    const averageLatency =
      timingLogs.length > 0
        ? timingLogs.reduce((sum, log) => sum + log.use_time, 0) /
          timingLogs.length
        : 0

    return {
      averageLatency,
      errorRate: count > 0 ? (errorCount / count) * 100 : 0,
      successRate: count > 0 ? ((count - errorCount) / count) * 100 : 0,
      streamRate: count > 0 ? (streamCount / count) * 100 : 0,
      fastLineRate: count > 0 ? (fastLineCount / count) * 100 : 0,
      activeModels,
    }
  }, [props.logs])

  const modelTotal = modelData.reduce((sum, item) => sum + item.value, 0)
  const leadingModel = modelData[0]
  const focusedModel =
    focusedModelIndex == null
      ? leadingModel
      : (modelData[focusedModelIndex] ?? leadingModel)
  const liveStats = statsQuery.data ?? DEFAULT_LOG_STATS
  const loading =
    props.isFetching || statsQuery.isFetching || quotaQuery.isFetching
  const isDay = resolvedTheme === 'light'

  const latestPoint =
    trendData.length > 0 ? trendData[trendData.length - 1] : null
  const livePoint =
    livePointIndex == null
      ? latestPoint
      : (trendData[livePointIndex] ?? latestPoint)
  const requestPoint =
    requestPointIndex == null
      ? latestPoint
      : (trendData[requestPointIndex] ?? latestPoint)
  const tokenPoint =
    tokenPointIndex == null
      ? latestPoint
      : (trendData[tokenPointIndex] ?? latestPoint)
  const costPoint =
    costPointIndex == null
      ? latestPoint
      : (trendData[costPointIndex] ?? latestPoint)
  const requestsDomain = useMemo(
    () => getPaddedDomain(trendData, 'requests'),
    [trendData]
  )
  const tokensDomain = useMemo(
    () => getPaddedDomain(trendData, 'tokens'),
    [trendData]
  )
  const quotaDomain = useMemo(
    () => getPaddedDomain(trendData, 'quota'),
    [trendData]
  )
  const hasDenseTimeAxis = trendData.length > 6
  const timeAxisInterval =
    trendData.length > 12 ? Math.ceil(trendData.length / 10) - 1 : 0
  const timeAxisAngle = hasDenseTimeAxis ? -36 : 0
  const timeAxisAnchor = hasDenseTimeAxis ? 'end' : 'middle'
  const timeAxisHeight = hasDenseTimeAxis ? 34 : 20

  const kpis = [
    {
      label: t('Total Requests'),
      scope: t('Current filter'),
      value: props.total.toLocaleString(),
      icon: Activity,
      color: '#17a9ff',
      data: trendData as unknown as Array<Record<string, number | string>>,
      dataKey: 'requests',
    },
    {
      label: t('Total Tokens'),
      scope: t('Selected time range'),
      value: formatCompactNumber(totals.totalTokens),
      icon: Sparkles,
      color: '#21c7c4',
      data: trendData as unknown as Array<Record<string, number | string>>,
      dataKey: 'tokens',
    },
    {
      label: t('Total Cost'),
      scope: t('Selected time range'),
      value: sensitiveVisible ? formatLogQuota(totals.totalQuota) : '••••',
      icon: CircleDollarSign,
      color: '#7a64ff',
      data: trendData as unknown as Array<Record<string, number | string>>,
      dataKey: 'quota',
    },
    {
      label: t('Average Response Time'),
      scope: t('Current page'),
      value:
        pageMetrics.averageLatency > 0
          ? formatUseTime(pageMetrics.averageLatency)
          : 'N/A',
      icon: Clock3,
      color: '#19a9ff',
      data: logSpark as unknown as Array<Record<string, number | string>>,
      dataKey: 'latency',
    },
    {
      label: t('Error Rate'),
      scope: t('Current page'),
      value: formatPercent(pageMetrics.errorRate),
      icon: Gauge,
      color: '#9a5cff',
      data: logSpark as unknown as Array<Record<string, number | string>>,
      dataKey: 'error',
    },
  ]

  return (
    <div
      className={`usage-command-center ${isDay ? 'is-day' : 'is-night'} ${isAdmin ? 'is-admin' : 'is-user'}`}
    >
      <div className='command-grid-backdrop' aria-hidden='true' />
      <header className='command-heading'>
        <span
          className='command-title-wing command-title-wing-left'
          aria-hidden='true'
        />
        <div className='command-title-mark' aria-hidden='true' />
        <h1>{t('Scheduling Hub')}</h1>
        <p>SCHEDULING HUB</p>
        <span
          className='command-title-wing command-title-wing-right'
          aria-hidden='true'
        />
        <div className='command-hud'>
          {props.viewSwitch}
          <span className={`command-live-state ${loading ? 'is-syncing' : ''}`}>
            <span />
            {loading ? t('Syncing') : t('Online')}
          </span>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  onClick={() => setSensitiveVisible(!sensitiveVisible)}
                  aria-label={sensitiveVisible ? t('Hide') : t('Show')}
                  className='command-icon-button'
                />
              }
            >
              {sensitiveVisible ? <Eye /> : <EyeOff />}
            </TooltipTrigger>
            <TooltipContent>
              {sensitiveVisible ? t('Hide') : t('Show')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  onClick={() => setTheme(isDay ? 'dark' : 'light')}
                  aria-label={isDay ? t('Dark') : t('Light')}
                  className='command-icon-button'
                />
              }
            >
              {isDay ? <MoonStar /> : <Sun />}
            </TooltipTrigger>
            <TooltipContent>{isDay ? t('Dark') : t('Light')}</TooltipContent>
          </Tooltip>
        </div>
      </header>

      <div className='command-layout'>
        <aside className='command-rail command-rail-left'>
          <Panel
            title={t('Model Distribution')}
            icon={Workflow}
            className='command-model-panel'
          >
            <div className='command-donut-wrap'>
              <ResponsiveContainer width='100%' height='100%'>
                <PieChart>
                  <Pie
                    data={modelData}
                    dataKey='value'
                    nameKey='name'
                    innerRadius='58%'
                    outerRadius='82%'
                    paddingAngle={2}
                    stroke='rgba(4, 23, 49, 0.9)'
                    strokeWidth={2}
                    isAnimationActive={false}
                    onMouseEnter={(_, index) => setFocusedModelIndex(index)}
                    onMouseLeave={() => setFocusedModelIndex(null)}
                  >
                    {modelData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className='command-donut-center'>
                <span>{t('Top Model')}</span>
                <strong>
                  {focusedModel && modelTotal > 0
                    ? formatPercent((focusedModel.value / modelTotal) * 100)
                    : '0%'}
                </strong>
                <small title={focusedModel?.name}>
                  {focusedModel?.name ?? '—'}
                </small>
                <em>{Number(focusedModel?.value || 0).toLocaleString()}</em>
              </div>
            </div>
            <div className='command-model-legend'>
              {modelData.map((item) => (
                <div key={item.name}>
                  <span style={{ backgroundColor: item.color }} />
                  <em title={item.name}>{item.name}</em>
                  <strong>
                    {modelTotal > 0
                      ? formatPercent((item.value / modelTotal) * 100)
                      : '0%'}
                  </strong>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title={t('Live Traffic')}
            icon={Radio}
            className='command-live-panel'
            actions={
              <TrendReadout
                label={livePoint?.label ?? '—'}
                value={Number(livePoint?.requests || 0).toLocaleString()}
                tone='cyan'
                isLive={livePointIndex == null}
                liveLabel={t('Latest')}
              />
            }
          >
            <div className='command-live-value'>
              <span>{t('Requests per minute')}</span>
              <strong>{Number(liveStats.rpm || 0).toLocaleString()}</strong>
              <em>/rpm</em>
            </div>
            <div className='command-small-chart'>
              <ResponsiveContainer width='100%' height='100%'>
                <AreaChart
                  data={trendData}
                  margin={{ top: 10, right: 10, bottom: 2, left: 0 }}
                  onMouseMove={(state) =>
                    setLivePointIndex(
                      getActivePointIndex(state?.activeTooltipIndex)
                    )
                  }
                  onMouseLeave={() => setLivePointIndex(null)}
                >
                  <CartesianGrid
                    stroke='rgba(56, 140, 218, 0.13)'
                    vertical={false}
                  />
                  <XAxis
                    dataKey='label'
                    tick={{
                      fill: '#6289b2',
                      fontSize: 'var(--command-axis-font-size)',
                    }}
                    tickLine={false}
                    axisLine={false}
                    interval={timeAxisInterval}
                    minTickGap={0}
                    tickMargin={6}
                    angle={timeAxisAngle}
                    textAnchor={timeAxisAnchor}
                    height={timeAxisHeight}
                    padding={{ left: 5, right: 5 }}
                  />
                  <YAxis
                    tick={{
                      fill: '#6289b2',
                      fontSize: 'var(--command-axis-font-size)',
                    }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    width={34}
                    tickCount={4}
                    tickFormatter={formatAxisNumber}
                    domain={requestsDomain}
                  />
                  <ChartTooltip
                    content={() => null}
                    cursor={{ stroke: '#19a9ff', strokeOpacity: 0.42 }}
                  />
                  <Area
                    type='monotone'
                    dataKey='requests'
                    stroke='#19a9ff'
                    fill='#118fe9'
                    fillOpacity={0.24}
                    strokeWidth={2.4}
                    dot={{
                      r: 2.3,
                      fill: '#061a35',
                      stroke: '#19a9ff',
                      strokeWidth: 1.5,
                    }}
                    activeDot={{ r: 3.6, fill: '#8fd8ff', strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel
            title={t('Request Status')}
            icon={Cpu}
            className='command-status-panel'
          >
            <div className='command-progress-list'>
              <MetricProgress
                label={t('Success Rate')}
                value={formatPercent(pageMetrics.successRate)}
                percent={pageMetrics.successRate}
                tone='cyan'
              />
              <MetricProgress
                label={t('Streaming Share')}
                value={formatPercent(pageMetrics.streamRate)}
                percent={pageMetrics.streamRate}
                tone='teal'
              />
            </div>
          </Panel>
        </aside>

        <div className='command-core-shell'>
          <div className='command-core-glass' aria-hidden='true' />
          <svg
            className='command-core-frame'
            viewBox='0 0 1800 1100'
            preserveAspectRatio='none'
            aria-hidden='true'
          >
            <path
              className='command-core-frame-outer'
              vectorEffect='non-scaling-stroke'
              d='M52 10 Q900 164 1748 10 C1778 16 1792 38 1794 70 C1804 390 1804 750 1775 1050 C1772 1078 1750 1092 1719 1094 Q900 990 81 1094 C50 1092 28 1078 25 1050 C-4 750 -4 390 6 70 C8 38 22 16 52 10 Z'
            />
            <path
              className='command-core-frame-inner'
              vectorEffect='non-scaling-stroke'
              d='M67 28 Q900 158 1733 28 C1756 33 1767 50 1769 79 C1778 393 1778 744 1751 1038 C1749 1060 1732 1071 1706 1074 Q900 981 94 1074 C68 1071 51 1060 49 1038 C22 744 22 393 31 79 C33 50 44 33 67 28 Z'
            />
            <path
              className='command-core-frame-fold'
              vectorEffect='non-scaling-stroke'
              d='M67 28 L113 50 L245 61 L278 84 L366 91 M1733 28 L1687 50 L1555 61 L1522 84 L1434 91 M94 1074 L151 1049 L315 1035 M1706 1074 L1649 1049 L1485 1035'
            />
          </svg>
          <section className='command-core'>
            <div className='command-core-corners' aria-hidden='true' />
            <div className='command-kpi-grid'>
              {kpis.map((kpi) => (
                <KpiCard key={kpi.label} {...kpi} />
              ))}
            </div>
            <div className='command-log-console'>{props.children}</div>
          </section>
        </div>

        <aside className='command-rail command-rail-right'>
          <Panel
            title={t('Request Trend')}
            icon={Activity}
            className='command-trend-panel'
            actions={
              <TrendReadout
                label={requestPoint?.label ?? '—'}
                value={Number(requestPoint?.requests || 0).toLocaleString()}
                tone='teal'
                isLive={requestPointIndex == null}
                liveLabel={t('Latest')}
              />
            }
          >
            <div className='command-trend-legend'>
              <span>
                <i className='is-cyan' />
                {t('Requests')}
              </span>
            </div>
            <div className='command-chart'>
              <ResponsiveContainer width='100%' height='100%'>
                <LineChart
                  data={trendData}
                  margin={{ top: 10, right: 10, bottom: 2, left: 0 }}
                  onMouseMove={(state) =>
                    setRequestPointIndex(
                      getActivePointIndex(state?.activeTooltipIndex)
                    )
                  }
                  onMouseLeave={() => setRequestPointIndex(null)}
                >
                  <CartesianGrid
                    stroke='rgba(56, 140, 218, 0.13)'
                    vertical={false}
                  />
                  <XAxis
                    dataKey='label'
                    tick={{
                      fill: '#6289b2',
                      fontSize: 'var(--command-axis-font-size)',
                    }}
                    tickLine={false}
                    axisLine={false}
                    interval={timeAxisInterval}
                    minTickGap={0}
                    tickMargin={6}
                    angle={timeAxisAngle}
                    textAnchor={timeAxisAnchor}
                    height={timeAxisHeight}
                    padding={{ left: 5, right: 5 }}
                  />
                  <YAxis
                    tick={{
                      fill: '#6289b2',
                      fontSize: 'var(--command-axis-font-size)',
                    }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    width={34}
                    tickCount={4}
                    tickFormatter={formatAxisNumber}
                    domain={requestsDomain}
                  />
                  <ChartTooltip
                    content={() => null}
                    cursor={{ stroke: '#1bc9bf', strokeOpacity: 0.42 }}
                  />
                  <Line
                    type='monotone'
                    dataKey='requests'
                    name={t('Requests')}
                    stroke='#19a9ff'
                    strokeWidth={2.5}
                    dot={{
                      r: 2.5,
                      fill: '#061a35',
                      stroke: '#19a9ff',
                      strokeWidth: 1.6,
                    }}
                    activeDot={{ r: 4, fill: '#9be8df', strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel
            title={t('Tokens Trend')}
            icon={Sparkles}
            className='command-tokens-panel'
            actions={
              <TrendReadout
                label={tokenPoint?.label ?? '—'}
                value={formatCompactNumber(tokenPoint?.tokens ?? 0)}
                tone='violet'
                isLive={tokenPointIndex == null}
                liveLabel={t('Latest')}
              />
            }
          >
            <div className='command-trend-value'>
              <span>{t('Tokens per minute')}</span>
              <strong>{formatCompactNumber(liveStats.tpm || 0)}</strong>
              <em>/min</em>
            </div>
            <div className='command-chart command-chart-compact'>
              <ResponsiveContainer width='100%' height='100%'>
                <AreaChart
                  data={trendData}
                  margin={{ top: 10, right: 10, bottom: 2, left: 0 }}
                  onMouseMove={(state) =>
                    setTokenPointIndex(
                      getActivePointIndex(state?.activeTooltipIndex)
                    )
                  }
                  onMouseLeave={() => setTokenPointIndex(null)}
                >
                  <CartesianGrid
                    stroke='rgba(79, 104, 234, 0.13)'
                    vertical={false}
                  />
                  <XAxis
                    dataKey='label'
                    tick={{
                      fill: '#6289b2',
                      fontSize: 'var(--command-axis-font-size)',
                    }}
                    tickLine={false}
                    axisLine={false}
                    interval={timeAxisInterval}
                    minTickGap={0}
                    tickMargin={6}
                    angle={timeAxisAngle}
                    textAnchor={timeAxisAnchor}
                    height={timeAxisHeight}
                    padding={{ left: 5, right: 5 }}
                  />
                  <YAxis
                    tick={{
                      fill: '#6289b2',
                      fontSize: 'var(--command-axis-font-size)',
                    }}
                    tickLine={false}
                    axisLine={false}
                    width={38}
                    tickCount={4}
                    tickFormatter={formatAxisNumber}
                    domain={tokensDomain}
                  />
                  <ChartTooltip
                    content={() => null}
                    cursor={{ stroke: '#7662ff', strokeOpacity: 0.42 }}
                  />
                  <Area
                    type='monotone'
                    dataKey='tokens'
                    name='Tokens'
                    stroke='#7662ff'
                    fill='#6d4eff'
                    fillOpacity={0.3}
                    strokeWidth={2.4}
                    dot={{
                      r: 2.3,
                      fill: '#071731',
                      stroke: '#8a78ff',
                      strokeWidth: 1.5,
                    }}
                    activeDot={{ r: 3.6, fill: '#b8aaff', strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel
            title={t('Cost Trend')}
            icon={CircleDollarSign}
            className='command-cost-panel'
            actions={
              <TrendReadout
                label={costPoint?.label ?? '—'}
                value={
                  sensitiveVisible
                    ? formatLogQuota(costPoint?.quota ?? 0)
                    : '••••'
                }
                tone='magenta'
                isLive={costPointIndex == null}
                liveLabel={t('Latest')}
              />
            }
          >
            <div className='command-trend-value'>
              <span>{t('Selected time range')}</span>
              <strong>
                {sensitiveVisible ? formatLogQuota(totals.totalQuota) : '••••'}
              </strong>
            </div>
            <div className='command-chart command-chart-compact'>
              <ResponsiveContainer width='100%' height='100%'>
                <AreaChart
                  data={trendData}
                  margin={{ top: 10, right: 10, bottom: 2, left: 0 }}
                  onMouseMove={(state) =>
                    setCostPointIndex(
                      getActivePointIndex(state?.activeTooltipIndex)
                    )
                  }
                  onMouseLeave={() => setCostPointIndex(null)}
                >
                  <CartesianGrid
                    stroke='rgba(122, 88, 255, 0.13)'
                    vertical={false}
                  />
                  <XAxis
                    dataKey='label'
                    tick={{
                      fill: '#6289b2',
                      fontSize: 'var(--command-axis-font-size)',
                    }}
                    tickLine={false}
                    axisLine={false}
                    interval={timeAxisInterval}
                    minTickGap={0}
                    tickMargin={6}
                    angle={timeAxisAngle}
                    textAnchor={timeAxisAnchor}
                    height={timeAxisHeight}
                    padding={{ left: 5, right: 5 }}
                  />
                  <YAxis
                    tick={{
                      fill: '#6289b2',
                      fontSize: 'var(--command-axis-font-size)',
                    }}
                    tickLine={false}
                    axisLine={false}
                    width={42}
                    tickCount={4}
                    tickFormatter={formatAxisQuota}
                    domain={quotaDomain}
                  />
                  <ChartTooltip
                    content={() => null}
                    cursor={{ stroke: '#9a5cff', strokeOpacity: 0.42 }}
                  />
                  <Area
                    type='monotone'
                    dataKey='quota'
                    name={t('Cost')}
                    stroke='#9a5cff'
                    fill='#7545ef'
                    fillOpacity={0.29}
                    strokeWidth={2.4}
                    dot={{
                      r: 2.3,
                      fill: '#071731',
                      stroke: '#ad78ff',
                      strokeWidth: 1.5,
                    }}
                    activeDot={{ r: 3.6, fill: '#d1adff', strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </aside>
      </div>

      <div className='command-deck' aria-hidden='true'>
        <span className='command-deck-beam' />
        <span className='command-deck-glow' />
        <span className='command-deck-body' />
        <span className='command-deck-rim' />
        <span className='command-deck-arc command-deck-arc-outer' />
        <span className='command-deck-arc command-deck-arc-inner' />
        <span className='command-deck-mark command-deck-mark-a' />
        <span className='command-deck-mark command-deck-mark-b' />
        <span className='command-deck-core' />
      </div>
    </div>
  )
}
