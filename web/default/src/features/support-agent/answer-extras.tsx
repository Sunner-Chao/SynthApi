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
import type { TFunction } from 'i18next'
import { ArrowRight, BookOpen, LocateFixed, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
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
