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
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { getRequestResponseColor } from '@/lib/request-duration-colors'

export type SuccessRateSource = 'usage' | 'availability'

export type SuccessRateSeriesPoint = {
  ts: number
  success_rate: number
  request_count?: number
  success_count?: number
}

export type RecentRequestStatus = {
  ts: number
  success: boolean
  latency_ms?: number
  output_tokens?: number
  generation_ms?: number
  throughput_available?: boolean
}

function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 0
  return Math.max(0, Math.min(100, rate))
}

export function formatSuccessRate(rate: number): string {
  if (!Number.isFinite(rate)) return '-'
  return `${rate.toFixed(rate >= 99.95 ? 0 : 1)}%`
}

export function successRateColorClass(rate: number): string {
  if (rate >= 99.9) return 'bg-emerald-500'
  if (rate >= 99) return 'bg-emerald-400'
  if (rate >= 95) return 'bg-amber-500'
  if (rate >= 90) return 'bg-amber-600'
  return 'bg-rose-500'
}

export function successRateHeightClass(rate: number): string {
  if (rate >= 99.9) return 'h-full'
  if (rate >= 99) return 'h-[88%]'
  if (rate >= 95) return 'h-[72%]'
  if (rate >= 90) return 'h-[55%]'
  return 'h-[40%]'
}

