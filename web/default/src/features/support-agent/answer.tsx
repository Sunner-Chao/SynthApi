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
import { CircleStop, Headset } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ShareRequest } from './account-share'
import { NextSteps, SourcesRow } from './answer-extras'
import { AnswerMarkdown } from './answer-markdown'
import { AnswerToolbar } from './answer-toolbar'
import './answer.css'
import { HandoffCard, ReplyFollowUp } from './handoff-card'
import { clockTime } from './time'
import { StepsSummary } from './tool-calls'
import type {
  AccountContextKind,
  FeedbackReason,
  FeedbackVote,
  Ticket,
  Turn,
} from './types'

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
  // Only the latest answer offers to ask again with the user's account data.
  onShareContext?: (kind: AccountContextKind) => void
}) {
  const { t, i18n } = useTranslation()
  const answer = props.turn.response
  const human = !!answer.human_reply
  const wanted = answer.request_context
  const sourcePrefix = `support-source-${props.turn.id}-`
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
      <AnswerMarkdown
        text={answer.answer}
        sources={answer.sources}
        prefix={sourcePrefix}
      />
      {answer.general && (
        <p className='agent-general-note'>
          {t('General answer, not based on SynthAPI documentation.')}
        </p>
      )}
      {wanted && props.onShareContext && (
        <ShareRequest
          kind={wanted}
          disabled={props.busy}
          onShare={() => props.onShareContext?.(wanted)}
        />
      )}
      {(answer.stopped || answer.truncated) && (
        <p className='agent-stopped-note'>
          <CircleStop className='size-3.5 shrink-0' />
          {answer.stopped
            ? t('You stopped this answer, so it may be incomplete.')
            : t('This answer was cut off and may be incomplete.')}
        </p>
      )}
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
