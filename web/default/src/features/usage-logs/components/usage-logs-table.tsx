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
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useMediaQuery } from '@/hooks'
import { BadgePercent, SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useIsAdmin } from '@/hooks/use-admin'
import { useTableUrlState } from '@/hooks/use-table-url-state'
import { TableCell, TableRow } from '@/components/ui/table'
import { DataTablePage } from '@/components/data-table'
import {
  DEFAULT_LOGS_DATA,
  LOG_TYPE_ALL_VALUE,
  LOG_TYPE_ENUM,
} from '../constants'
import { useColumnsByCategory } from '../lib/columns'
import { parseLogOther } from '../lib/format'
import { fetchLogsByCategory } from '../lib/utils'
import type { LogCategory, UsageLog } from '../types'
import { CommonLogsCommandCenter } from './common-logs-command-center'
import { CommonLogsFilterBar } from './common-logs-filter-bar'
import { TaskLogsFilterBar } from './task-logs-filter-bar'
import { UsageLogsMobileList } from './usage-logs-mobile-card'
import { useUsageLogsContext } from './usage-logs-provider'

const route = getRouteApi('/_authenticated/usage-logs/$section')

const logTypeRowTint: Record<number, string> = {
  [LOG_TYPE_ENUM.ERROR]: 'bg-rose-50/40 dark:bg-rose-950/20',
  [LOG_TYPE_ENUM.REFUND]: 'bg-blue-50/30 dark:bg-blue-950/15',
}

function deserializeLogTypeFilter(value: unknown): unknown[] {
  const values = Array.isArray(value) ? value : value ? [value] : []
  return values.filter((item) => String(item) !== LOG_TYPE_ALL_VALUE)
}

interface UsageLogsTableProps {
  logCategory: LogCategory
}

interface VisibleTokenRatio {
  key: string
  tokenName: string
  groupName: string
  ratio: number
}

function getVisibleTokenRatios(logs: UsageLog[]): VisibleTokenRatio[] {
  const ratios = new Map<string, VisibleTokenRatio>()

  for (const log of logs) {
    const other = parseLogOther(log.other)
    const userGroupRatio = Number(other?.user_group_ratio)
    const hasUserGroupRatio =
      other?.user_group_ratio != null &&
      Number.isFinite(userGroupRatio) &&
      userGroupRatio >= 0
    const ratio = hasUserGroupRatio
      ? userGroupRatio
      : Number(other?.group_ratio)
    if (other?.group_ratio == null && !hasUserGroupRatio) continue
    if (!Number.isFinite(ratio) || ratio < 0) continue

    const tokenName = log.token_name?.trim() || `#${log.token_id || 0}`
    const groupName = log.group?.trim() || ''
    const key = `${log.token_id || tokenName}:${groupName}:${ratio}`
    if (!ratios.has(key)) {
      ratios.set(key, { key, tokenName, groupName, ratio })
    }
  }

  return Array.from(ratios.values())
}