export function successRateTextClass(rate: number): string {
  if (!Number.isFinite(rate)) return 'text-muted-foreground'
  if (rate >= 99.9) return 'text-emerald-600 dark:text-emerald-400'
  if (rate >= 99) return 'text-emerald-600 dark:text-emerald-400'
  if (rate >= 95) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

export function successRateSurfaceClass(rate: number): string {
  if (rate >= 99) {
    return 'border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-500/20 dark:bg-emerald-500/10'
  }
  if (rate >= 95) {
    return 'border-amber-200/80 bg-amber-50/70 dark:border-amber-500/25 dark:bg-amber-500/10'
  }
  return 'border-rose-200/80 bg-rose-50/70 dark:border-rose-500/25 dark:bg-rose-500/10'
}

export function successRateIntent(
  rate: number
): 'danger' | 'warning' | 'success' {
  if (rate >= 99) return 'success'
  if (rate >= 95) return 'warning'
  return 'danger'
}

function recentRequestColorClass(request: RecentRequestStatus): string {
  if (!request.success) return 'bg-rose-500 dark:bg-rose-400'
  const outputTokens = request.output_tokens ?? 0
  const generationMs = request.generation_ms ?? 0
  const tokensPerSecond =
    request.throughput_available && outputTokens > 0 && generationMs > 0
      ? (outputTokens * 1000) / generationMs
      : null
  const responseColor = getRequestResponseColor(
    (request.latency_ms ?? 0) / 1000,
    outputTokens,
    tokensPerSecond
  )
  if (responseColor === 'danger') {
    return 'bg-rose-500 dark:bg-rose-400'
  }
  if (responseColor === 'warning') {
    return 'bg-amber-400 dark:bg-amber-300'
  }
  return 'bg-emerald-500 dark:bg-emerald-400'
}

function compactSeries(
  series: SuccessRateSeriesPoint[] | undefined,
  bucketCount: number
): (number | null)[] {
  const values = (series ?? [])
    .filter((point) => (point.request_count ?? 1) > 0)
    .map((point) => clampRate(point.success_rate))
    .slice(-bucketCount)
  if (values.length >= bucketCount) return values
  return [
    ...Array.from({ length: bucketCount - values.length }, () => null),
    ...values,
  ]
}

export function SuccessRateStrip(props: {
  rate: number
  source?: SuccessRateSource
  series?: SuccessRateSeriesPoint[]
  enabledCount?: number
  totalCount?: number
  availabilityRate?: number
  size?: 'sm' | 'md'
  showValue?: boolean
  emptyLabel?: string
  className?: string
}) {
  const size = props.size ?? 'md'
  const showValue = props.showValue ?? true
  const source = props.source ?? 'usage'
  const hasUsageSeries =
    source === 'usage' &&
    (props.series ?? []).some((point) => (point.request_count ?? 1) > 0)
  const hasUsage =
    source === 'usage' && (hasUsageSeries || Number.isFinite(props.rate))
  const rate = clampRate(
    hasUsage ? props.rate : (props.availabilityRate ?? props.rate)
  )
  const bucketCount = size === 'sm' ? 30 : 30
  const containerHeight = size === 'sm' ? 'h-3.5' : 'h-5'
  const barWidth = size === 'sm' ? 'w-[3px]' : 'w-1'
  const gap = size === 'sm' ? 'gap-px' : 'gap-[2px]'
  const seriesBuckets = compactSeries(props.series, bucketCount)
  const hasChannelBreakdown =
    typeof props.enabledCount === 'number' &&
    typeof props.totalCount === 'number' &&
    props.totalCount > 0
  let enabledBuckets = bucketCount
  if (hasChannelBreakdown) {
    const enabledCount = Math.max(0, props.enabledCount ?? 0)
    const totalCount = Math.max(1, props.totalCount ?? 1)
    enabledBuckets = Math.round((bucketCount * enabledCount) / totalCount)
    if (enabledCount > 0) {
      enabledBuckets = Math.max(1, enabledBuckets)
    }
    if (enabledCount < totalCount) {
      enabledBuckets = Math.min(bucketCount - 1, enabledBuckets)
    }
  }

  return (
    <div className={cn('flex min-w-0 items-center gap-2', props.className)}>
      <div
        className={cn('flex shrink-0 items-end', containerHeight, gap)}
        role='img'
        aria-label={
          hasUsage
            ? `24h usage success rate ${formatSuccessRate(rate)}`
            : `no 24h usage data, availability ${formatSuccessRate(rate)}`
        }
      >
        {Array.from({ length: bucketCount }).map((_, index) => {
          const usageRate = seriesBuckets[index]
          const isEnabledBucket = index < enabledBuckets
          const bucketRate = hasUsage
            ? hasUsageSeries
              ? usageRate
              : rate
            : isEnabledBucket
              ? rate
              : null
          return (
            <span
              key={index}
              className={cn(
                'flex items-end rounded-sm transition-opacity hover:opacity-80',
                barWidth,
                containerHeight
              )}
              aria-hidden='true'
            >
              <span
                className={cn(
                  'w-full rounded-sm',
                  bucketRate == null
                    ? 'bg-muted-foreground/20 h-[40%]'
                    : cn(
                        successRateColorClass(bucketRate),
                        successRateHeightClass(bucketRate)
                      )
                )}
              />
            </span>
          )
        })}
      </div>
      {showValue && (
        <span
          className={cn(
            'font-mono text-sm font-semibold tabular-nums',
            hasUsage ? successRateTextClass(rate) : 'text-muted-foreground'
          )}
        >
          {hasUsage ? formatSuccessRate(rate) : (props.emptyLabel ?? '—')}
        </span>
      )}
    </div>
  )
}

// The backend keeps 60 requests for recovery and API consumers. The compact
// card/table view shows the newest 30 so every equal-width slot fits without
// forcing the monitor layout to scroll horizontally.
const DISPLAY_RECENT_REQUEST_COUNT = 30

export function RecentRequestStrip(props: {
  requests?: RecentRequestStatus[]
  emptyLabel?: string
  className?: string
}) {
  const { t } = useTranslation()
  const requests = (props.requests ?? []).slice(-DISPLAY_RECENT_REQUEST_COUNT)
  const slots = [
    ...Array.from(
      { length: Math.max(0, DISPLAY_RECENT_REQUEST_COUNT - requests.length) },
      () => null
    ),
    ...requests,
  ]
  const successCount = requests.filter((request) => request.success).length
  const rate = requests.length > 0 ? (successCount / requests.length) * 100 : 0

  return (
    <div className={cn('min-w-0 overflow-x-auto', props.className)}>
      <div
        className='grid h-9 min-w-[360px] grid-cols-[repeat(30,minmax(6px,1fr))] items-stretch gap-[3px]'
        role='img'
        aria-label={
          requests.length > 0
            ? t('{{success}}/{{total}} recent requests successful', {
                success: successCount,
                total: requests.length,
              })
            : (props.emptyLabel ?? 'No recent requests')
        }
      >
        {slots.map((request, index) => {
          const time = request?.ts
            ? new Date(request.ts * 1000).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })
            : ''
          const latency =
            request?.latency_ms && request.latency_ms > 0
              ? ` · ${request.latency_ms}ms`
              : ''
          const label = request
            ? `${t(request.success ? 'Success' : 'Failed')} · ${time}${latency}`
            : (props.emptyLabel ?? t('No request'))
          return (
            <span
              key={`${request?.ts ?? 'empty'}-${index}`}
              title={label}
              aria-label={label}
              className={cn(
                'min-w-0 flex-1 rounded-[3px] transition-transform hover:scale-y-110',
                request == null
                  ? 'bg-slate-200/80 dark:bg-white/10'
                  : recentRequestColorClass(request)
              )}
            />
          )
        })}
      </div>
      <div className='mt-1.5 flex items-center justify-between gap-2 text-[10px] font-medium tracking-[0.14em] text-slate-400 uppercase dark:text-slate-500'>
        <span>{t('Past')}</span>
        <span className='font-mono tracking-normal normal-case'>
          {requests.length > 0 ? `${rate.toFixed(2)}%` : '--'}
        </span>
        <span>{t('Now')}</span>
      </div>
    </div>
  )
}
