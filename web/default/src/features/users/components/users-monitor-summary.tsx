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
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Activity,
  CircleAlert,
  CircleCheck,
  HeartPulse,
  RadioTower,
  RefreshCw,
  Route,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/status-badge'
import {
  formatSuccessRate,
  successRateTextClass,
} from '@/features/channel-monitor/components/success-rate-strip'
import {
  getAvailabilityRate,
  getUsageSuccessRate,
  hasUsageMetrics,
} from '@/features/channel-monitor/lib/metrics'
import { getChannelMonitor } from '@/features/dashboard/api'
import type { ChannelMonitorItem } from '@/features/dashboard/types'

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

function statusMeta(status: number, t: (key: string) => string) {
  if (status === CHANNEL_STATUS.ENABLED) {
    return {
      label: t('Available'),
      badge: 'success' as const,
      dot: 'bg-emerald-500',
    }
  }
  if (status === CHANNEL_STATUS.AUTO_DISABLED) {
    return {
      label: t('Auto disabled'),
      badge: 'warning' as const,
      dot: 'bg-amber-500',
    }
  }
  return {
    label: t('Manual disabled'),
    badge: 'neutral' as const,
    dot: 'bg-muted-foreground',
  }
}

interface SummaryMetricProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  loading: boolean
  valueClassName?: string
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
  loading,
  valueClassName,
}: SummaryMetricProps) {
  return (
    <div className='flex flex-col gap-1'>
      <div className='text-muted-foreground flex items-center gap-1.5 text-xs font-medium'>
        <Icon className='size-3.5 shrink-0' aria-hidden='true' />
        <span className='truncate'>{label}</span>
      </div>
      {loading ? (
        <Skeleton className='h-5 w-12' />
      ) : (
        <div
          className={cn(
            'font-mono text-base font-semibold tabular-nums',
            valueClassName
          )}
        >
          {value}
        </div>
      )}
    </div>
  )
}

interface ChannelRowProps {
  item: ChannelMonitorItem
}

function GroupRow({ item }: ChannelRowProps) {
  const { t } = useTranslation()
  const meta = statusMeta(item.status, t)
  const activeUsers = item.active_users ?? 0
  const groupName = item.group || item.name
  const channelCount = item.channel_count ?? 0
  const enabledCount = item.enabled_count ?? 0
  const hasUsage = hasUsageMetrics(item)
  const usageRate = getUsageSuccessRate(item)
  const availabilityRate = getAvailabilityRate(item)
  const healthValue = hasUsage ? formatSuccessRate(usageRate) : t('No data')
  const healthDetail = hasUsage
    ? t('{{count}} request(s)', { count: item.usage_request_count ?? 0 })
    : t('Availability {{rate}}', {
        rate: formatSuccessRate(availabilityRate),
      })

  return (
    <div className='flex items-center gap-3 py-2'>
      <span
        className={cn('size-2 shrink-0 rounded-full', meta.dot)}
        aria-hidden='true'
      />
      <div className='min-w-0 flex-1'>
        <div className='flex min-w-0 items-center gap-2'>
          <span className='truncate text-sm font-medium'>{groupName}</span>
          <StatusBadge
            label={`${enabledCount}/${channelCount}`}
            variant='neutral'
            size='sm'
            copyable={false}
            showDot={false}
            className='shrink-0'
          />
        </div>
        <div className='text-muted-foreground mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]'>
          <span>{t('{{count}} models', { count: item.model_count })}</span>
          <span>{t('{{count}} channel(s)', { count: channelCount })}</span>
          <span>{t('{{count}} active user(s)', { count: activeUsers })}</span>
        </div>
      </div>
      <div className='flex shrink-0 items-center gap-3'>
        {activeUsers > 0 && (
          <div className='flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400'>
            <Users className='size-3' aria-hidden='true' />
            <span className='font-mono font-semibold'>{activeUsers}</span>
          </div>
        )}
        <span
          className={cn(
            'inline-flex items-center gap-1 font-mono text-xs font-semibold',
            hasUsage ? successRateTextClass(usageRate) : 'text-muted-foreground'
          )}
        >
          <HeartPulse className='size-3' aria-hidden='true' />
          {healthValue}
        </span>
        <span className='text-muted-foreground hidden max-w-24 truncate text-[10px] sm:inline'>
          {healthDetail}
        </span>
        <span
          className={cn(
            'font-mono text-xs',
            meta.dot === 'bg-emerald-500'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-muted-foreground'
          )}
        >
          {formatLatency(item.response_time)}
        </span>
        <StatusBadge
          label={meta.label}
          variant={meta.badge}
          size='sm'
          copyable={false}
          showDot={false}
          className='shrink-0'
        />
      </div>
    </div>
  )
}

