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
import { useQuery } from '@tanstack/react-query'
import { Activity, CircleAlert, CircleCheck, Clock3, Route } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/status-badge'
import { getChannelMonitor } from '../../api'
import type { ChannelMonitorItem } from '../../types'

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

function formatTestTime(timestamp: number): string {
  if (!timestamp) return '-'
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
      dot: 'bg-success',
      badge: 'success' as const,
      text: 'text-success',
    }
  }
  if (status === CHANNEL_STATUS.AUTO_DISABLED) {
    return {
      label: t('Auto disabled'),
      dot: 'bg-destructive',
      badge: 'warning' as const,
      text: 'text-destructive',
    }
  }
  return {
    label: t('Manual disabled'),
    dot: 'bg-muted-foreground',
    badge: 'neutral' as const,
    text: 'text-muted-foreground',
  }
}

export function ChannelMonitorPanel() {
  const { t } = useTranslation()
  const monitorQuery = useQuery({
    queryKey: ['dashboard', 'channel-monitor'],
    queryFn: getChannelMonitor,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    retry: false,
  })

  const summary = monitorQuery.data?.data?.summary
  const items = monitorQuery.data?.data?.items ?? []
  const loading = monitorQuery.isLoading
  const enabledRate =
    summary && summary.total > 0
      ? Math.round((summary.enabled / summary.total) * 1000) / 10
      : 0

  return (
    <section className='bg-card h-full overflow-hidden rounded-2xl border shadow-xs'>
      <div className='flex items-center gap-2 border-b px-4 py-3 sm:px-5'>
        <Route
          className='text-muted-foreground/60 size-4 shrink-0'
          aria-hidden='true'
        />
        <h3 className='text-sm font-semibold'>{t('Channel monitor')}</h3>
        <span className='text-muted-foreground hidden text-xs sm:inline'>
          {t('Live status of upstream channels')}
        </span>
        <Button
          variant='outline'
          size='sm'
          className='ml-auto h-7 px-2 text-xs'
          render={<Link to='/channels' />}
        >
          {t('Manage')}
        </Button>
      </div>

      <div className='space-y-3 p-4 sm:p-5'>
        <div className='grid grid-cols-3 gap-2'>
          <MonitorMetric
            icon={CircleCheck}
            label={t('Available')}
            value={
              loading ? '' : `${summary?.enabled ?? 0}/${summary?.total ?? 0}`
            }
            loading={loading}
            valueClassName='text-success'
          />
          <MonitorMetric
            icon={Activity}
            label={t('Availability')}
            value={loading ? '' : `${enabledRate}%`}
            loading={loading}
          />
          <MonitorMetric
            icon={CircleAlert}
            label={t('Exceptions')}
            value={
              loading
                ? ''
                : String(
                    (summary?.auto_disabled ?? 0) +
                      (summary?.manual_disabled ?? 0)
                  )
            }
            loading={loading}
            valueClassName={
              summary &&
              summary.auto_disabled + summary.manual_disabled > 0
                ? 'text-destructive'
                : 'text-success'
            }
          />
        </div>

        {loading ? (
          <div className='space-y-1.5'>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className='h-8 w-full rounded-lg' />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className='text-muted-foreground flex h-28 items-center justify-center text-sm'>
            {t('No channels configured')}
          </div>
        ) : (
          <div className='space-y-1.5'>
            {items.map((item) => (
              <ChannelMonitorRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function MonitorMetric(props: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  loading: boolean
  valueClassName?: string
}) {
  const Icon = props.icon
  return (
    <div className='bg-muted/40 rounded-xl px-3 py-2.5'>
      <div className='text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium'>
        <Icon className='size-3 shrink-0' aria-hidden='true' />
        <span className='truncate'>{props.label}</span>
      </div>
      {props.loading ? (
        <Skeleton className='mt-1.5 h-5 w-12' />
      ) : (
        <div
          className={cn(
            'mt-1.5 font-mono text-sm font-semibold tabular-nums',
            props.valueClassName
          )}
        >
          {props.value}
        </div>
      )}
    </div>
  )
}

function ChannelMonitorRow(props: { item: ChannelMonitorItem }) {
  const { t } = useTranslation()
  const item = props.item
  const meta = statusMeta(item.status, t)

  return (
    <div className='hover:bg-muted/40 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-3 py-2 transition-colors'>
      <div className='min-w-0'>
        <div className='flex min-w-0 items-center gap-2'>
          <span
            className={cn('size-2 shrink-0 rounded-full', meta.dot)}
            aria-hidden='true'
          />
          <span className='truncate text-sm font-medium'>{item.name}</span>
          <StatusBadge
            label={item.type_name}
            variant='neutral'
            size='sm'
            copyable={false}
          />
        </div>
        <div className='text-muted-foreground mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]'>
          <span className='truncate'>{item.group}</span>
          {item.tag && <span className='truncate'>#{item.tag}</span>}
          <span>{t('{{count}} models', { count: item.model_count })}</span>
        </div>
      </div>

      <div className='flex shrink-0 items-center gap-2'>
        <StatusBadge
          label={meta.label}
          variant={meta.badge}
          size='sm'
          copyable={false}
        />
        <div className='hidden min-w-20 text-right sm:block'>
          <div className={cn('font-mono text-xs font-semibold', meta.text)}>
            {formatLatency(item.response_time)}
          </div>
          <div className='text-muted-foreground/70 inline-flex items-center gap-1 text-[10px]'>
            <Clock3 className='size-3' />
            {formatTestTime(item.test_time)}
          </div>
        </div>
      </div>
    </div>
  )
}
