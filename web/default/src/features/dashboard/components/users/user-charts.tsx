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
import {
  Component,
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { VChart } from '@visactor/react-vchart'
import { Users, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatAccountingQuotaWithCurrency } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { getRollingDateRange, type TimeGranularity } from '@/lib/time'
import { VCHART_OPTION } from '@/lib/vchart'
import { useThemeCustomization } from '@/context/theme-customization-provider'
import { useTheme } from '@/context/theme-provider'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getUserQuotaDataByUsers } from '@/features/dashboard/api'
import {
  TIME_GRANULARITY_OPTIONS,
  TIME_RANGE_PRESETS,
} from '@/features/dashboard/constants'
import {
  getDefaultDays,
  getSavedGranularity,
  saveGranularity,
  processUserChartData,
} from '@/features/dashboard/lib'
import type {
  ProcessedUserChartData,
  QuotaDataItem,
} from '@/features/dashboard/types'

let themeManagerPromise: Promise<
  (typeof import('@visactor/vchart'))['ThemeManager']
> | null = null

const USER_CHARTS: {
  value: string
  labelKey: string
  specKey: keyof ProcessedUserChartData
}[] = [
  {
    value: 'rank',
    labelKey: 'User Consumption Ranking',
    specKey: 'spec_user_rank',
  },
  {
    value: 'trend',
    labelKey: 'User Consumption Trend',
    specKey: 'spec_user_trend',
  },
]

const TOP_USER_LIMIT_OPTIONS = [5, 10, 20, 50]

type UserDetailRow = {
  username: string
  quota: number
  count: number
  tokenUsed: number
  share: number
}

type UserChartErrorBoundaryProps = {
  children: ReactNode
  fallback: ReactNode
}

type UserChartErrorBoundaryState = {
  hasError: boolean
}

class UserChartErrorBoundary extends Component<
  UserChartErrorBoundaryProps,
  UserChartErrorBoundaryState
> {
  state: UserChartErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): UserChartErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error('User chart failed to render', error, errorInfo)
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

function buildUserDetailRows(data: QuotaDataItem[], limit: number) {
  const byUser = new Map<string, Omit<UserDetailRow, 'share'>>()

  data.forEach((item) => {
    const username = item.username || 'unknown'
    const current = byUser.get(username) ?? {
      username,
      quota: 0,
      count: 0,
      tokenUsed: 0,
    }
    current.quota += Number(item.quota) || 0
    current.count += Number(item.count) || 0
    current.tokenUsed += Number(item.token_used) || 0
    byUser.set(username, current)
  })

  const totalQuota = Array.from(byUser.values()).reduce(
    (sum, item) => sum + item.quota,
    0
  )

  return Array.from(byUser.values())
    .sort((a, b) => b.quota - a.quota)
    .slice(0, limit)
    .map((item) => ({
      ...item,
      share: totalQuota > 0 ? item.quota / totalQuota : 0,
    }))
}

