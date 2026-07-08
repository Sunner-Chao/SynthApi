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
import { LayoutGrid, LayoutList, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type ViewMode = 'grid' | 'table'
export type StatusFilter = 'all' | 'enabled' | 'disabled'

export interface MonitorFiltersProps {
  search: string
  onSearchChange: (v: string) => void
  statusFilter: StatusFilter
  onStatusFilterChange: (v: StatusFilter) => void
  viewMode: ViewMode
  onViewModeChange: (v: ViewMode) => void
  isFetching: boolean
}

const STATUS_OPTIONS: { value: StatusFilter; labelKey: string }[] = [
  { value: 'all', labelKey: 'All' },
  { value: 'enabled', labelKey: 'Available' },
  { value: 'disabled', labelKey: 'Disabled' },
]

export function MonitorFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  viewMode,
  onViewModeChange,
  isFetching,
}: MonitorFiltersProps) {
  const { t } = useTranslation()

  return (
    <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
      {/* Left: Search + Status Tabs */}
      <div className='flex flex-1 flex-wrap items-center gap-3'>
        {/* Search */}
        <div className='relative w-full sm:w-64'>
          <Search
            className='absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-gray-400 dark:text-gray-500'
            aria-hidden='true'
          />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('Search groups...')}
            className='pl-8'
            aria-label={t('Search groups')}
          />
        </div>

        {/* Status filter tabs */}
        <div
          role='tablist'
          aria-label={t('Filter by status')}
          className='inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs dark:border-white/10 dark:bg-white/5'
        >
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type='button'
              role='tab'
              aria-selected={statusFilter === opt.value}
              onClick={() => onStatusFilterChange(opt.value)}
              className={cn(
                'rounded-md px-3 py-1 font-medium transition-colors',
                statusFilter === opt.value
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              )}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Right: View mode toggle */}
      <div className='flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-white/10 dark:bg-white/5'>
        <Button
          variant='ghost'
          size='sm'
          aria-label={t('Grid view')}
          aria-pressed={viewMode === 'grid'}
          onClick={() => onViewModeChange('grid')}
          className={cn(
            'h-7 w-7 p-0',
            viewMode === 'grid'
              ? 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white'
              : 'text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200'
          )}
          disabled={isFetching && viewMode !== 'grid'}
        >
          <LayoutGrid className='size-4' aria-hidden='true' />
        </Button>
        <Button
          variant='ghost'
          size='sm'
          aria-label={t('Table view')}
          aria-pressed={viewMode === 'table'}
          onClick={() => onViewModeChange('table')}
          className={cn(
            'h-7 w-7 p-0',
            viewMode === 'table'
              ? 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white'
              : 'text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200'
          )}
          disabled={isFetching && viewMode !== 'table'}
        >
          <LayoutList className='size-4' aria-hidden='true' />
        </Button>
      </div>
    </div>
  )
}