function formatGroupRatio(ratio: number): string {
  if (ratio !== 0 && Math.abs(ratio) < 0.0001) {
    return ratio.toExponential().replace('+', '')
  }
  return ratio.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

export function UsageLogsTable({ logCategory }: UsageLogsTableProps) {
  const { t } = useTranslation()
  const isAdmin = useIsAdmin()
  const { sensitiveVisible } = useUsageLogsContext()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const searchParams = route.useSearch()

  const {
    columnFilters,
    onColumnFiltersChange,
    pagination,
    onPaginationChange,
    ensurePageInRange,
  } = useTableUrlState({
    search: route.useSearch(),
    navigate: route.useNavigate(),
    pagination: {
      defaultPage: 1,
      defaultPageSize: isMobile ? 20 : logCategory === 'common' ? 10 : 100,
    },
    globalFilter: { enabled: false },
    columnFilters: [
      {
        columnId: 'created_at',
        searchKey: 'type',
        type: 'array' as const,
        deserialize: deserializeLogTypeFilter,
      },
      { columnId: 'model_name', searchKey: 'model', type: 'string' as const },
      { columnId: 'token_name', searchKey: 'token', type: 'string' as const },
      { columnId: 'group', searchKey: 'group', type: 'string' as const },
      ...(isAdmin
        ? [
            {
              columnId: 'channel',
              searchKey: 'channel',
              type: 'string' as const,
            },
            {
              columnId: 'username',
              searchKey: 'username',
              type: 'string' as const,
            },
          ]
        : []),
    ],
  })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'logs',
      logCategory,
      isAdmin,
      pagination.pageIndex + 1,
      pagination.pageSize,
      columnFilters,
      searchParams,
      t,
    ],
    queryFn: async () => {
      const result = await fetchLogsByCategory({
        logCategory,
        isAdmin,
        page: pagination.pageIndex + 1,
        pageSize: pagination.pageSize,
        searchParams,
        columnFilters,
      })

      if (!result?.success) {
        toast.error(result?.message || t('Failed to load logs'))
        return DEFAULT_LOGS_DATA
      }

      return result.data || DEFAULT_LOGS_DATA
    },
    placeholderData: (previousData, previousQuery) => {
      if (previousQuery?.queryKey[1] === logCategory) {
        return previousData
      }
      return undefined
    },
  })

  const logs = useMemo(() => data?.items || [], [data?.items])
  const columns = useColumnsByCategory(logCategory, isAdmin)
  const isLoadingData = isLoading || (isFetching && !data)

  const table = useReactTable({
    data: logs as unknown as Record<string, unknown>[],
    columns: columns as ColumnDef<Record<string, unknown>>[],
    state: {
      columnFilters,
      pagination,
    },
    enableRowSelection: false,
    onPaginationChange,
    onColumnFiltersChange,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    manualPagination: true,
    manualFiltering: true,
    pageCount: Math.ceil((data?.total || 0) / pagination.pageSize),
  })

  const pageCount = table.getPageCount()
  useEffect(() => {
    ensurePageInRange(pageCount)
  }, [pageCount, ensurePageInRange])

  const isCommon = logCategory === 'common'
  const commonLogs = useMemo(
    () => (isCommon ? (logs as UsageLog[]) : []),
    [isCommon, logs]
  )
  const visibleTokenRatios = useMemo(
    () => getVisibleTokenRatios(commonLogs),
    [commonLogs]
  )
  // Desktop keeps the filter row collapsed so the command-center core shows
  // more log rows; mobile has no such pressure and stays expanded.
  const [filtersOpen, setFiltersOpen] = useState(false)
  const commonFiltersVisible = isMobile || filtersOpen

  const tableContent = (
    <DataTablePage
      table={table}
      columns={columns as ColumnDef<Record<string, unknown>>[]}
      isLoading={isLoadingData}
      isFetching={isFetching}
      emptyTitle={t('No Logs Found')}
      emptyDescription={t(
        'No usage logs available. Logs will appear here once API calls are made.'
      )}
      skeletonKeyPrefix='usage-log-skeleton'
      tableClassName={cn(
        isCommon ? 'command-log-table' : 'overflow-x-auto',
        !isCommon &&
          '[&_[data-slot=table]]:text-[13px] [&_[data-slot=table]_td]:text-[13px] [&_[data-slot=table]_td_*]:text-[13px] [&_[data-slot=table]_th]:text-[13px] [&_[data-slot=table]_th_*]:text-[13px]'
      )}
      tableHeaderClassName='bg-muted/30 sticky top-0 z-10'
      mobile={
        <UsageLogsMobileList
          table={table}
          isLoading={isLoadingData}
          logCategory={logCategory}
        />
      }
      toolbar={
        isCommon ? (
          <div className='command-filter-zone'>
            {!isMobile && (
              <div className='command-filter-summary-row'>
                <button
                  type='button'
                  className='command-filter-toggle'
                  onClick={() => setFiltersOpen((open) => !open)}
                  aria-expanded={filtersOpen}
                  aria-controls='common-logs-filter-panel'
                >
                  <SlidersHorizontal aria-hidden='true' />
                  <span>{filtersOpen ? t('Hide Filters') : t('Filters')}</span>
                </button>
                {!filtersOpen && (
                  <div className='command-token-ratio-summary'>
                    <span className='command-token-ratio-label'>
                      <BadgePercent aria-hidden='true' />
                      {t('Current token group ratios')}
                    </span>
                    {visibleTokenRatios.length > 0 ? (
                      <div className='command-token-ratio-list'>
                        {visibleTokenRatios.slice(0, 6).map((item) => {
                          const tokenLabel = sensitiveVisible
                            ? item.tokenName
                            : '••••'
                          const details = [
                            tokenLabel,
                            item.groupName,
                            `×${formatGroupRatio(item.ratio)}`,
                          ]
                            .filter(Boolean)
                            .join(' · ')

                          return (
                            <span
                              key={item.key}
                              className='command-token-ratio-chip'
                              title={details}
                            >
                              <em>{tokenLabel}</em>
                              <strong>×{formatGroupRatio(item.ratio)}</strong>
                            </span>
                          )
                        })}
                        {visibleTokenRatios.length > 6 && (
                          <span
                            className='command-token-ratio-more'
                            title={visibleTokenRatios
                              .slice(6)
                              .map((item) =>
                                [
                                  sensitiveVisible ? item.tokenName : '••••',
                                  item.groupName,
                                  `×${formatGroupRatio(item.ratio)}`,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')
                              )
                              .join('\n')}
                          >
                            +{visibleTokenRatios.length - 6}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className='command-token-ratio-empty'>
                        {t('No ratio data on this page')}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
            {commonFiltersVisible && (
              <div id='common-logs-filter-panel'>
                <CommonLogsFilterBar table={table} />
              </div>
            )}
          </div>
        ) : (
          <TaskLogsFilterBar table={table} logCategory={logCategory} />
        )
      }
      paginationInFooter={!isCommon}
      renderRow={(row) => {
        const logType = (row.original as Record<string, unknown>).type as
          | number
          | undefined
        const tintClass =
          isCommon && logType != null ? (logTypeRowTint[logType] ?? '') : ''

        return (
          <TableRow key={row.id} className={cn('transition-colors', tintClass)}>
            {row.getVisibleCells().map((cell) => (
              <TableCell
                key={cell.id}
                className={isCommon ? 'command-log-cell' : 'py-3.5'}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        )
      }}
    />
  )

  if (!isCommon) return tableContent

  return (
    <CommonLogsCommandCenter
      logs={commonLogs}
      total={data?.total || 0}
      isFetching={isFetching}
    >
      {tableContent}
    </CommonLogsCommandCenter>
  )
}