/**
 * UsersMonitorSummary — compact group monitor panel shown at the top of the
 * Users admin page, mirroring the style of the full monitor page but trimmed
 * to a summary card with a "View all" link.
 */
export function UsersMonitorSummary() {
  const { t } = useTranslation()

  const monitorQuery = useQuery({
    queryKey: ['channel-monitor', 'users-panel'],
    queryFn: () => getChannelMonitor({ limit: 12 }),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    retry: false,
  })

  const summary = monitorQuery.data?.data?.summary
  const items = (monitorQuery.data?.data?.items ?? []).slice(0, 6)
  const loading = monitorQuery.isLoading

  const enabledRate =
    summary && summary.total > 0
      ? Math.round((summary.enabled / summary.total) * 1000) / 10
      : 0
  const exceptionCount =
    (summary?.auto_disabled ?? 0) + (summary?.manual_disabled ?? 0)

  return (
    <Card className='gap-0 overflow-hidden py-0'>
      {/* Header */}
      <CardHeader className='border-b px-4 py-3'>
        <div className='flex min-w-0 items-center gap-2'>
          <Activity
            className='text-muted-foreground size-4 shrink-0'
            aria-hidden='true'
          />
          <CardTitle className='truncate text-sm font-semibold'>
            {t('Group Monitor')}
          </CardTitle>
          {monitorQuery.isFetching && !loading && (
            <RefreshCw
              className='text-muted-foreground ml-1 size-3.5 animate-spin'
              aria-hidden='true'
            />
          )}
          <div className='ml-auto flex items-center gap-2'>
            <Button
              variant='ghost'
              size='sm'
              className='h-7 w-7 p-0'
              aria-label={t('Refresh group monitor')}
              onClick={() => void monitorQuery.refetch()}
              disabled={monitorQuery.isFetching}
            >
              <RefreshCw
                className={cn(
                  'size-3.5',
                  monitorQuery.isFetching && 'animate-spin'
                )}
                aria-hidden='true'
              />
            </Button>
            <Button
              variant='outline'
              size='sm'
              className='h-7 text-xs'
              render={<Link to='/channel-monitor' />}
            >
              {t('View all')}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className='p-4'>
        {/* Summary metrics row */}
        <div className='grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 lg:grid-cols-6'>
          <SummaryMetric
            icon={Route}
            label={t('Total groups')}
            value={String(summary?.total ?? 0)}
            loading={loading}
          />
          <SummaryMetric
            icon={CircleCheck}
            label={t('Available')}
            value={`${summary?.enabled ?? 0}/${summary?.total ?? 0}`}
            loading={loading}
            valueClassName='text-success'
          />
          <SummaryMetric
            icon={Activity}
            label={t('Availability')}
            value={`${enabledRate}%`}
            loading={loading}
          />
          <SummaryMetric
            icon={CircleAlert}
            label={t('Exceptions')}
            value={String(exceptionCount)}
            loading={loading}
            valueClassName={
              exceptionCount > 0 ? 'text-destructive' : 'text-success'
            }
          />
          <SummaryMetric
            icon={Users}
            label={t('Active users')}
            value={String(summary?.active_users ?? 0)}
            loading={loading}
            valueClassName='text-primary'
          />
          <SummaryMetric
            icon={RadioTower}
            label={t('Active groups')}
            value={String(summary?.active_channels ?? 0)}
            loading={loading}
          />
        </div>

        {/* Top groups list */}
        {!loading && items.length > 0 && (
          <div className='mt-4 border-t pt-3 dark:border-white/5'>
            <p className='text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase'>
              {t('Top groups')}
            </p>
            <div className='divide-y dark:divide-white/5'>
              {items.map((item) => (
                <GroupRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        )}

        {/* Loading skeleton for group list */}
        {loading && (
          <div className='mt-4 space-y-2 border-t pt-3 dark:border-white/5'>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className='flex items-center gap-3 py-1.5'>
                <Skeleton className='size-2 rounded-full' />
                <Skeleton className='h-4 flex-1' />
                <Skeleton className='h-4 w-16' />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
