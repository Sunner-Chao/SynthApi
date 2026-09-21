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
import { Route } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/empty-state'
import type { ChannelMonitorItem } from '@/features/dashboard/types'
import { MonitorChannelCard } from './monitor-channel-card'

function CardSkeleton() {
  return (
    <div className='flex animate-pulse flex-col rounded-2xl border border-gray-200/80 bg-white/70 p-5 dark:border-white/10 dark:bg-white/5'>
      <div className='flex items-start gap-3'>
        <div className='h-10 w-10 rounded-xl bg-gray-200 dark:bg-white/10' />
        <div className='flex-1 space-y-2'>
          <div className='h-4 w-2/3 rounded bg-gray-200 dark:bg-white/10' />
          <div className='h-3 w-1/2 rounded bg-gray-200 dark:bg-white/10' />
        </div>
        <div className='h-5 w-16 rounded-full bg-gray-200 dark:bg-white/10' />
      </div>
      <div className='mt-4 grid grid-cols-2 gap-2'>
        <div className='h-16 rounded-xl bg-gray-100 dark:bg-white/5' />
        <div className='h-16 rounded-xl bg-gray-100 dark:bg-white/5' />
      </div>
      <div className='mt-3 h-px bg-gray-100 dark:bg-white/5' />
      <div className='mt-3 flex justify-between'>
        <div className='h-3 w-16 rounded bg-gray-100 dark:bg-white/5' />
        <div className='h-3 w-12 rounded bg-gray-100 dark:bg-white/5' />
      </div>
    </div>
  )
}

export interface MonitorCardGridProps {
  items: ChannelMonitorItem[]
  loading: boolean
  refreshRemainingSeconds?: number
}

export function MonitorCardGrid({
  items,
  loading,
  refreshRemainingSeconds,
}: MonitorCardGridProps) {
  const { t } = useTranslation()

  if (loading && items.length === 0) {
    return (
      <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'>
        {Array.from({ length: 8 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Route}
        title={t('No groups configured')}
        description={t('Add channel groups to start monitoring their status.')}
        bordered
      />
    )
  }

  return (
    <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'>
      {items.map((item) => (
        <MonitorChannelCard
          key={item.id}
          item={item}
          refreshRemainingSeconds={refreshRemainingSeconds}
        />
      ))}
    </div>
  )
}
