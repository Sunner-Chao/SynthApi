/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

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
  Globe2,
  KeyRound,
  Layers3,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { ChannelMonitorItem } from '@/features/dashboard/types'
import { RecentRequestStrip, successRateTextClass } from './success-rate-strip'

const CHANNEL_STATUS = {
  ENABLED: 1,
  MANUAL_DISABLED: 2,
  AUTO_DISABLED: 3,
} as const

function formatLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '--'
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '--'
  const diffSeconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp))
  if (diffSeconds < 60) return `${diffSeconds}s`
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m`
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h`
  return `${Math.floor(diffSeconds / 86400)}d`
}

function statusMeta(status: number, t: (key: string) => string) {
  if (status === CHANNEL_STATUS.ENABLED) {
    return {
      label: t('Available'),
      dot: 'bg-emerald-500',
      pill: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
      value: 'text-emerald-600 dark:text-emerald-400',
    }
  }
  if (status === CHANNEL_STATUS.AUTO_DISABLED) {
    return {
      label: t('Auto disabled'),
      dot: 'bg-amber-500',
      pill: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
      value: 'text-amber-600 dark:text-amber-400',
    }
  }
  return {
    label: t('Manual disabled'),
    dot: 'bg-slate-400',
    pill: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
    value: 'text-slate-500 dark:text-slate-400',
  }
}

