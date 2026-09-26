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
import { useQuery } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { Download, FilePlus2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { getUnresolved } from '../api'
import { downloadFile } from '../export'
import type { UnresolvedCluster, UnresolvedItem } from '../types'
import type { KnowledgeDraft } from './knowledge'
import { reasonLabel, statusLabel, when } from './labels'

type Kind = 'all' | 'ticket' | 'disliked'
const PERIODS = [7, 30]
const DRAFT_QUESTIONS = 20
const DRAFT_EXAMPLES = 5
const BOM = String.fromCharCode(0xfeff)

const kindLabel = (item: UnresolvedItem, t: TFunction) =>
  item.kind === 'ticket' ? t('Ticket') : t('Disliked answer')

function itemNote(item: UnresolvedItem, t: TFunction) {
  return item.kind === 'ticket'
    ? [statusLabel(item.status, t), item.reason].filter(Boolean).join(' · ')
    : reasonLabel(item.reason, t)
}

// A private draft: the editor writes the answer that should have been given,
// using what people asked and what the support team replied.
function draftFrom(cluster: UnresolvedCluster, t: TFunction): KnowledgeDraft {
  const title = cluster.title.replace(/\s+/g, ' ').slice(0, 80)
  const questions = [
    ...new Set(
      cluster.items
        .map((item) => item.question.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
    ),
  ].slice(0, DRAFT_QUESTIONS)
  const replies = cluster.items
    .filter((item) => item.reply)
    .slice(0, DRAFT_EXAMPLES)
  const answers = cluster.items
    .filter((item) => item.kind === 'disliked' && item.answer)
    .slice(0, DRAFT_EXAMPLES)
  const parts = [
    `# ${title}`,
    '## 应当给出的回答',
    '（在这里写出正确、可复用的答复；发布前删除下面的参考材料。）',
    `## 用户的问法（${questions.length} 条）`,
    questions.map((question) => `- ${question}`).join('\n'),
  ]
  if (replies.length)
    parts.push(
      '## 客服的回复',
      ...replies.map((item, index) => `### 回复 ${index + 1}\n\n${item.reply}`)
    )
  if (answers.length)
    parts.push(
      '## 被点踩的原回答',
      ...answers.map(
        (item) => `### 原因：${reasonLabel(item.reason, t)}\n\n${item.answer}`
      )
    )
  return {
    key: `${cluster.id}-${Date.now()}`,
    title,
    content: `${parts.join('\n\n')}\n`,
  }
}

// Spreadsheet-safe: quoted, and text that starts like a formula is kept as text.
const cell = (value: string) =>
  `"${(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`

function exportCsv(clusters: UnresolvedCluster[], days: number, t: TFunction) {
  const header = [
    t('Topic'),
    t('Type'),
    t('Time'),
    t('Question'),
    t('Reason or status'),
    t('Support reply'),
    t('Original answer'),
  ]
  const rows = clusters.flatMap((cluster) =>
    cluster.items.map((item) => [
      cluster.title,
      kindLabel(item, t),
      when(item.created),
      item.question,
      itemNote(item, t),
      item.reply ?? '',
      item.answer ?? '',
    ])
  )
  const csv = [header, ...rows]
    .map((row) => row.map(cell).join(','))
    .join('\r\n')
  const day = new Date().toISOString().slice(0, 10)
  downloadFile(
    `synthapi-unresolved-${days}d-${day}.csv`,
    // The byte-order mark makes Excel read the file as UTF-8.
    `${BOM}${csv}\r\n`,
    'text/csv;charset=utf-8'
  )
}

function ClusterCard(props: {
  cluster: UnresolvedCluster
  onDraft: (draft: KnowledgeDraft) => void
}) {
  const { t } = useTranslation()
  const { cluster } = props
  return (
    <li className='sc-card sc-cluster'>
      <div className='sc-card-head'>
        <strong className='sc-question'>{cluster.title}</strong>
        <span className='sc-times'>
          {t('{{count}} times', { count: cluster.count })}
        </span>
      </div>
      <p className='sc-muted'>
        {[
          cluster.tickets > 0 &&
            t('{{count}} tickets', { count: cluster.tickets }),
          cluster.disliked > 0 &&
            t('{{count}} disliked answers', { count: cluster.disliked }),
          t('Latest {{time}}', { time: when(cluster.latest) }),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <details className='sc-cluster-items'>
        <summary>
          {t('Show the questions ({{count}})', { count: cluster.count })}
        </summary>
        <ul>
          {cluster.items.map((item) => (
            <li key={`${item.kind}-${item.id}`} data-kind={item.kind}>
              <p>
                <span className='sc-kind'>{kindLabel(item, t)}</span>
                {item.question}
              </p>
              <p className='sc-muted'>
                {itemNote(item, t)} · {when(item.created)}
              </p>
              {item.reply && (
                <p className='sc-quote'>
                  <strong>{t('Support team')}: </strong>
                  {item.reply}
                </p>
              )}
              {item.answer && <p className='sc-quote'>{item.answer}</p>}
            </li>
          ))}
        </ul>
      </details>
      <div className='sc-actions'>
        <Button
          size='sm'
          variant='outline'
          onClick={() => props.onDraft(draftFrom(cluster, t))}
        >
          <FilePlus2 className='size-3.5' />
          {t('Write a knowledge draft')}
        </Button>
      </div>
    </li>
  )
}

// Tickets and thumbs-down answers, grouped by what was asked: each group is a
// gap in the knowledge base.
export function ConsoleUnresolved(props: {
  onDraft: (draft: KnowledgeDraft) => void
}) {
  const { t } = useTranslation()
  const [days, setDays] = useState(7)
  const [kind, setKind] = useState<Kind>('all')
  const report = useQuery({
    queryKey: ['support-console-unresolved', days],
    queryFn: () => getUnresolved(days),
  })
  const clusters = report.data?.clusters ?? []
  const shown = clusters.filter(
    (cluster) =>
      kind === 'all' ||
      (kind === 'ticket' ? cluster.tickets > 0 : cluster.disliked > 0)
  )
  const total = (field: 'tickets' | 'disliked') =>
    clusters.reduce((sum, cluster) => sum + cluster[field], 0)
  const kinds: { value: Kind; label: string }[] = [
    { value: 'all', label: `${t('All')} · ${clusters.length}` },
    { value: 'ticket', label: `${t('Tickets')} · ${total('tickets')}` },
    { value: 'disliked', label: `${t('Disliked')} · ${total('disliked')}` },
  ]
  return (
    <div className='sc-improve'>
      <div className='sc-toolbar'>
        <p className='sc-muted'>
          {t(
            'Questions the assistant could not settle: tickets and answers marked as not helpful, grouped by topic. Fix the knowledge behind the biggest groups first.'
          )}
        </p>
        <Button
          size='sm'
          variant='outline'
          disabled={!shown.length}
          onClick={() => exportCsv(shown, days, t)}
        >
          <Download className='size-3.5' />
          {t('Export CSV')}
        </Button>
      </div>
      <div className='sc-filters' role='group' aria-label={t('Period')}>
        {PERIODS.map((value) => (
          <button
            key={value}
            type='button'
            aria-pressed={days === value}
            className={cn('sc-chip', days === value && 'is-on')}
            onClick={() => setDays(value)}
          >
            {t('Last {{count}} days', { count: value })}
          </button>
        ))}
        <span className='sc-divider' aria-hidden />
        {kinds.map((item) => (
          <button
            key={item.value}
            type='button'
            aria-pressed={kind === item.value}
            className={cn('sc-chip', kind === item.value && 'is-on')}
            onClick={() => setKind(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {report.data?.mode === 'lexical' && clusters.length > 0 && (
        <p className='sc-warning'>
          {t(
            'The similarity service is unavailable, so questions are grouped by shared wording only.'
          )}
        </p>
      )}
      {report.isError && (
        <p role='alert' className='sc-muted'>
          {t('Unable to load the unresolved questions.')}
        </p>
      )}
      {report.isLoading && <p className='sc-muted'>{t('Loading…')}</p>}
      {!report.isLoading && !report.isError && !shown.length && (
        <p className='sc-empty'>{t('Nothing unresolved in this period.')}</p>
      )}
      <ul className='sc-cards'>
        {shown.map((cluster) => (
          <ClusterCard
            key={cluster.id}
            cluster={cluster}
            onDraft={props.onDraft}
          />
        ))}
      </ul>
    </div>
  )
}
