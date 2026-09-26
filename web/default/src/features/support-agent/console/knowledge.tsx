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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { FilePlus2, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { getKnowledge, getKnowledgeDocument, saveKnowledge } from '../api'
import type { Knowledge } from '../types'

export type KnowledgeDraft = { key: string; title: string; content: string }

type Filter = 'all' | 'customer' | 'internal' | 'tickets' | 'expired'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'customer', label: 'Published' },
  { value: 'internal', label: 'Internal drafts' },
  { value: 'tickets', label: 'Ticket drafts' },
  { value: 'expired', label: 'Expired' },
]

const expired = (doc: Knowledge, now: number) =>
  doc.expires > 0 && doc.expires * 1000 < now

function matches(doc: Knowledge, filter: Filter, now: number) {
  if (filter === 'customer')
    return doc.audience === 'customer' && !expired(doc, now)
  if (filter === 'internal') return doc.audience !== 'customer'
  if (filter === 'tickets')
    return doc.id.startsWith('handoff-') && doc.audience !== 'customer'
  if (filter === 'expired') return expired(doc, now)
  return true
}

function stateLabel(doc: Knowledge, now: number, t: TFunction) {
  if (expired(doc, now)) return t('Expired')
  if (doc.audience === 'customer') return t('Published')
  return doc.id.startsWith('handoff-') ? t('Ticket draft') : t('Internal draft')
}

// Dates are chosen as days; a document stays valid until the end of that day.
const toDateInput = (seconds: number) =>
  seconds > 0 ? new Date(seconds * 1000).toISOString().slice(0, 10) : ''
const fromDateInput = (value: string) =>
  value ? Math.floor(new Date(`${value}T23:59:59`).getTime() / 1000) : 0

type Editing = {
  id: string
  title: string
  source: string
  audience: string
  content: string
  expires: number
}
const EMPTY: Editing = {
  id: '',
  title: '',
  source: '',
  audience: 'internal',
  content: '',
  expires: 0,
}