function GroupIcon({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '#'
  return (
    <span
      className='flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-emerald-100 text-emerald-600 ring-1 ring-emerald-200/70 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/20'
      aria-hidden='true'
    >
      <span className='text-base leading-none font-bold'>{initial}</span>
    </span>
  )
}

function MetricBox({
  icon: Icon,
  label,
  value,
  valueClass,
}: {
  icon: LucideIcon
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className='rounded-[17px] border border-slate-200/70 bg-white/55 px-4 py-4 dark:border-white/10 dark:bg-white/[0.035]'>
      <div className='flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.05em] text-slate-400 dark:text-slate-500'>
        <Icon className='size-3.5 shrink-0' aria-hidden='true' />
        <span className='truncate'>{label}</span>
      </div>
      <div
        className={cn(
          'mt-3 flex items-baseline gap-1 font-mono text-[22px] leading-none font-bold tracking-tight text-slate-800 tabular-nums dark:text-slate-100',
          valueClass
        )}
      >
        {value}
      </div>
    </div>
  )
}

function recentRate(item: ChannelMonitorItem): number | null {
  const requests = item.recent_requests ?? []
  if (requests.length > 0) {
    return (
      (requests.filter((request) => request.success).length / requests.length) *
      100
    )
  }
  if (
    item.success_rate_source === 'usage' &&
    Number.isFinite(item.success_rate)
  ) {
    return item.success_rate ?? null
  }
  if (Number.isFinite(item.availability_rate)) {
    return item.availability_rate ?? null
  }
  return null
}

function formatAvailability(rate: number | null): string {
  if (rate == null || !Number.isFinite(rate)) return '--'
  return `${rate.toFixed(2)}%`
}

export interface MonitorChannelCardProps {
  item: ChannelMonitorItem
  refreshRemainingSeconds?: number
}

/** A group card intentionally mirrors the compact monitoring reference UI. */
export function MonitorChannelCard({
  item,
  refreshRemainingSeconds,
}: MonitorChannelCardProps) {
  const { t } = useTranslation()
  const meta = statusMeta(item.status, t)
  const groupName = item.group || item.name || t('Unnamed group')
  const channelCount = item.channel_count ?? 0
  const enabledCount = item.enabled_count ?? 0
  const modelCount = item.model_count ?? 0
  const availability = recentRate(item)
  const refreshLabel =
    refreshRemainingSeconds == null
      ? null
      : `${refreshRemainingSeconds}s ${t('Auto refresh')}`

  return (
    <article className='group relative flex min-h-[372px] flex-col overflow-hidden rounded-[23px] border border-slate-200/80 bg-[#f8fcfb] p-6 shadow-[0_8px_28px_rgba(40,92,86,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_14px_34px_rgba(40,92,86,0.12)] dark:border-white/10 dark:bg-slate-950/45 dark:shadow-none dark:hover:border-emerald-400/25'>
      <header className='flex min-w-0 items-start gap-3'>
        <GroupIcon name={groupName} />
        <div className='min-w-0 flex-1'>
          <h3 className='truncate text-[19px] leading-tight font-bold tracking-tight text-slate-800 dark:text-slate-100'>
            {groupName}
          </h3>
          <div className='mt-2 flex min-w-0 flex-wrap items-center gap-1.5 text-xs'>
            <span className='rounded-lg bg-emerald-100 px-2 py-1 font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'>
              {item.type_name || t('Group')}
            </span>
            <span className='truncate font-mono text-slate-400 dark:text-slate-500'>
              {t('All models')}
            </span>
            <span className='max-w-full truncate rounded-lg bg-slate-100 px-2 py-1 text-slate-500 dark:bg-white/10 dark:text-slate-300'>
              {t('{{count}} models', { count: modelCount })}
            </span>
          </div>
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold',
            meta.pill
          )}
        >
          <span className={cn('size-1.5 rounded-full', meta.dot)} />
          {meta.label}
        </span>
      </header>

      <div className='mt-7 grid grid-cols-2 gap-3'>
        <MetricBox
          icon={Zap}
          label={t('Latency')}
          value={formatLatency(item.response_time)}
          valueClass={meta.value}
        />
        <MetricBox
          icon={Globe2}
          label={t('Endpoint PING')}
          value={formatLatency(item.response_time)}
          valueClass={meta.value}
        />
      </div>

      <div className='my-6 h-px shrink-0 bg-slate-200/70 dark:bg-white/10' />

      <div className='flex items-end justify-between gap-3'>
        <div className='flex min-w-0 items-center gap-2 text-sm font-medium text-slate-400 dark:text-slate-500'>
          <Activity className='size-4 shrink-0' aria-hidden='true' />
          <span className='truncate'>{t('Availability')} · 24h</span>
        </div>
        <div
          className={cn(
            'shrink-0 font-mono text-[40px] leading-[0.9] font-bold tracking-[-0.04em] tabular-nums',
            availability == null
              ? 'text-slate-400 dark:text-slate-500'
              : successRateTextClass(availability)
          )}
        >
          {formatAvailability(availability)}
        </div>
      </div>

      <div className='mt-6 flex min-w-0 items-center justify-between gap-3'>
        <span className='truncate text-sm font-semibold tracking-[0.04em] text-slate-400 dark:text-slate-500'>
          {t('Recent requests')}
        </span>
        <span className='shrink-0 font-mono text-sm font-semibold tabular-nums text-slate-400 dark:text-slate-500'>
          {refreshLabel ??
            `${t('Last checked')} ${formatRelativeTime(item.test_time)}`}
        </span>
      </div>
      <RecentRequestStrip
        requests={item.recent_requests}
        emptyLabel={t('No recent requests')}
        className='mt-3'
      />

      <footer className='mt-auto flex items-center justify-between gap-3 pt-4 text-xs text-slate-400 dark:text-slate-500'>
        <div className='flex min-w-0 items-center gap-3'>
          <span className='inline-flex items-center gap-1.5 truncate'>
            <Layers3 className='size-3.5' aria-hidden='true' />
            {enabledCount}/{channelCount} {t('Available').toLowerCase()}
          </span>
          <span className='inline-flex items-center gap-1.5 truncate'>
            <Users className='size-3.5' aria-hidden='true' />
            {item.active_users ?? 0}
          </span>
        </div>
        <Button
          size='sm'
          variant='ghost'
          className='h-7 shrink-0 px-2 text-xs opacity-70 transition-opacity group-hover:opacity-100'
          aria-label={t('Create API Key')}
          render={
            <Link to='/keys' search={{ create: true, group: groupName }} />
          }
        >
          <KeyRound className='size-3.5' aria-hidden='true' />
          <span className='hidden sm:inline'>{t('Create API Key')}</span>
        </Button>
      </footer>
    </article>
  )
}
