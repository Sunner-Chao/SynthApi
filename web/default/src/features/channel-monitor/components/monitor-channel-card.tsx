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
import { Link } from '@tanstack/react-router'
import {
  Activity,
  BookOpen,
  Clock3,
  HeartPulse,
  KeyRound,
  RadioTower,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import type { ChannelMonitorItem } from '@/features/dashboard/types'
import {
  getAvailabilityRate,
  getUsageSuccessRate,
  hasUsageMetrics,
} from '../lib/metrics'
import {
  SuccessRateStrip,
  successRateColorClass,
  successRateIntent,
  successRateSurfaceClass,
  successRateTextClass,
  formatSuccessRate,
} from './success-rate-strip'

const CHANNEL_STATUS = {
  ENABLED: 1,
  MANUAL_DISABLED: 2,
  AUTO_DISABLED: 3,
} as const

function formatLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '-'
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '-'
  const diffSeconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp))
  if (diffSeconds < 60) return `${diffSeconds}s ago`
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`
  return `${Math.floor(diffSeconds / 86400)}d ago`
}

function getTypeColor(typeId: number): string {
  // Return a deterministic tailwind-compatible gradient based on type
  const colors: string[] = [
    'from-violet-50 to-violet-100 dark:from-violet-500/10 dark:to-violet-500/20 text-violet-600 dark:text-violet-300',
    'from-emerald-50 to-emerald-100 dark:from-emerald-500/10 dark:to-emerald-500/20 text-emerald-600 dark:text-emerald-300',
    'from-orange-50 to-amber-100 dark:from-orange-500/10 dark:to-amber-500/20 text-orange-600 dark:text-orange-300',
    'from-sky-50 to-indigo-100 dark:from-sky-500/10 dark:to-indigo-500/20 text-sky-600 dark:text-sky-300',
    'from-rose-50 to-pink-100 dark:from-rose-500/10 dark:to-pink-500/20 text-rose-600 dark:text-rose-300',
    'from-teal-50 to-cyan-100 dark:from-teal-500/10 dark:to-cyan-500/20 text-teal-600 dark:text-teal-300',
    'from-yellow-50 to-amber-100 dark:from-yellow-500/10 dark:to-amber-500/20 text-yellow-700 dark:text-yellow-300',
    'from-blue-50 to-indigo-100 dark:from-blue-500/10 dark:to-indigo-500/20 text-blue-600 dark:text-blue-300',
  ]
  return colors[Math.abs(typeId) % colors.length]
}

function statusMeta(status: number, t: (key: string) => string) {
  if (status === CHANNEL_STATUS.ENABLED) {
    return {
      label: t('Available'),
      badge: 'success' as const,
      dot: 'bg-emerald-500',
      latencyClass: 'text-emerald-600 dark:text-emerald-400',
    }
  }
  if (status === CHANNEL_STATUS.AUTO_DISABLED) {
    return {
      label: t('Auto disabled'),
      badge: 'warning' as const,
      dot: 'bg-amber-500',
      latencyClass: 'text-amber-600 dark:text-amber-400',
    }
  }
  return {
    label: t('Manual disabled'),
    badge: 'neutral' as const,
    dot: 'bg-muted-foreground',
    latencyClass: 'text-muted-foreground',
  }
}

function GroupIcon({ name }: { name: string }) {
  const colorClass = getTypeColor(name.length)
  const initial = name?.[0]?.toUpperCase() ?? '#'
  return (
    <span
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-black/5 dark:ring-white/10',
        'bg-gradient-to-br',
        colorClass
      )}
      aria-hidden='true'
    >
      <span className='text-sm leading-none font-bold'>{initial}</span>
    </span>
  )
}

interface MetricBoxProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  valueClass?: string
}

function MetricBox({ icon: Icon, label, value, valueClass }: MetricBoxProps) {
  return (
    <div className='rounded-xl border border-gray-100 bg-gray-50/80 p-3 dark:border-white/5 dark:bg-white/5'>
      <div className='flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-gray-400 uppercase dark:text-gray-500'>
        <Icon className='size-3 shrink-0' aria-hidden='true' />
        <span className='truncate'>{label}</span>
      </div>
      <div
        className={cn(
          'mt-1.5 font-mono text-lg leading-none font-bold text-gray-900 tabular-nums dark:text-gray-100',
          valueClass
        )}
      >
        {value}
      </div>
    </div>
  )
}

function successStatusLabel(
  intent: 'danger' | 'warning' | 'success',
  t: (key: string) => string
) {
  if (intent === 'success') return t('Healthy')
  if (intent === 'warning') return t('Watch')
  return t('Degraded')
}

function SuccessRateStatCard(props: { item: ChannelMonitorItem }) {
  const { t } = useTranslation()
  const hasUsage = hasUsageMetrics(props.item)
  const usageRate = getUsageSuccessRate(props.item)
  const availabilityRate = getAvailabilityRate(props.item)
  const displayRate = hasUsage ? usageRate : availabilityRate
  const intent = successRateIntent(displayRate)
  const statusColor = successRateColorClass(displayRate)
  const hint = hasUsage
    ? t('{{success}}/{{total}} successful requests in the last 24 hours', {
        success: props.item.usage_success_count ?? 0,
        total: props.item.usage_request_count ?? 0,
      })
    : t('No 24h usage data; availability {{rate}}', {
        rate: formatSuccessRate(availabilityRate),
      })

  return (
    <div
      className={cn(
        'mt-4 flex flex-col gap-2 rounded-lg border p-3',
        hasUsage
          ? successRateSurfaceClass(displayRate)
          : 'border-border bg-muted/30'
      )}
    >
      <div className='flex min-w-0 items-center justify-between gap-3'>
        <span className='text-muted-foreground inline-flex items-center gap-1.5 text-[10px] font-medium tracking-wider uppercase'>
          <HeartPulse className='size-3' aria-hidden='true' />
          {t('24h usage success rate')}
        </span>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
            hasUsage &&
              intent === 'success' &&
              'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
            hasUsage &&
              intent === 'warning' &&
              'bg-amber-500/10 text-amber-700 dark:text-amber-300',
            hasUsage &&
              intent === 'danger' &&
              'bg-rose-500/10 text-rose-700 dark:text-rose-300',
            !hasUsage && 'bg-muted text-muted-foreground'
          )}
        >
          <span
            className={cn(
              'size-1.5 rounded-full',
              hasUsage ? statusColor : 'bg-muted-foreground/50'
            )}
          />
          {hasUsage ? successStatusLabel(intent, t) : t('No data')}
        </span>
      </div>
      <SuccessRateStrip
        rate={usageRate}
        source={hasUsage ? 'usage' : 'availability'}
        series={props.item.success_series}
        availabilityRate={availabilityRate}
        enabledCount={props.item.enabled_count}
        totalCount={props.item.channel_count}
        emptyLabel={t('No data')}
      />
      <div className='flex min-w-0 items-center justify-between gap-2'>
        <span className='text-muted-foreground/70 truncate text-[11px]'>
          {hint}
        </span>
      </div>
    </div>
  )
}

export interface MonitorChannelCardProps {
  item: ChannelMonitorItem
}

export function MonitorChannelCard({ item }: MonitorChannelCardProps) {
  const { t } = useTranslation()
  const meta = statusMeta(item.status, t)
  const groupName = item.group || item.name
  const channelCount = item.channel_count ?? 0
  const enabledCount = item.enabled_count ?? 0
  const availabilityRate = getAvailabilityRate(item)

  return (
    <div className='group flex flex-col rounded-2xl border border-gray-200/80 bg-white/70 p-5 shadow-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20'>
      {/* Header */}
      <div className='flex items-start gap-3'>
        <GroupIcon name={groupName} />
        <div className='min-w-0 flex-1'>
          <div className='flex min-w-0 items-center gap-1.5'>
            <span
              className={cn('size-2 shrink-0 rounded-full', meta.dot)}
              aria-hidden='true'
            />
            <span className='truncate text-sm font-semibold text-gray-900 dark:text-gray-100'>
              {groupName}
            </span>
          </div>
          <div className='mt-0.5 flex flex-wrap items-center gap-1'>
            <StatusBadge
              label={t('{{count}} channel(s)', { count: channelCount })}
              variant='neutral'
              size='sm'
              copyable={false}
              showDot={false}
            />
            <span className='inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300'>
              {t('{{enabled}} available', { enabled: enabledCount })}
            </span>
          </div>
        </div>
        <StatusBadge
          label={meta.label}
          variant={meta.badge}
          size='sm'
          copyable={false}
          showDot={false}
          className='shrink-0'
        />
      </div>

      <SuccessRateStatCard item={item} />

      {/* Metrics */}
      <div className='mt-4 grid grid-cols-2 gap-2'>
        <MetricBox
          icon={Activity}
          label={t('Latency')}
          value={formatLatency(item.response_time)}
          valueClass={meta.latencyClass}
        />
        <MetricBox
          icon={BookOpen}
          label={t('Models')}
          value={String(item.model_count)}
        />
        <MetricBox
          icon={RadioTower}
          label={t('Available')}
          value={`${enabledCount}/${channelCount}`}
          valueClass={successRateTextClass(availabilityRate)}
        />
        <MetricBox
          icon={Users}
          label={t('Active users')}
          value={String(item.active_users ?? 0)}
        />
      </div>

      {/* Footer */}
      <div className='mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-white/5'>
        <div className='min-w-0'>
          <div className='flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500'>
            <Clock3 className='size-3' aria-hidden='true' />
            <span className='font-mono'>
              {formatRelativeTime(item.test_time)}
            </span>
          </div>
          <div className='mt-1 flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500'>
            <Users className='size-3' aria-hidden='true' />
            <span
              className={cn(
                'font-mono font-semibold',
                (item.active_users ?? 0) > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : ''
              )}
            >
              {item.active_users ?? 0}
            </span>
            <span>{t('active')}</span>
          </div>
        </div>
        <Button
          size='sm'
          variant='outline'
          className='ml-auto'
          render={
            <Link to='/keys' search={{ create: true, group: groupName }} />
          }
        >
          <KeyRound className='size-3.5' aria-hidden='true' />
          {t('Create API Key')}
        </Button>
      </div>
    </div>
  )
}
