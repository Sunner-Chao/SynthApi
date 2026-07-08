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
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Activity,
  CircleAlert,
  CircleCheck,
  Clock3,
  RadioTower,
  RefreshCw,
  Route,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth-store'
import { ROLE } from '@/lib/roles'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { getChannelMonitor } from '@/features/dashboard/api'
import type { ChannelMonitorItem } from '@/features/dashboard/types'
import { MonitorCardGrid } from './components/monitor-card-grid'
import {
  MonitorFilters,
  type ViewMode,
  type StatusFilter,
} from './components/monitor-filters'
import {
  SuccessRateStrip,
  formatSuccessRate,
} from './components/success-rate-strip'
import {
  getAvailabilityRate,
  getUsageSuccessRate,
  hasUsageMetrics,
} from './lib/metrics'

const CHANNEL_STATUS = {
  ENABLED: 1,
  MANUAL_DISABLED: 2,
  AUTO_DISABLED: 3,
} as const
const DEFAULT_MONITOR_MODEL = 'gpt-5.5'

function formatLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '-'
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '-'
  const diffSeconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp))
  if (diffSeconds < 60) return `${diffSeconds}s`
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m`
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h`
  return `${Math.floor(diffSeconds / 86400)}d`
}

function formatDateTime(timestamp: number): string {
  if (!timestamp) return '-'
  return new Date(timestamp * 1000).toLocaleString()
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

function filterItems(
  items: ChannelMonitorItem[],
  search: string,
  statusFilter: StatusFilter
): ChannelMonitorItem[] {
  return items.filter((item) => {
    if (statusFilter === 'enabled' && item.status !== CHANNEL_STATUS.ENABLED)
      return false
    if (statusFilter === 'disabled' && item.status === CHANNEL_STATUS.ENABLED)
      return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      return (
        item.name?.toLowerCase().includes(q) ||
        item.group?.toLowerCase().includes(q) ||
        item.type_name?.toLowerCase().includes(q)
      )
    }
    return true
  })
}

