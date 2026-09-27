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
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { BookOpen, Headset, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { contextList } from '../account-context'
import {
  getHandoffContext,
  getKnowledge,
  getKnowledgeDocument,
  replyHandoff,
  resolveHandoff,
} from '../api'
import { useHandoffQueue } from '../queue'
import { useSupportSettings } from '../settings'
import type { Handoff, ServiceHours, Workflow } from '../types'
import { statusLabel, when } from './labels'
import { hoursAndMinutes, replyDeadline } from './sla'

type Filter = 'pending' | 'replied' | 'resolved' | 'all'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'pending', label: 'Waiting for a reply' },
  { value: 'replied', label: 'Waiting for the user' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
]
type Channel = 'all' | 'site' | 'wechat'
const CHANNELS: { value: Channel; label: string }[] = [
  { value: 'all', label: 'All channels' },
  { value: 'site', label: 'Website' },
  { value: 'wechat', label: 'WeChat' },
]
const DAY = 86400 * 1000
const REPLY_LIMIT = 4000
const SNIPPET_LIMIT = 1500

const siteUserId = (item: Handoff) => item.principal.match(/^web:(\d+)$/)?.[1]
const channelOf = (item: Handoff): Channel =>
  siteUserId(item) ? 'site' : 'wechat'

function requesterName(item: Handoff, t: TFunction) {
  const id = siteUserId(item)
  return (
    item.requester?.username ||
    (id ? t('Site user {{id}}', { id }) : t('SightFlow / WeChat'))
  )
}

// The remaining-time labels move on their own between queue refreshes.
function useNow(interval = 30000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), interval)
    return () => window.clearInterval(timer)
  }, [interval])
  return now
}

// Time left before the promised reply time (service hours only), or how late it is.
function DueLabel(props: { item: Handoff; hours: ServiceHours; now: number }) {
  const { t } = useTranslation()
  if (props.item.status !== 'pending') return null
  const left = replyDeadline(props.item.created, props.hours) - props.now
  const time = hoursAndMinutes(left)
  return (
    <span className='sc-due' data-overdue={left < 0 || undefined}>
      {left < 0
        ? t('Overdue by {{time}}', { time })
        : t('{{time}} left', { time })}
    </span>
  )
}

function accountDetails(item: Handoff, now: number, t: TFunction) {
  const account = item.requester
  if (!siteUserId(item)) return item.principal
  return [
    `${t('User ID')}: ${account?.id ?? siteUserId(item)}`,
    account?.email,
    account?.quota !== undefined &&
      `${t('Balance')} ${formatQuota(account.quota)}`,
    account?.created_at &&
      t('Registered {{count}} days ago', {
        count: Math.max(0, Math.floor((now - account.created_at * 1000) / DAY)),
      }),
  ]
    .filter(Boolean)
    .join(' · ')
}

// The conversation the ticket came from, so the reply can build on it.
function TicketContext(props: { id: string }) {
  const { t, i18n } = useTranslation()
  const context = useQuery({
    queryKey: ['support-ticket-context', props.id],
    queryFn: () => getHandoffContext(props.id),
  })
  if (context.isLoading)
    return <p className='sc-muted'>{t('Loading the conversation…')}</p>
  if (context.isError)
    return <p className='sc-muted'>{t('Unable to load the conversation.')}</p>
  const turns = context.data?.turns ?? []
  if (!turns.length) return null
  return (
    <details className='sc-context'>
      <summary>
        {t('Conversation history ({{count}} turns)', { count: turns.length })}
      </summary>
      <ol>
        {turns.map((turn) => (
          <li key={turn.id} data-human={turn.human_reply || undefined}>
            {turn.question && (
              <p className='sc-context-question'>{turn.question}</p>
            )}
            {!!turn.context_kinds?.length && (
              <p className='sc-muted sc-context-shared'>
                {t('The user shared: {{kinds}} (not kept)', {
                  kinds: contextList(turn.context_kinds, t, i18n.language),
                })}
              </p>
            )}
            <p className='sc-context-answer'>
              {turn.human_reply && <strong>{t('Support team')}: </strong>}
              {turn.answer}
            </p>
            {turn.sources.length > 0 && (
              <p className='sc-muted'>
                {t('Sources')}: {turn.sources.join('、')}
              </p>
            )}
          </li>
        ))}
      </ol>
    </details>
  )
}

