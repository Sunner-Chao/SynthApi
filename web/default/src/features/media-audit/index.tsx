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
import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { api } from '@/lib/api'
import {
  formatLogQuota,
  formatTimestamp,
  formatTimestampForInput,
  formatUseTime,
} from '@/lib/format'
import { useIsAdmin } from '@/hooks/use-admin'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SectionPageLayout } from '@/components/layout'
import { MediaFiltersForm } from './filters'
import { MediaDetail } from './media-detail'
import type {
  MediaFilters,
  MediaKind,
  MediaPage,
  MediaRow,
  MediaView,
} from './types'

function defaultFilters(): MediaFilters {
  const now = Math.floor(Date.now() / 1000)
  return {
    start: formatTimestampForInput(now - 7 * 86400),
    end: formatTimestampForInput(now + 60),
    model: '',
    identifier: '',
    status: '',
    user_id: '',
    channel_id: '',
  }
}

export function MediaAuditPage(props: { kind: MediaKind }) {
  const { t } = useTranslation()
  const isAdmin = useIsAdmin()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const [view, setView] = useState<MediaView>('requests')
  const [filters, setFilters] = useState(defaultFilters)
  const [applied, setApplied] = useState(filters)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<MediaRow | null>(null)
  const [pageSize, setPageSize] = useState(20)
  const query = useQuery({
    queryKey: [
      'media-audit',
      props.kind,
      view,
      userId,
      isAdmin,
      page,
      pageSize,
      applied,
    ],
    queryFn: async () => {
      const response = await api.get<{
        success: boolean
        message?: string
        data: MediaPage
      }>(`/api/media-logs/${isAdmin ? 'admin' : 'self'}/${props.kind}`, {
        params: {
          view,
          p: page,
          page_size: pageSize,
          start_timestamp: Math.floor(new Date(applied.start).getTime() / 1000),
          end_timestamp: Math.floor(new Date(applied.end).getTime() / 1000),
          model: applied.model.trim(),
          identifier: applied.identifier.trim(),
          status: applied.status,
          ...(isAdmin
            ? { user_id: applied.user_id, channel_id: applied.channel_id }
            : {}),
        },
      })
      if (!response.data.success || !response.data.data)
        throw new Error(response.data.message || 'Unable to load media logs')
      return response.data.data
    },
    staleTime: 15_000,
  })
  const statusLabel = (status: string) => {
    const labels: Record<string, string> = {
      CONSUME: t('Charged'),
      REFUND: t('Refunded'),
      ERROR: t('Request failed'),
      SUCCESS: t('Succeeded'),
      FAILURE: t('Failed'),
      NOT_START: t('Not started'),
      SUBMITTED: t('Submitted'),
      QUEUED: t('Queued'),
      IN_PROGRESS: t('In progress'),
      UNKNOWN: t('Unknown'),
      MODAL: t('Waiting'),
    }
    return labels[status] || status
  }
  const statusClass = (status: string) => {
    if (status === 'SUCCESS' || status === 'CONSUME')
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
    if (status === 'FAILURE' || status === 'ERROR')
      return 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
    return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const start = new Date(filters.start).getTime(),
      end = new Date(filters.end).getTime()
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end < start ||
      end - start > 93 * 86400000
    ) {
      toast.error(t('Select a valid time range of at most 93 days'))
      return
    }
    setPage(1)
    setApplied({ ...filters })
  }
  const reset = () => {
    const next = defaultFilters()
    setFilters(next)
    setApplied(next)
    setPage(1)
  }
  const changeView = (value: string) => {
    if (value !== 'requests' && value !== 'tasks' && value !== 'midjourney')
      return
    setView(value)
    setPage(1)
    setFilters((f) => ({ ...f, status: '' }))
    setApplied((f) => ({ ...f, status: '' }))
  }
  const rows = query.data?.items || []
  const total = query.data?.summary.total || 0
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const exportPage = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          { kind: props.kind, view, filters: applied, ...query.data },
          null,
          2
        ),
      ],
      { type: 'application/json' }
    )
    const url = URL.createObjectURL(blob),
      anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${props.kind}-logs-page-${page}.json`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const headings = [
    t('Time'),
    t('Model'),
    t('Task / request ID'),
    t('Status'),
    t('Prompt / message'),
    t('Duration'),
    t('Cost'),
    t('Details'),
  ]
  if (isAdmin) headings.splice(2, 0, t('User / channel'))
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {props.kind === 'image' ? t('Image Logs') : t('Video Logs')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <div className='flex gap-2'>
          <Button
            variant='outline'
            size='sm'
            disabled={!rows.length || query.isError}
            onClick={exportPage}
          >
            <Download className='size-4' />
            {t('Export current page')}
          </Button>
          <Button
            variant='outline'
            size='sm'
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className='size-4' />
            {t('Refresh')}
          </Button>
        </div>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='space-y-4' data-media-audit={props.kind}>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Audit image and video requests separately from usage logs. Default: last 7 days; up to 93 days per query.'
            )}
          </p>
          <Tabs value={view} onValueChange={changeView}>
            <TabsList>
              <TabsTrigger value='requests'>{t('Request logs')}</TabsTrigger>
              <TabsTrigger value='tasks'>{t('Generation tasks')}</TabsTrigger>
              <TabsTrigger value='midjourney'>Midjourney</TabsTrigger>
            </TabsList>
          </Tabs>
          <MediaFiltersForm
            filters={filters}
            setFilters={setFilters}
            view={view}
            isAdmin={isAdmin}
            onSubmit={submit}
            onReset={reset}
            statusLabel={statusLabel}
          />
          <div
            className='bg-muted/30 flex flex-wrap gap-x-6 gap-y-2 rounded-lg border p-3 text-sm'
            aria-live='polite'
          >
            <span>
              {t('Total')}: {total}
            </span>
            {view === 'requests' && (
              <>
                <span>
                  {t('Charged')}:{' '}
                  {formatLogQuota(query.data?.summary.charged || 0)}
                </span>
                <span>
                  {t('Refunded')}:{' '}
                  {formatLogQuota(query.data?.summary.refunded || 0)}
                </span>
                <span>
                  {t('Net cost')}:{' '}
                  {formatLogQuota(
                    (query.data?.summary.charged || 0) -
                      (query.data?.summary.refunded || 0)
                  )}
                </span>
                <span>
                  {t('Request failed')}: {query.data?.summary.errors || 0}
                </span>
              </>
            )}
          </div>
          {view === 'requests' && (
            <p className='text-muted-foreground text-xs'>
              {t(
                'Charged means a billing entry, not a completed task. Check generation tasks for the final result and refunds for adjustments.'
              )}
            </p>
          )}
          {query.isError ? (
            <p role='alert' className='text-destructive'>
              {t('Unable to load media logs')}
              <Button variant='link' onClick={() => void query.refetch()}>
                {t('Retry')}
              </Button>
            </p>
          ) : (
            <div className='overflow-x-auto rounded-lg border'>
              <table className='w-full text-sm'>
                <thead className='bg-muted/50 text-left'>
                  <tr>
                    {headings.map((h) => (
                      <th
                        className='px-3 py-3 font-medium whitespace-nowrap'
                        key={h}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {query.isLoading ? (
                    <tr>
                      <td className='px-3 py-6' colSpan={headings.length}>
                        {t('Loading...')}
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td
                        className='text-muted-foreground px-3 py-8 text-center'
                        colSpan={headings.length}
                      >
                        {t('No records')}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr
                        className='border-t align-top'
                        key={row.id}
                        data-record-id={row.id}
                      >
                        <td className='px-3 py-3 whitespace-nowrap'>
                          {formatTimestamp(row.created_at)}
                        </td>
                        <td className='max-w-48 px-3 py-3 break-words'>
                          {row.model || '-'}
                        </td>
                        {isAdmin && (
                          <td className='px-3 py-3'>
                            {row.username || `#${row.user_id}`}
                            <div className='text-muted-foreground text-xs'>
                              {t('Channel ID')}: {row.channel_id || '-'}
                            </div>
                          </td>
                        )}
                        <td className='max-w-64 px-3 py-3 font-mono text-xs break-all'>
                          {row.task_id || row.request_id || row.id}
                        </td>
                        <td className='px-3 py-3'>
                          <span
                            className={`inline-block rounded px-2 py-1 text-xs whitespace-nowrap ${statusClass(row.status)}`}
                          >
                            {statusLabel(row.status)}
                          </span>
                          {row.progress && (
                            <div className='mt-1 text-xs'>{row.progress}</div>
                          )}
                        </td>
                        <td className='max-w-72 px-3 py-3'>
                          <div className='line-clamp-2 break-words whitespace-pre-wrap'>
                            {row.prompt || row.message || '-'}
                          </div>
                        </td>
                        <td className='px-3 py-3 whitespace-nowrap'>
                          {formatUseTime(row.duration)}
                        </td>
                        <td className='px-3 py-3 whitespace-nowrap'>
                          {row.status === 'REFUND' ? '-' : ''}
                          {formatLogQuota(row.quota)}
                        </td>
                        <td className='px-3 py-2'>
                          <Button
                            variant='outline'
                            size='sm'
                            onClick={() => setSelected(row)}
                          >
                            {row.content_url
                              ? t('Preview / details')
                              : t('Details')}
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className='flex flex-wrap items-center justify-between gap-3 text-sm'>
            <label>
              {t('Rows per page')}{' '}
              <select
                className='bg-background rounded border p-1'
                aria-label={t('Rows per page')}
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value))
                  setPage(1)
                }}
              >
                {[20, 50, 100].map((size) => (
                  <option key={size}>{size}</option>
                ))}
              </select>
            </label>
            <div className='flex items-center gap-3'>
              <Button
                variant='outline'
                size='sm'
                disabled={page <= 1 || query.isFetching}
                onClick={() => setPage(page - 1)}
              >
                {t('Previous')}
              </Button>
              <span>
                {t('Page')} {page} / {pages}
              </span>
              <Button
                variant='outline'
                size='sm'
                disabled={page >= pages || query.isFetching}
                onClick={() => setPage(page + 1)}
              >
                {t('Next')}
              </Button>
            </div>
          </div>
        </div>
      </SectionPageLayout.Content>
      {selected && (
        <MediaDetail
          key={selected.id}
          row={selected}
          kind={props.kind}
          onClose={() => setSelected(null)}
          statusLabel={statusLabel}
        />
      )}
    </SectionPageLayout>
  )
}
