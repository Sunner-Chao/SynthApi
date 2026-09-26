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
  Check,
  Copy,
  Headset,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { Button } from '@/components/ui/button'
import { useAnswerFeedback } from './feedback'
import { SupportContact } from './handoff-card'
import { TicketForm } from './ticket-form'
import { useTicketActions } from './tickets'
import type { FeedbackReason, FeedbackVote } from './types'

const REASONS: { code: Exclude<FeedbackReason, ''>; label: string }[] = [
  { code: 'inaccurate', label: 'Inaccurate' },
  { code: 'unclear', label: 'Hard to follow' },
  { code: 'not_working', label: "Steps didn't work" },
  { code: 'other', label: 'Other' },
]

const plainAnswer = (text: string) =>
  text.replace(/\s?\[(\d{1,3})\]/g, '').trim()

export function AnswerToolbar(props: {
  userId: number
  conversation: string
  turnId: string
  question: string
  answer: string
  human: boolean
  canRegenerate: boolean
  busy: boolean
  saved?: { vote: FeedbackVote; reason: FeedbackReason }
  onRegenerate: () => void
  onRephrase: () => void
}) {
  const { t } = useTranslation()
  const { copyToClipboard, copiedText } = useCopyToClipboard({
    notify: false,
  })
  const { vote, reason, record } = useAnswerFeedback(
    props.userId,
    props.conversation,
    props.turnId,
    props.saved
  )
  const [asking, setAsking] = useState(false)
  const tickets = useTicketActions(props.userId, props.conversation)
  const choose = (value: FeedbackVote) => {
    setAsking(false)
    record(vote === value ? null : value, '')
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
          <span id={`${props.turnId}-reasons`}>
            {t('Sorry this did not help. What went wrong?')}
          </span>
          <div
            className='agent-reasons'
            role='group'
            aria-labelledby={`${props.turnId}-reasons`}
          >
            {REASONS.map((item) => (
              <button
                key={item.code}
                type='button'
                aria-pressed={reason === item.code}
                className={cn('agent-reason', reason === item.code && 'is-on')}
                onClick={() => record('down', item.code)}
              >
                {t(item.label)}
              </button>
            ))}
          </div>
          {reason && (
            <p className='agent-feedback-thanks'>{t('Thanks, noted.')}</p>
          )}
          {!asking && (
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
              {!!props.question && (
                <Button
                  size='sm'
                  variant='outline'
                  className='agent-chip-button'
                  onClick={() => setAsking(true)}
                >
                  <Headset className='size-3.5' />
                  {t('Ask a human')}
                </Button>
              )}
              <SupportContact />
            </div>
          )}
          {asking && (
            <TicketForm
              optional
              placeholder={t(
                'Order number, error time or other details for the support team'
              )}
              submitLabel={t('Send to the support team')}
              busy={tickets.request.isPending}
              onCancel={() => setAsking(false)}
              onSubmit={(note) =>
                tickets.request.mutate(
                  { question: props.question, note },
                  {
                    // A new ticket shows up as a turn at the end of the conversation.
                    onSuccess: (result) => {
                      setAsking(false)
                      if (!result.created)
                        toast.info(
                          t('This question is already with the support team.')
                        )
                    },
                  }
                )
              }
            />
          )}
        </div>
      )}
    </>
  )
}
