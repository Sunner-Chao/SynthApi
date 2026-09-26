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
import type { TFunction } from 'i18next'
import {
  ArrowRight,
  BookOpen,
  Check,
  Copy,
  Headset,
  LocateFixed,
  QrCode,
  RefreshCw,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { readFeedback, saveFeedback, type Vote } from './feedback'
import { beginGuide } from './guide-events'
import { isPlainClick, resolveLink, useOpenInternal } from './links'
import { pageContext } from './page-context'
import type { AgentAnswer, Source } from './types'

export function SourcesRow(props: {
  sources: Source[]
  prefix: string
  audit?: { request: string; version: string }
}) {
  const { t } = useTranslation()
  if (!props.sources.length) return null
  return (
    <div className='agent-sources-row'>
      <span className='agent-sources-label'>
        <BookOpen className='size-3.5' />
        {t('Sources')}
      </span>
      <ol>
        {props.sources.map((source) => (
          <li
            key={source.id}
            id={`${props.prefix}${source.number}`}
            tabIndex={-1}
            title={`${source.title} · ${new Date(source.updated * 1000).toLocaleDateString()}`}
          >
            <span className='agent-source-number'>{source.number}</span>
            <span className='agent-source-title'>{source.title}</span>
          </li>
        ))}
      </ol>
      {props.audit && (
        <details className='agent-answer-audit'>
          <summary>{t('Answer details')}</summary>
          <p>
            {t('Knowledge version')}: {props.audit.version}
          </p>
          <p>
            {t('Request ID')}: {props.audit.request}
          </p>
        </details>
      )}
    </div>
  )
}

const pageLabel = (path: string, t: TFunction) => {
  const label = pageContext(path.split(/[?#]/)[0])?.label
  return label ? t(label) : ''
}

const internalHref = (path: string) => {
  const target = resolveLink(path)
  return target?.kind === 'internal' ? target.href : ''
}

type Step = {
  key: string
  label: string
  description: string
  href: string
  guided: boolean
  sensitive: boolean
  activate: () => void
}

// Guided actions and plain links share one list; the first entry is the primary next step.
export function NextSteps(props: {
  answer: AgentAnswer
  conversation: string
}) {
  const { t } = useTranslation()
  const open = useOpenInternal()
  const actions = props.answer.actions || []
  const actionPaths = new Set(actions.map((action) => action.path))
  // Only in-site targets become next steps; anything else in model output is dropped.
  const steps: Step[] = [
    ...actions.flatMap((action) => {
      const href = internalHref(action.path)
      if (!href) return []
      return [
        {
          key: `action-${action.id}`,
          label: action.label,
          description: action.description,
          href,
          guided: true,
          sensitive: action.requires_confirmation,
          activate: () =>
            beginGuide({
              action,
              conversation: props.conversation,
              request_id: props.answer.request_id,
            }),
        },
      ]
    }),
    ...props.answer.links.flatMap((link) => {
      const href = internalHref(link.path)
      if (!href || actionPaths.has(href.split('#')[0])) return []
      return [
        {
          key: `link-${link.path}`,
          label: link.label,
          description: pageLabel(href, t),
          href,
          guided: false,
          sensitive: false,
          activate: () => open(href),
        },
      ]
    }),
  ]
  if (!steps.length) return null
  return (
    <nav className='agent-next' aria-label={t('Next steps')}>
      <p className='agent-next-title'>{t('Next steps')}</p>
      <ul>
        {steps.map((step, index) => (
          <li key={step.key}>
            <a
              href={step.href}
              className={cn('agent-next-item', index === 0 && 'is-primary')}
              onClick={(event) => {
                if (!isPlainClick(event)) return
                event.preventDefault()
                step.activate()
              }}
            >
              <span className='agent-next-icon'>
                {step.sensitive ? (
                  <ShieldCheck className='size-4' />
                ) : step.guided ? (
                  <LocateFixed className='size-4' />
                ) : (
                  <ArrowRight className='size-4' />
                )}
              </span>
              <span className='min-w-0 flex-1'>
                <strong>{step.label}</strong>
                {step.description && <small>{step.description}</small>}
              </span>
            </a>
          </li>
        ))}
      </ul>
      {actions.length > 0 && (
        <p className='agent-next-note'>
          {t(
            'The assistant only highlights the next step. It never submits payments, creates keys, or changes account data for you.'
          )}
        </p>
      )}
    </nav>
  )
}

export function SupportContact(props: { ticket?: string }) {
  const { t } = useTranslation()
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button size='sm' variant='outline' className='agent-chip-button' />
        }
      >
        <QrCode className='size-3.5' />
        {t('WeChat support')}
      </PopoverTrigger>
      <PopoverContent align='start' className='w-64 items-center text-center'>
        <img
          src='/technical-support-qr.png'
          alt={t('WeChat support QR code')}
          width={200}
          height={200}
          className='size-[200px] rounded-md object-contain'
        />
        <p className='text-muted-foreground text-xs leading-5'>
          {props.ticket
            ? t('Scan to add WeChat support and mention ticket {{ticket}}.', {
                ticket: props.ticket,
              })
            : t('Scan to add WeChat support.')}
        </p>
      </PopoverContent>
    </Popover>
  )
}

const ticketLabel = (id?: string) =>
  id ? `H-${id.replace(/-/g, '').slice(0, 4).toUpperCase()}` : ''

export function HandoffCard(props: {
  handoffId?: string
  replied: boolean
  hasEmail: boolean
}) {
  const { t } = useTranslation()
  const ticket = ticketLabel(props.handoffId)
  return (
    <section
      className='agent-handoff'
      data-state={props.replied ? 'replied' : 'pending'}
      aria-label={t('Support ticket')}
    >
      <header>
        <Headset className='size-4 shrink-0' />
        <strong>{t('Passed to the support team')}</strong>
        {ticket && <span className='agent-ticket-id'>{ticket}</span>}
        <span className='agent-handoff-status'>
          {props.replied ? t('Replied') : t('In queue')}
        </span>
      </header>
      <p>
        {props.replied
          ? t('The support team has replied in this conversation.')
          : props.hasEmail
            ? t(
                'Support is online 9:00–21:00 on weekdays and usually replies within 2 hours. The reply will appear in this conversation and we will email you.'
              )
            : t(
                'Support is online 9:00–21:00 on weekdays and usually replies within 2 hours. The reply will appear in this conversation.'
              )}
      </p>
      {!props.replied && (
        <div className='agent-handoff-actions'>
          <SupportContact ticket={ticket} />
        </div>
      )}
    </section>
  )
}

const plainAnswer = (text: string) =>
  text.replace(/\s?\[(\d{1,3})\]/g, '').trim()

export function AnswerToolbar(props: {
  userId: number
  turnId: string
  answer: string
  human: boolean
  canRegenerate: boolean
  busy: boolean
  onRegenerate: () => void
  onRephrase: () => void
}) {
  const { t } = useTranslation()
  const { copyToClipboard, copiedText } = useCopyToClipboard({
    notify: false,
  })
  const [vote, setVote] = useState<Vote | null>(() =>
    readFeedback(props.userId, props.turnId)
  )
  const choose = (value: Vote) => {
    const next = vote === value ? null : value
    setVote(next)
    saveFeedback(props.userId, props.turnId, next)
  }
  const copied = copiedText !== null
  return (
    <>
      <div
        className='agent-toolbar'
        role='group'
        aria-label={t('Answer actions')}
      >
        <Button
          size='icon-xs'
          variant='ghost'
          aria-label={copied ? t('Copied') : t('Copy')}
          title={copied ? t('Copied') : t('Copy')}
          onClick={() => {
            void copyToClipboard(plainAnswer(props.answer))
          }}
        >
          {copied ? (
            <Check className='size-3.5' />
          ) : (
            <Copy className='size-3.5' />
          )}
        </Button>
        {!props.human && (
          <>
            <Button
              size='icon-xs'
              variant='ghost'
              aria-label={t('Helpful')}
              title={t('Helpful')}
              aria-pressed={vote === 'up'}
              data-active={vote === 'up' || undefined}
              onClick={() => choose('up')}
            >
              <ThumbsUp className='size-3.5' />
            </Button>
            <Button
              size='icon-xs'
              variant='ghost'
              aria-label={t('Not helpful')}
              title={t('Not helpful')}
              aria-pressed={vote === 'down'}
              data-active={vote === 'down' || undefined}
              onClick={() => choose('down')}
            >
              <ThumbsDown className='size-3.5' />
            </Button>
            {props.canRegenerate && (
              <Button
                size='icon-xs'
                variant='ghost'
                aria-label={t('Regenerate')}
                title={t('Regenerate')}
                disabled={props.busy}
                onClick={props.onRegenerate}
              >
                <RefreshCw className='size-3.5' />
              </Button>
            )}
          </>
        )}
      </div>
      {vote === 'down' && !props.human && (
        <div className='agent-feedback'>
          <span>{t('Sorry this did not help. You can:')}</span>
          <div className='agent-feedback-actions'>
            {props.canRegenerate && (
              <Button
                size='sm'
                variant='outline'
                className='agent-chip-button'
                disabled={props.busy}
                onClick={props.onRegenerate}
              >
                <RefreshCw className='size-3.5' />
                {t('Answer again')}
              </Button>
            )}
            <Button
              size='sm'
              variant='outline'
              className='agent-chip-button'
              onClick={props.onRephrase}
            >
              {t('Add details')}
            </Button>
            <SupportContact />
          </div>
        </div>
      )}
    </>
  )
}