export function ConsoleKnowledge(props: { draft: KnowledgeDraft | null }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const list = useQuery({
    queryKey: ['support-knowledge'],
    queryFn: getKnowledge,
  })
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Editing>(EMPTY)
  const [preview, setPreview] = useState(false)
  const [now] = useState(() => Date.now())
  // A draft handed over from "Answers to improve" replaces the editor once.
  const [draftKey, setDraftKey] = useState('')
  if (props.draft && props.draft.key !== draftKey) {
    setDraftKey(props.draft.key)
    setEditing({
      ...EMPTY,
      title: props.draft.title,
      content: props.draft.content,
    })
    setPreview(false)
  }
  const open = useMutation({
    mutationFn: getKnowledgeDocument,
    onSuccess: (doc) => {
      setEditing({
        id: doc.id,
        title: doc.title,
        source: doc.source,
        audience: doc.audience,
        content: doc.content,
        expires: doc.expires,
      })
      setPreview(false)
    },
    onError: () => toast.error(t('Unable to open this knowledge draft.')),
  })
  const save = useMutation({
    mutationFn: () =>
      saveKnowledge({
        ...editing,
        id: editing.id || crypto.randomUUID(),
      }),
    onSuccess: (result) => {
      toast.success(
        t(
          editing.audience === 'customer'
            ? 'Knowledge published'
            : 'Knowledge draft saved'
        )
      )
      setEditing((value) => ({ ...value, id: result.id || value.id }))
      void qc.invalidateQueries({ queryKey: ['support-knowledge'] })
    },
    onError: () =>
      toast.error(t('Unable to index document. Remove secrets and retry.')),
  })
  const docs = (list.data?.items ?? [])
    .filter(
      (doc) =>
        matches(doc, filter, now) &&
        (!query.trim() ||
          `${doc.title} ${doc.source}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()))
    )
    .sort((a, b) => b.updated - a.updated)
  const set = (patch: Partial<Editing>) =>
    setEditing((value) => ({ ...value, ...patch }))
  return (
    <div className='sc-split'>
      <section className='sc-list' aria-label={t('Knowledge')}>
        <div className='sc-filters' role='group' aria-label={t('Status')}>
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type='button'
              aria-pressed={filter === item.value}
              className={cn('sc-chip', filter === item.value && 'is-on')}
              onClick={() => setFilter(item.value)}
            >
              {t(item.label)}
            </button>
          ))}
        </div>
        <label className='sc-search'>
          <Search className='size-4 shrink-0' />
          <input
            value={query}
            placeholder={t('Search titles or paths')}
            aria-label={t('Search titles or paths')}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <Button
          size='sm'
          variant='outline'
          className='w-full'
          onClick={() => {
            setEditing(EMPTY)
            setPreview(false)
          }}
        >
          <FilePlus2 className='size-3.5' />
          {t('New document')}
        </Button>
        {list.isError && (
          <p role='alert' className='sc-muted'>
            {t('Unable to load the knowledge base.')}
          </p>
        )}
        {!list.isLoading && !docs.length && (
          <p className='sc-empty'>{t('No documents here.')}</p>
        )}
        <ul>
          {docs.map((doc) => (
            <li key={doc.id}>
              <button
                type='button'
                className={cn('sc-row', editing.id === doc.id && 'is-on')}
                aria-current={editing.id === doc.id || undefined}
                // One document at a time, so the editor shows the last one picked.
                disabled={open.isPending}
                onClick={() => open.mutate(doc.id)}
              >
                <span className='sc-row-head'>
                  <strong>{doc.title}</strong>
                  <span
                    className='sc-status'
                    data-status={
                      expired(doc, now)
                        ? 'expired'
                        : doc.audience === 'customer'
                          ? 'published'
                          : 'draft'
                    }
                  >
                    {stateLabel(doc, now, t)}
                  </span>
                </span>
                <span className='sc-muted'>
                  {[
                    doc.source,
                    new Date(doc.updated * 1000).toLocaleDateString(),
                    doc.expires > 0 &&
                      t('Valid until {{date}}', {
                        date: toDateInput(doc.expires),
                      }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <form
        className='sc-detail sc-editor'
        aria-label={t('Knowledge editor')}
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <p className='sc-muted'>
          {editing.id ? t('Editing an existing document') : t('New document')}
          {' · '}
          {t(
            'Only published documents are used in answers to customers; drafts stay private.'
          )}
        </p>
        {editing.id.startsWith('handoff-') &&
          editing.audience !== 'customer' && (
            <p className='sc-warning'>
              {t(
                'This ticket draft stays private until you review and publish it. Remove any remaining personal or account-specific details first.'
              )}
            </p>
          )}
        <label>
          <span>{t('Document title')}</span>
          <input
            required
            maxLength={200}
            value={editing.title}
            onChange={(event) => set({ title: event.target.value })}
          />
        </label>
        <div className='sc-editor-row'>
          <label>
            <span>{t('Visibility')}</span>
            <select
              value={editing.audience}
              onChange={(event) => set({ audience: event.target.value })}
            >
              <option value='internal'>{t('Internal draft')}</option>
              <option value='customer'>
                {t('Reviewed customer knowledge')}
              </option>
            </select>
          </label>
          <label>
            <span>{t('Related page')}</span>
            <input
              maxLength={200}
              pattern='/[a-zA-Z0-9\/_\-]*'
              placeholder='/docs'
              value={editing.source}
              onChange={(event) => set({ source: event.target.value })}
            />
          </label>
          <label>
            <span>{t('Valid until')}</span>
            <input
              type='date'
              value={toDateInput(editing.expires)}
              onChange={(event) =>
                set({ expires: fromDateInput(event.target.value) })
              }
            />
          </label>
        </div>
        <div className='sc-editor-tabs' role='group'>
          <button
            type='button'
            aria-pressed={!preview}
            className={cn('sc-chip', !preview && 'is-on')}
            onClick={() => setPreview(false)}
          >
            {t('Write')}
          </button>
          <button
            type='button'
            aria-pressed={preview}
            className={cn('sc-chip', preview && 'is-on')}
            onClick={() => setPreview(true)}
          >
            {t('Preview')}
          </button>
        </div>
        {preview ? (
          <div className='sc-preview agent-markdown'>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {editing.content || t('Nothing to preview yet.')}
            </ReactMarkdown>
          </div>
        ) : (
          <textarea
            required
            rows={18}
            maxLength={100000}
            aria-label={t('Document content')}
            value={editing.content}
            onChange={(event) => set({ content: event.target.value })}
          />
        )}
        <div className='sc-actions'>
          <span className='sc-muted'>
            {t('{{count}} characters', { count: editing.content.length })}
          </span>
          <Button
            type='submit'
            size='sm'
            disabled={
              save.isPending || !editing.title.trim() || !editing.content.trim()
            }
          >
            {save.isPending
              ? t('Indexing…')
              : editing.audience === 'customer'
                ? t('Publish reviewed knowledge')
                : t('Save draft')}
          </Button>
        </div>
      </form>
    </div>
  )
}