export function UserCharts() {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const { customization } = useThemeCustomization()
  const [themeReady, setThemeReady] = useState(false)
  const themeManagerRef = useRef<
    (typeof import('@visactor/vchart'))['ThemeManager'] | null
  >(null)

  const [timeGranularity, setTimeGranularity] = useState<TimeGranularity>(() =>
    getSavedGranularity()
  )
  const [selectedRange, setSelectedRange] = useState<number>(() =>
    getDefaultDays(timeGranularity)
  )
  const [topUserLimit, setTopUserLimit] = useState(10)
  const [timeRange, setTimeRange] = useState(() => {
    const days = getDefaultDays(timeGranularity)
    const { start, end } = getRollingDateRange(days)
    return {
      start_timestamp: Math.floor(start.getTime() / 1000),
      end_timestamp: Math.floor(end.getTime() / 1000),
    }
  })

  const handleRangeChange = useCallback((days: number) => {
    setSelectedRange(days)
    const { start, end } = getRollingDateRange(days)
    setTimeRange({
      start_timestamp: Math.floor(start.getTime() / 1000),
      end_timestamp: Math.floor(end.getTime() / 1000),
    })
  }, [])

  const handleGranularityChange = useCallback(
    (g: TimeGranularity) => {
      setTimeGranularity(g)
      saveGranularity(g)
      const days = getDefaultDays(g)
      if (days !== selectedRange) {
        handleRangeChange(days)
      }
    },
    [selectedRange, handleRangeChange]
  )

  useEffect(() => {
    const updateTheme = async () => {
      setThemeReady(false)
      if (!themeManagerPromise) {
        themeManagerPromise = import('@visactor/vchart').then(
          (m) => m.ThemeManager
        )
      }
      const ThemeManager = await themeManagerPromise
      themeManagerRef.current = ThemeManager
      ThemeManager.setCurrentTheme(resolvedTheme === 'dark' ? 'dark' : 'light')
      setThemeReady(true)
    }
    updateTheme()
  }, [resolvedTheme])

  const { data: userData, isLoading } = useQuery({
    queryKey: ['dashboard', 'user-quota', timeRange],
    queryFn: () => getUserQuotaDataByUsers(timeRange),
    select: (res) => (res.success ? res.data : []),
    staleTime: 60_000,
  })

  const chartData = useMemo(
    () =>
      processUserChartData(
        isLoading ? [] : (userData ?? []),
        timeGranularity,
        t,
        topUserLimit,
        customization.preset
      ),
    [
      userData,
      isLoading,
      timeGranularity,
      t,
      topUserLimit,
      customization.preset,
      customization.radius,
    ]
  )

  const userRows = useMemo(
    () => buildUserDetailRows(isLoading ? [] : (userData ?? []), topUserLimit),
    [userData, isLoading, topUserLimit]
  )

  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-1.5 overflow-x-auto pb-1 sm:gap-2'>
        <Tabs
          value={String(selectedRange)}
          onValueChange={(value) => handleRangeChange(Number(value))}
          className='shrink-0'
        >
          <TabsList>
            {TIME_RANGE_PRESETS.map((preset) => (
              <TabsTrigger
                key={preset.days}
                value={String(preset.days)}
                className='px-2.5 text-xs'
              >
                {t(preset.label)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Tabs
          value={timeGranularity}
          onValueChange={(value) =>
            handleGranularityChange(value as TimeGranularity)
          }
          className='shrink-0'
        >
          <TabsList>
            {TIME_GRANULARITY_OPTIONS.map((opt) => (
              <TabsTrigger
                key={opt.value}
                value={opt.value}
                className='px-2.5 text-xs'
              >
                {t(opt.label)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Tabs
          value={String(topUserLimit)}
          onValueChange={(value) => setTopUserLimit(Number(value))}
          className='shrink-0'
        >
          <TabsList>
            <span className='text-muted-foreground px-2 text-xs font-medium whitespace-nowrap'>
              {t('Top Users')}
            </span>
            {TOP_USER_LIMIT_OPTIONS.map((limit) => (
              <TabsTrigger
                key={limit}
                value={String(limit)}
                className='px-2.5 text-xs'
              >
                {t('Top {{count}}', { count: limit })}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {isLoading && (
          <Loader2 className='text-muted-foreground size-4 animate-spin' />
        )}
      </div>

      <div className='grid gap-3'>
        {USER_CHARTS.map((chart) => {
          const spec = chartData[chart.specKey]

          return (
            <div
              key={chart.value}
              className='overflow-hidden rounded-lg border'
            >
              <div className='flex w-full items-center gap-2 border-b px-3 py-2 sm:px-5 sm:py-3'>
                <Users className='text-muted-foreground/60 size-4' />
                <div className='text-sm font-semibold'>{t(chart.labelKey)}</div>
              </div>

              <div className='h-[300px] p-1.5 sm:h-96 sm:p-2'>
                <UserChartErrorBoundary
                  fallback={
                    <div className='text-muted-foreground/80 flex h-full items-center justify-center text-xs'>
                      {t('Unable to render chart')}
                    </div>
                  }
                >
                  {isLoading ? (
                    <Skeleton className='h-full w-full' />
                  ) : themeReady && spec ? (
                    <VChart
                      key={`user-${chart.value}-${topUserLimit}-${resolvedTheme}-${customization.preset}`}
                      spec={{
                        ...spec,
                        theme: resolvedTheme === 'dark' ? 'dark' : 'light',
                        background: 'transparent',
                        animation: false,
                      }}
                      option={VCHART_OPTION}
                    />
                  ) : null}
                </UserChartErrorBoundary>
              </div>
            </div>
          )
        })}

        <div className='overflow-hidden rounded-lg border'>
          <div className='flex w-full items-center gap-2 border-b px-3 py-2 sm:px-5 sm:py-3'>
            <Users className='text-muted-foreground/60 size-4' />
            <div className='text-sm font-semibold'>{t('User Details')}</div>
          </div>
          <div className='overflow-x-auto'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-14'>{t('Rank')}</TableHead>
                  <TableHead>{t('User')}</TableHead>
                  <TableHead className='text-right'>{t('Usage')}</TableHead>
                  <TableHead className='text-right'>{t('Requests')}</TableHead>
                  <TableHead className='text-right'>{t('Tokens')}</TableHead>
                  <TableHead className='text-right'>{t('Share')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={index}>
                      {Array.from({ length: 6 }).map((__, cellIndex) => (
                        <TableCell key={cellIndex}>
                          <Skeleton className='h-4 w-full' />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : userRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className='text-muted-foreground h-24 text-center'
                    >
                      {t('No data available')}
                    </TableCell>
                  </TableRow>
                ) : (
                  userRows.map((row, index) => (
                    <TableRow key={row.username}>
                      <TableCell className='text-muted-foreground font-mono text-xs'>
                        #{index + 1}
                      </TableCell>
                      <TableCell className='font-medium'>
                        {row.username}
                      </TableCell>
                      <TableCell className='text-right font-mono'>
                        {formatAccountingQuotaWithCurrency(row.quota)}
                      </TableCell>
                      <TableCell className='text-right font-mono'>
                        {formatNumber(row.count)}
                      </TableCell>
                      <TableCell className='text-right font-mono'>
                        {formatNumber(row.tokenUsed)}
                      </TableCell>
                      <TableCell className='text-right font-mono'>
                        {(row.share * 100).toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  )
}
