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
import { useState } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  Archive,
  ArchiveRestore,
  Check,
  Download,
  Ellipsis,
  Pencil,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/use-debounce'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  deleteConversation,
  getConversations,
  renameConversation,
  setConversationArchive,
} from './api'
import { exportConversation, type ExportLabels } from './export'
import {
  clockTime,
  dayGroup,
  relativeTime,
  secondsNow,
  type DayGroup,
} from './time'
import type { Conversation } from './types'

const GROUP_LABELS: Record<DayGroup, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'Previous 7 days',
  earlier: 'Earlier',
}

function groupConversations(items: Conversation[], now: number) {
  const groups: { key: DayGroup; items: Conversation[] }[] = []
  for (const item of items) {
    const key = dayGroup(item.updated, now)
    const last = groups.at(-1)
    if (last?.key === key) last.items.push(item)
    else groups.push({ key, items: [item] })
  }
  return groups
}

export function Conversations(props: {
  userId: number
  current: string
  unread: Set<string>
  busy: boolean
  exportLabels: ExportLabels
  onSelect: (id: string) => void
  onRemoved: () => void
  onChanged: (id: string) => void
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [now] = useState(secondsNow)
  const [search, setSearch] = useState('')
  const query = useDebounce(search.trim(), 300)
  const [archived, setArchived] = useState(false)
  const [editing, setEditing] = useState('')
  const [title, setTitle] = useState('')
  const [deleting, setDeleting] = useState('')
  const [exporting, setExporting] = useState('')
  const list = useInfiniteQuery({
    queryKey: ['support-conversations', props.userId, archived, query],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getConversations(archived, query, pageParam),
    getNextPageParam: (last) => last.next_offset ?? undefined,
  })
  const change = useMutation({
    mutationFn: async (input: { id: string; op: string }) => {
      if (input.op === 'rename')
        return renameConversation(input.id, title.trim())
      if (input.op === 'archive')
        return setConversationArchive(input.id, !archived)
      return deleteConversation(input.id)
    },
    onSuccess: (_, input) => {
      setEditing('')
      setDeleting('')
      props.onChanged(input.id)
      void qc.invalidateQueries({
        queryKey: ['support-conversations', props.userId],
      })
      if (input.op !== 'rename') {
        qc.removeQueries({
          queryKey: ['support-history', props.userId, input.id],
        })
        if (input.id === props.current) props.onRemoved()
      }
    },
  })
  const download = (item: Conversation) => {
    setExporting(item.conversation)
    exportConversation(item.conversation, item.title, props.exportLabels)
      .catch(() =>
        toast.error(t('Unable to export this conversation. Please retry.'))
      )
      .finally(() => setExporting(''))
  }
  const items = list.data?.pages.flatMap((page) => page.items) ?? []
  return (
    <div id='support-history' className='agent-history'>
      <div className='agent-history-tools'>
        <label className='agent-history-search'>
          <Search className='size-3.5 shrink-0' />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={120}
            placeholder={t('Search titles or messages')}
            aria-label={t('Search titles or messages')}
          />
          {search && (
            <button
              type='button'
              aria-label={t('Clear')}
              onClick={() => setSearch('')}
            >
              <X className='size-3' />
            </button>
          )}
        </label>
        <Button
          size='sm'
          variant={archived ? 'secondary' : 'ghost'}
          aria-pressed={archived}
          onClick={() => setArchived(!archived)}
        >
          <Archive className='size-3.5' />
          {t('Archived')}
        </Button>
      </div>
      <div className='agent-history-list'>
        {list.isLoading && (
          <p className='agent-history-empty'>{t('Loading...')}</p>
        )}
        {list.isError && (
          <Button
            variant='ghost'
            size='sm'
            onClick={() => {
              void list.refetch()
            }}
          >
            {t('Retry')}
          </Button>
        )}
        {!list.isLoading && !list.isError && items.length === 0 && (
          <p className='agent-history-empty'>
            {query
              ? t('No conversations match your search')
              : archived
                ? t('No archived conversations')
                : t('No saved conversations yet')}
          </p>
        )}
        {groupConversations(items, now).map((group) => (
          <section key={group.key} className='agent-history-group'>
            <h4>{t(GROUP_LABELS[group.key])}</h4>
            <ul>
              {group.items.map((item) => {
                const active = item.conversation === props.current
                const unread = props.unread.has(item.conversation)
                return (
                  <li
                    key={item.conversation}
                    className={cn('agent-history-item', active && 'is-active')}
                  >
                    {editing === item.conversation ? (
                      <form
                        className='agent-history-rename'
                        onSubmit={(event) => {
                          event.preventDefault()
                          change.mutate({ id: item.conversation, op: 'rename' })
                        }}
                      >
                        <input
                          className='agent-history-edit'
                          aria-label={t('Conversation title')}
                          value={title}
                          maxLength={120}
                          autoFocus
                          onChange={(event) => setTitle(event.target.value)}
                        />
                        <Button
                          type='submit'
                          size='icon-xs'
                          variant='ghost'
                          disabled={!title.trim() || change.isPending}
                          aria-label={t('Save')}
                        >
                          <Check className='size-3.5' />
                        </Button>
                        <Button
                          type='button'
                          size='icon-xs'
                          variant='ghost'
                          onClick={() => setEditing('')}
                          aria-label={t('Cancel')}
                        >
                          <X className='size-3.5' />
                        </Button>
                      </form>
                    ) : (
                      <button
                        type='button'
                        className='agent-history-open'
                        aria-current={active || undefined}
                        disabled={props.busy && !active}
                        onClick={() => props.onSelect(item.conversation)}
                      >
                        <span className='agent-history-title'>
                          {unread && (
                            <span
                              className='agent-unread-dot'
                              aria-label={t('New reply')}
                            />
                          )}
                          <strong>{item.title}</strong>
                          <time>
                            {group.key === 'today'
                              ? clockTime(item.updated, i18n.language)
                              : relativeTime(item.updated, now, i18n.language)}
                          </time>
                        </span>
                        <small>
                          {item.last_question === ''
                            ? t('The support team replied')
                            : item.last_question}
                        </small>
                      </button>
                    )}
                    {editing !== item.conversation && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              size='icon-xs'
                              variant='ghost'
                              className='agent-row-menu'
                              aria-label={t('More actions')}
                            />
                          }
                        >
                          <Ellipsis className='size-3.5' />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end' className='w-40'>
                          <DropdownMenuItem
                            disabled={change.isPending}
                            onClick={() => {
                              setEditing(item.conversation)
                              setTitle(item.title)
                            }}
                          >
                            <Pencil />
                            {t('Rename')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={props.busy || change.isPending}
                            onClick={() =>
                              change.mutate({
                                id: item.conversation,
                                op: 'archive',
                              })
                            }
                          >
                            {archived ? <ArchiveRestore /> : <Archive />}
                            {archived ? t('Restore') : t('Archive')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!!exporting}
                            onClick={() => download(item)}
                          >
                            <Download />
                            {t('Export conversation')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant='destructive'
                            disabled={props.busy || change.isPending}
                            onClick={() => setDeleting(item.conversation)}
                          >
                            <Trash2 />
                            {t('Delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {deleting === item.conversation && (
                      <div className='agent-history-confirm' role='alert'>
                        <p>{t('Delete this conversation permanently?')}</p>
                        <p className='text-muted-foreground'>
                          {t(
                            'Open support tickets are retained for service follow-up.'
                          )}
                        </p>
                        <div className='mt-2 flex gap-2'>
                          <Button
                            size='sm'
                            variant='destructive'
                            disabled={change.isPending}
                            onClick={() =>
                              change.mutate({
                                id: item.conversation,
                                op: 'delete',
                              })
                            }
                          >
                            {t('Confirm delete')}
                          </Button>
                          <Button
                            size='sm'
                            variant='ghost'
                            onClick={() => setDeleting('')}
                          >
                            {t('Cancel')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
        {list.hasNextPage && (
          <Button
            size='sm'
            variant='ghost'
            disabled={list.isFetchingNextPage}
            onClick={() => {
              void list.fetchNextPage()
            }}
          >
            {t('Load more')}
          </Button>
        )}
      </div>
      <p className='agent-history-note'>
        {t(
          'Conversation content and tool records are retained for 30 days. Export records you want to keep.'
        )}
      </p>
    </div>
  )
}