export function ChannelMonitor() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const isAdmin = Boolean(user && user.role >= ROLE.ADMIN)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MONITOR_MODEL)

  const monitorQuery = useQuery({
    queryKey: ['channel-monitor', 'page', selectedModel],
    queryFn: () => getChannelMonitor({ limit: 200, model: selectedModel }),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    retry: false,
  })

  const summary = monitorQuery.data?.data?.summary
  const allItems = monitorQuery.data?.data?.items ?? []
  const loading = monitorQuery.isLoading
  const showError = monitorQuery.isError && allItems.length === 0 && !loading
  const modelOptions = useMemo(() => {
    const models = new Set<string>([
      DEFAULT_MONITOR_MODEL,
      selectedModel,
      ...(monitorQuery.data?.data?.models ?? []),
    ])
    return Array.from(models)
      .map((model) => model.trim())
      .filter(Boolean)
      .sort((a, b) => {
        if (a === DEFAULT_MONITOR_MODEL) return -1
        if (b === DEFAULT_MONITOR_MODEL) return 1
        return a.localeCompare(b)
      })
  }, [monitorQuery.data?.data?.models, selectedModel])

  const filteredItems = useMemo(
    () => filterItems(allItems, search, statusFilter),
    [allItems, search, statusFilter]
  )

  const enabledRate =
    summary && summary.total > 0
      ? Math.round((summary.enabled / summary.total) * 1000) / 10
      : 0
  const exceptionCount =
    (summary?.auto_disabled ?? 0) + (summary?.manual_disabled ?? 0)
  const exceptionClass =
    exceptionCount > 0 ? 'text-destructive' : 'text-success'

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Group Monitor')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <div className='flex items-center gap-2'>
          <span className='text-muted-foreground hidden text-xs font-medium sm:inline'>
            {t('Model')}
          </span>
          <Select
            items={modelOptions.map((model) => ({
              value: model,
              label: model,
            }))}
            value={selectedModel}
            onValueChange={setSelectedModel}
          >
            <SelectTrigger size='sm' className='w-[180px]'>
              <SelectValue placeholder={DEFAULT_MONITOR_MODEL} />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {modelOptions.map((model) => (
                  <SelectItem key={model} value={model}>
                    <span className='font-mono text-xs'>{model}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant='outline'
          size='sm'
          onClick={() => void monitorQuery.refetch()}
          disabled={monitorQuery.isFetching}
        >
          <RefreshCw
            className={cn('size-4', monitorQuery.isFetching && 'animate-spin')}
            aria-hidden='true'
          />
          {t('Refresh')}
        </Button>
        {isAdmin && (
          <Button size='sm' render={<Link to='/channels' />}>
            <RadioTower className='size-4' aria-hidden='true' />
            {t('Manage Channels')}
          </Button>
        )}
      </SectionPageLayout.Actions>

      <SectionPageLayout.Content>
        <div className='space-y-4'>
          {/* Summary cards */}
          <div className='grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6'>
            <MonitorSummaryCard
              icon={Route}
              label={t('Total groups')}
              value={String(summary?.total ?? 0)}
              loading={loading}
            />
            <MonitorSummaryCard
              icon={CircleCheck}
              label={t('Available')}
              value={`${summary?.enabled ?? 0}/${summary?.total ?? 0}`}
              loading={loading}
              valueClassName='text-success'
            />
            <MonitorSummaryCard
              icon={Activity}
              label={t('Availability')}
              value={`${enabledRate}%`}
              loading={loading}
            />
            <MonitorSummaryCard
              icon={CircleAlert}
              label={t('Exceptions')}
              value={String(exceptionCount)}
              loading={loading}
              valueClassName={exceptionClass}
            />
            <MonitorSummaryCard
              icon={Users}
              label={t('Active users')}
              value={String(summary?.active_users ?? 0)}
              loading={loading}
              valueClassName='text-primary'
            />
            <MonitorSummaryCard
              icon={RadioTower}
              label={t('Active groups')}
              value={String(summary?.active_channels ?? 0)}
              loading={loading}
            />
          </div>

          {/* Filters + view toggle */}
          <MonitorFilters
            search={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            isFetching={monitorQuery.isFetching}
          />

          {/* Results count */}
          {!loading && allItems.length > 0 && (
            <p className='text-muted-foreground text-xs'>
              {filteredItems.length === allItems.length
                ? t('{{count}} groups', { count: allItems.length })
                : t('{{filtered}} of {{total}} groups', {
                    filtered: filteredItems.length,
                    total: allItems.length,
                  })}
            </p>
          )}

          {/* Grid view */}
          {viewMode === 'grid' ? (
            showError ? (
              <div className='text-destructive rounded-xl border p-8 text-center text-sm'>
                {t('Failed to load group monitor')}
              </div>
            ) : (
              <MonitorCardGrid items={filteredItems} loading={loading} />
            )
          ) : (
            /* Table view */
            <Card className='gap-0 overflow-hidden py-0'>
              <CardHeader className='border-b px-4 py-3'>
                <div className='flex min-w-0 items-center gap-2'>
                  <Activity
                    className='text-muted-foreground size-4 shrink-0'
                    aria-hidden='true'
                  />
                  <CardTitle className='truncate text-sm font-semibold'>
                    {t('Live group status')}
                  </CardTitle>
                  {monitorQuery.isFetching && !loading && (
                    <RefreshCw
                      className='text-muted-foreground ml-auto size-4 animate-spin'
                      aria-hidden='true'
                    />
                  )}
                </div>
              </CardHeader>
              <CardContent className='p-0'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('Group')}</TableHead>
                      <TableHead>{t('Status')}</TableHead>
                      <TableHead className='text-right'>
                        {t('Available')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('Models')}
                      </TableHead>
                      <TableHead>{t('24h usage success rate')}</TableHead>
                      <TableHead className='text-right'>
                        {t('Latency')}
                      </TableHead>
                      <TableHead>{t('Last checked')}</TableHead>
                      <TableHead className='text-right'>
                        {t('Current users')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <MonitorTableSkeleton />
                    ) : showError ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className='text-destructive h-24 text-center'
                        >
                          {t('Failed to load group monitor')}
                        </TableCell>
                      </TableRow>
                    ) : filteredItems.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className='text-muted-foreground h-24 text-center'
                        >
                          {t('No groups configured')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredItems.map((item) => (
                        <ChannelMonitorTableRow key={item.id} item={item} />
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

function MonitorSummaryCard(props: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  loading: boolean
  valueClassName?: string
}) {
  const Icon = props.icon
  return (
    <Card className='gap-0 py-0'>
      <CardContent className='p-3'>
        <div className='text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs font-medium'>
          <Icon className='size-3.5 shrink-0' aria-hidden='true' />
          <span className='truncate'>{props.label}</span>
        </div>
        {props.loading ? (
          <Skeleton className='mt-2 h-6 w-14' />
        ) : (
          <div
            className={cn(
              'mt-2 font-mono text-lg font-semibold tabular-nums',
              props.valueClassName
            )}
          >
            {props.value}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ChannelMonitorTableRow(props: { item: ChannelMonitorItem }) {
  const { t } = useTranslation()
  const item = props.item
  const meta = statusMeta(item.status, t)
  const activeUsers = item.active_users ?? 0
  const groupName = item.group || item.name
  const channelCount = item.channel_count ?? 0
  const enabledCount = item.enabled_count ?? 0
  const hasUsage = hasUsageMetrics(item)
  const usageRate = getUsageSuccessRate(item)
  const availabilityRate = getAvailabilityRate(item)
  const usageHint = hasUsage
    ? t('{{success}}/{{total}} successful requests in the last 24 hours', {
        success: item.usage_success_count ?? 0,
        total: item.usage_request_count ?? 0,
      })
    : t('No 24h usage data; availability {{rate}}', {
        rate: formatSuccessRate(availabilityRate),
      })

  return (
    <TableRow>
      <TableCell className='max-w-64'>
        <div className='flex min-w-0 items-center gap-2'>
          <span
            className={cn('size-2 shrink-0 rounded-full', meta.dot)}
            aria-hidden='true'
          />
          <span className='truncate font-medium'>{groupName}</span>
        </div>
        <div className='text-muted-foreground mt-1 text-xs'>
          {t('{{count}} channel(s)', { count: channelCount })}
        </div>
      </TableCell>
      <TableCell>
        <StatusBadge
          label={meta.label}
          variant={meta.badge}
          size='sm'
          copyable={false}
        />
      </TableCell>
      <TableCell className='text-right font-mono'>{`${enabledCount}/${channelCount}`}</TableCell>
      <TableCell className='text-right font-mono'>{item.model_count}</TableCell>
      <TableCell>
        <SuccessRateStrip
          rate={usageRate}
          source={hasUsage ? 'usage' : 'availability'}
          series={item.success_series}
          availabilityRate={availabilityRate}
          enabledCount={enabledCount}
          totalCount={channelCount}
          size='sm'
          className='min-w-[180px]'
          emptyLabel={t('No data')}
        />
        <div className='text-muted-foreground mt-1 text-[11px]'>
          {usageHint}
        </div>
      </TableCell>
      <TableCell className={cn('text-right font-mono', meta.text)}>
        {formatLatency(item.response_time)}
      </TableCell>
      <TableCell>
        <div className='flex min-w-28 items-center gap-1.5'>
          <Clock3
            className='text-muted-foreground size-3.5'
            aria-hidden='true'
          />
          <span className='font-mono'>
            {formatRelativeTime(item.test_time)}
          </span>
        </div>
        <div className='text-muted-foreground mt-1 text-xs'>
          {formatDateTime(item.test_time)}
        </div>
      </TableCell>
      <TableCell className='text-right'>
        <StatusBadge
          label={String(activeUsers)}
          variant={activeUsers > 0 ? 'success' : 'neutral'}
          size='sm'
          copyable={false}
        />
      </TableCell>
    </TableRow>
  )
}

function MonitorTableSkeleton() {
  return Array.from({ length: 8 }).map((_, index) => (
    <TableRow key={index}>
      {Array.from({ length: 8 }).map((__, cellIndex) => (
        <TableCell key={cellIndex}>
          <Skeleton className='h-5 w-full min-w-16' />
        </TableCell>
      ))}
    </TableRow>
  ))
}
