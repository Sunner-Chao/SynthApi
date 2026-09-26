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
import { ExternalLink, Headset } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { NextSteps, SourcesRow } from './answer-extras'
import { AnswerToolbar } from './answer-toolbar'
import './answer.css'
import { HandoffCard, ReplyFollowUp } from './handoff-card'
import { isPlainClick, resolveLink, useOpenInternal } from './links'
import { clockTime } from './time'
import { StepsSummary } from './tool-calls'
import type { FeedbackReason, FeedbackVote, Ticket, Turn } from './types'

// Convert verified numeric references in prose, without touching code or links.
interface MarkdownNode {
  type: string
  value?: string
  url?: string
  children?: MarkdownNode[]
}
function citationPlugin(validNumbers: Set<number>, prefix: string) {
  return () => (tree: MarkdownNode) => {
    const walk = (node: MarkdownNode) => {
      if (
        !node.children ||
        ['link', 'linkReference', 'code', 'inlineCode'].includes(node.type)
      )
        return
      node.children = node.children.flatMap((child) => {
        if (child.type !== 'text' || !child.value) {
          walk(child)
          return [child]
        }
        const parts: MarkdownNode[] = []
        let cursor = 0
        for (const match of child.value.matchAll(/\[(\d{1,3})\]/g)) {
          if (!validNumbers.has(Number(match[1]))) continue
          const start = match.index
          if (start > cursor)
            parts.push({
              type: 'text',
              value: child.value.slice(cursor, start),
            })
          parts.push({
            type: 'link',
            url: `#${prefix}${match[1]}`,
            children: [{ type: 'text', value: match[1] }],
          })
          cursor = start + match[0].length
        }
        if (cursor < child.value.length)
          parts.push({ type: 'text', value: child.value.slice(cursor) })
        return parts
      })
    }
    walk(tree)
  }
}

function focusSource(id: string) {
  const target = document.getElementById(id)
  target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  target?.focus({ preventScroll: true })
}

export function AgentAnswerContent(props: {
  turn: Turn
  conversation: string
  userId: number
  admin: boolean
  hasEmail: boolean
  replied: boolean
  ticket?: Ticket
  showTicketActions: boolean
  saved?: { vote: FeedbackVote; reason: FeedbackReason }
  canRegenerate: boolean
  busy: boolean
  onRegenerate: () => void
  onRephrase: () => void
}) {
  const { t, i18n } = useTranslation()
  const open = useOpenInternal()
  const answer = props.turn.response
  const human = !!answer.human_reply
  const sourcePrefix = `support-source-${props.turn.id}-`
  const titles = new Map(
    answer.sources.map((source) => [String(source.number), source.title])
  )
  return (
    <div className='agent-answer'>
      {human ? (
        <div className='agent-reply-badge'>
          <Headset className='size-3.5' />
          {t('Reply from the support team')}
          {props.turn.created > 0 && (
            <time>{clockTime(props.turn.created, i18n.language)}</time>
          )}
        </div>
      ) : (
        <StepsSummary calls={answer.tool_calls || []} admin={props.admin} />
      )}
      <div className='agent-markdown'>
        <ReactMarkdown
          remarkPlugins={[
            remarkGfm,
            citationPlugin(
              new Set(answer.sources.map((source) => source.number)),
              sourcePrefix
            ),
          ]}
          components={{
            a: ({ href, children }) => {
              if (href?.startsWith(`#${sourcePrefix}`)) {
                const number = href.slice(sourcePrefix.length + 1)
                return (
                  <a
                    href={href}
                    className='agent-citation'
                    title={titles.get(number)}
                    aria-label={t('Source {{number}}', { number })}
                    onClick={(event) => {
                      event.preventDefault()
                      focusSource(href.slice(1))
                    }}
                  >
                    {children}
                  </a>
                )
              }
              const target = resolveLink(href)
              if (!target) return <span>{children}</span>
              if (target.kind === 'external')
                return (
                  <a
                    href={target.href}
                    className='agent-link'
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    {children}
                    <ExternalLink className='agent-link-icon' />
                  </a>
                )
              return (
                <a
                  href={target.href}
                  className='agent-link'
                  onClick={(event) => {
                    if (!isPlainClick(event)) return
                    event.preventDefault()
                    open(target.href)
                  }}
                >
                  {children}
                </a>
              )
            },
            table: (tableProps) => (
              <div className='agent-table-scroll'>
                <table {...tableProps} />
              </div>
            ),
          }}
        >
          {answer.answer}
        </ReactMarkdown>
      </div>
      {answer.status === 'handoff' && (
        <HandoffCard
          handoffId={answer.handoff_id}
          ticket={props.ticket}
          repliedFallback={props.replied}
          hasEmail={props.hasEmail}
          showActions={props.showTicketActions}
          userId={props.userId}
          conversation={props.conversation}
        />
      )}
      <SourcesRow
        sources={answer.sources}
        prefix={sourcePrefix}
        audit={
          props.admin
            ? {
                request: answer.request_id,
                version: answer.knowledge_version,
              }
            : undefined
        }
      />
      <NextSteps answer={answer} conversation={props.conversation} />
      {human && answer.handoff_id && props.showTicketActions && (
        <ReplyFollowUp
          handoffId={answer.handoff_id}
          ticket={props.ticket}
          userId={props.userId}
          conversation={props.conversation}
        />
      )}
      <AnswerToolbar
        userId={props.userId}
        conversation={props.conversation}
        turnId={props.turn.id}
        question={props.turn.question}
        saved={props.saved}
        answer={answer.answer}
        human={human || answer.status === 'handoff'}
        canRegenerate={props.canRegenerate}
        busy={props.busy}
        onRegenerate={props.onRegenerate}
        onRephrase={props.onRephrase}
      />
    </div>
  )
}