// Published knowledge, dropped into the reply as a starting point.
function KnowledgeInsert(props: { onInsert: (text: string) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [now] = useState(() => Date.now())
  const list = useQuery({
    queryKey: ['support-knowledge'],
    queryFn: getKnowledge,
    enabled: open,
  })
  const pick = useMutation({
    mutationFn: getKnowledgeDocument,
    onSuccess: (doc) => {
      props.onInsert(
        doc.content
          .replace(/^#\s[^\n]*\n+/, '')
          .trim()
          .slice(0, SNIPPET_LIMIT)
      )
      setOpen(false)
    },
    onError: () => toast.error(t('Unable to open this knowledge draft.')),
  })
  const needle = query.trim().toLowerCase()
  const docs = (list.data?.items ?? [])
    .filter(
      (doc) =>
        doc.audience === 'customer' &&
        !(doc.expires > 0 && doc.expires * 1000 < now) &&
        (!needle || doc.title.toLowerCase().includes(needle))
    )
    .slice(0, 8)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button type='button' size='sm' variant='ghost' />}
      >
        <BookOpen className='size-3.5' />
        {t('Insert knowledge')}
      </PopoverTrigger>
      <PopoverContent align='start' className='sc-insert w-80'>
        <label className='sc-search'>
          <Search className='size-4 shrink-0' />
          <input
            value={query}
            placeholder={t('Search published knowledge')}
            aria-label={t('Search published knowledge')}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {list.isLoading && <p className='sc-muted'>{t('Loading…')}</p>}
        {!list.isLoading && !docs.length && (
          <p className='sc-muted'>{t('No published knowledge matches.')}</p>
        )}
        <ul>
          {docs.map((doc) => (
            <li key={doc.id}>
              <button
                type='button'
                disabled={pick.isPending}
                onClick={() => pick.mutate(doc.id)}
              >
                {doc.title}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

type Reply = { id: string; replyId: string; message: string; draft: boolean }

function useReplyActions(events: {
  onReplied: (id: string) => void
  onResolved: (id: string) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  // One ID per ticket until the reply is saved, so a retry never sends it twice.
  const replyIds = useRef(new Map<string, string>())
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [emailRetries, setEmailRetries] = useState<Record<string, Reply>>({})
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['support-handoffs'] })
    void qc.invalidateQueries({ queryKey: ['support-console-overview'] })
    void qc.invalidateQueries({ queryKey: ['support-knowledge'] })
  }
  const reply = useMutation({
    mutationFn: replyHandoff,
    onSuccess: (result, value) => {
      replyIds.current.delete(value.id)
      setDrafts((items) => ({ ...items, [value.id]: '' }))
      events.onReplied(value.id)
      // The reply is now the last turn of the ticket's conversation.
      void qc.invalidateQueries({
        queryKey: ['support-ticket-context', value.id],
      })
      // Show the answered state now rather than after the queue reloads.
      qc.setQueriesData<{ items: Handoff[]; workflow: Workflow }>(
        { queryKey: ['support-handoffs'] },
        (data) =>
          data && {
            ...data,
            items: data.items.map((item) =>
              item.id === value.id
                ? {
                    ...item,
                    status: result.status || 'replied',
                    reply: value.message,
                    knowledge_draft_id: result.knowledge_draft_id || undefined,
                  }
                : item
            ),
          }
      )
      refresh()
      if (result.email_status === 'failed') {
        setEmailRetries((items) => ({ ...items, [value.id]: value }))
        toast.warning(
          t(
            'Reply saved, but the email could not be sent. Retry it from this ticket.'
          )
        )
        return
      }
      setEmailRetries((items) =>
        Object.fromEntries(
          Object.entries(items).filter(([id]) => id !== value.id)
        )
      )
      if (result.email_sent) toast.success(t('Reply saved and email sent.'))
      else if (result.email_status === 'no_email')
        toast.warning(t('Reply saved, but this account has no email address.'))
      else if (result.email_status === 'queued')
        toast.success(t('Reply saved. Email is in the delivery queue.'))
      else if (result.email_status === 'not_applicable')
        toast.success(
          result.knowledge_draft_id
            ? t(
                'Handling notes saved; an internal knowledge draft is ready for review.'
              )
            : t('Handling notes saved.')
        )
      else toast.success(t('Reply saved.'))
    },
    onError: () =>
      toast.error(
        t('Could not save reply. Your draft is still here; please retry.')
      ),
  })
  const resolve = useMutation({
    mutationFn: resolveHandoff,
    onSuccess: (_, id) => {
      events.onResolved(id)
      refresh()
    },
  })
  const send = (id: string, draft: boolean) => {
    const message = (drafts[id] || '').trim()
    if (!message) return
    let replyId = replyIds.current.get(id)
    if (!replyId) {
      replyId = crypto.randomUUID()
      replyIds.current.set(id, replyId)
    }
    reply.mutate({ id, replyId, message, draft })
  }
  const append = (id: string, text: string) =>
    setDrafts((items) => {
      const current = (items[id] || '').trimEnd()
      const next = current ? `${current}\n\n${text}` : text
      return { ...items, [id]: next.slice(0, REPLY_LIMIT) }
    })
  return { reply, resolve, drafts, setDrafts, emailRetries, send, append }
}

function TicketDetail(props: {
  item: Handoff
  actions: ReturnType<typeof useReplyActions>
  hours: ServiceHours
  now: number
}) {
  const { t } = useTranslation()
  const { item, actions } = props
  const siteTicket = Boolean(siteUserId(item))
  const [keepDraft, setKeepDraft] = useState(true)
  const text = actions.drafts[item.id] || ''
  // Busy states belong to this ticket; others stay usable meanwhile.
  const saving =
    actions.reply.isPending && actions.reply.variables?.id === item.id
  const closing =
    actions.resolve.isPending && actions.resolve.variables === item.id
  const retry = actions.emailRetries[item.id]
  return (
    <article className='sc-detail' aria-label={t('Ticket')}>
      <header className='sc-detail-head'>
        <div className='min-w-0'>
          <strong className='sc-detail-name'>{requesterName(item, t)}</strong>
          <p className='sc-muted'>{accountDetails(item, props.now, t)}</p>
        </div>
        <div className='sc-detail-meta'>
          <span className='sc-status' data-status={item.status}>
            {statusLabel(item.status, t)}
          </span>
          <DueLabel item={item} hours={props.hours} now={props.now} />
          <time className='sc-muted'>{when(item.created)}</time>
        </div>
      </header>
      <p className='sc-question'>{item.question}</p>
      <p className='sc-muted'>{item.reason}</p>
      {siteTicket && <TicketContext id={item.id} />}
      {item.status === 'pending' && (
        <form
          className='sc-reply'
          onSubmit={(event) => {
            event.preventDefault()
            actions.send(item.id, keepDraft)
          }}
        >
          <label>
            <span>
              {siteTicket ? t('Reply to the user') : t('Handling notes')}
            </span>
            <textarea
              rows={5}
              maxLength={REPLY_LIMIT}
              value={text}
              onChange={(event) =>
                actions.setDrafts((items) => ({
                  ...items,
                  [item.id]: event.target.value,
                }))
              }
              placeholder={
                siteTicket
                  ? t('Write a clear, personal reply.')
                  : t(
                      'Reply in the WeChat conversation first, then record what solved it.'
                    )
              }
            />
          </label>
          <p className='sc-muted'>
            {siteTicket
              ? t(
                  'The reply will appear in the original assistant conversation, and a service email will be queued for delivery.'
                )
              : t(
                  'For WeChat tickets, send the customer response in SightFlow first.'
                )}
          </p>
          <div className='sc-actions'>
            <KnowledgeInsert
              onInsert={(value) => actions.append(item.id, value)}
            />
            <label className='sc-check'>
              <input
                type='checkbox'
                checked={keepDraft}
                onChange={(event) => setKeepDraft(event.target.checked)}
              />
              <span>{t('Also save as a knowledge draft')}</span>
            </label>
            <span className='sc-spacer' />
            <Button
              type='button'
              size='sm'
              variant='ghost'
              disabled={closing || saving}
              onClick={() => actions.resolve.mutate(item.id)}
            >
              {t('Close without replying')}
            </Button>
            <Button
              type='submit'
              size='sm'
              disabled={!text.trim() || saving || closing}
              aria-busy={saving}
            >
              {saving
                ? t('Saving…')
                : siteTicket
                  ? t('Reply and email')
                  : t('Save handling notes')}
            </Button>
          </div>
        </form>
      )}
      {item.status === 'replied' && (
        <div className='sc-replied'>
          {item.reply && <p className='sc-reply-text'>{item.reply}</p>}
          <div className='sc-actions'>
            <span className='sc-muted'>
              {item.knowledge_draft_id
                ? t('Replied · knowledge draft created')
                : t('Replied')}
            </span>
            {retry && (
              <Button
                size='sm'
                variant='outline'
                disabled={saving}
                onClick={() => actions.reply.mutate(retry)}
              >
                {t('Retry email')}
              </Button>
            )}
            <Button
              size='sm'
              variant='outline'
              disabled={closing}
              onClick={() => actions.resolve.mutate(item.id)}
            >
              {t('Close ticket')}
            </Button>
          </div>
        </div>
      )}
    </article>
  )
}

function Chips<T extends string>(props: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  const { t } = useTranslation()
  return (
    <div className='sc-filters' role='group' aria-label={props.label}>
      {props.options.map((option) => (
        <button
          key={option.value}
          type='button'
          aria-pressed={props.value === option.value}
          className={cn('sc-chip', props.value === option.value && 'is-on')}
          onClick={() => props.onChange(option.value)}
        >
          {t(option.label)}
        </button>
      ))}
    </div>
  )
}

export function ConsoleTickets() {
  const { t } = useTranslation()
  const queue = useHandoffQueue()
  const hours = useSupportSettings().service_hours
  const now = useNow()
  const [filter, setFilter] = useState<Filter>('pending')
  const [channel, setChannel] = useState<Channel>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('')
  // A ticket that was just answered leaves "Waiting for a reply" but stays
  // open, so a failed email can be retried right there.
  const [pinned, setPinned] = useState('')
  const actions = useReplyActions({
    onReplied: setPinned,
    // A closed ticket needs nothing more; move on unless closed ones are listed.
    onResolved: (id) => {
      setPinned((value) => (value === id ? '' : value))
      if (filter !== 'all' && filter !== 'resolved')
        setSelected((value) => (value === id ? '' : value))
    },
  })
  const all = queue.data?.items ?? []
  const needle = query.trim().toLowerCase()
  const items = all.filter(
    (item) =>
      (filter === 'all' || item.status === filter) &&
      (channel === 'all' || channelOf(item) === channel) &&
      (!needle ||
        `${item.question} ${requesterName(item, t)} ${item.requester?.email ?? ''}`
          .toLowerCase()
          .includes(needle))
  )
  const current =
    items.find((item) => item.id === selected) ??
    all.find((item) => item.id === pinned) ??
    items[0]
  return (
    <div className='sc-split'>
      <section className='sc-list' aria-label={t('Tickets')}>
        <Chips
          label={t('Status')}
          options={FILTERS}
          value={filter}
          onChange={(value) => {
            setFilter(value)
            setPinned('')
          }}
        />
        <Chips
          label={t('Channel')}
          options={CHANNELS}
          value={channel}
          onChange={(value) => {
            setChannel(value)
            setPinned('')
          }}
        />
        <label className='sc-search'>
          <Search className='size-4 shrink-0' />
          <input
            value={query}
            placeholder={t('Search questions or users')}
            aria-label={t('Search questions or users')}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {queue.isError && (
          <p role='alert' className='sc-muted'>
            {t('Unable to load queue')}
          </p>
        )}
        {!queue.isLoading && !items.length && (
          <p className='sc-empty'>{t('No tickets here.')}</p>
        )}
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <button
                type='button'
                className={cn('sc-row', current?.id === item.id && 'is-on')}
                aria-current={current?.id === item.id || undefined}
                onClick={() => {
                  setSelected(item.id)
                  setPinned('')
                }}
              >
                <span className='sc-row-head'>
                  <strong>{requesterName(item, t)}</strong>
                  <span className='sc-channel' data-channel={channelOf(item)}>
                    {channelOf(item) === 'site' ? t('Website') : t('WeChat')}
                  </span>
                  <span className='sc-status' data-status={item.status}>
                    {statusLabel(item.status, t)}
                  </span>
                </span>
                <span className='sc-row-text'>{item.question}</span>
                <span className='sc-row-foot'>
                  <time className='sc-muted'>{when(item.created)}</time>
                  <DueLabel item={item} hours={hours} now={now} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {current ? (
        <TicketDetail
          key={current.id}
          item={current}
          actions={actions}
          hours={hours}
          now={now}
        />
      ) : (
        <div className='sc-detail sc-placeholder'>
          <Headset className='size-6' />
          <p>{t('Pick a ticket to read and reply.')}</p>
        </div>
      )}
    </div>
  )
}
