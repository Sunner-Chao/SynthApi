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
import { CheckCircle2, Headset, MessageSquarePlus, QrCode } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { TicketForm } from './ticket-form'
import { useTicketActions } from './tickets'
import type { Ticket } from './types'

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

type Status = Ticket['status']

function statusText(status: Status, hasEmail: boolean, t: TFunction) {
  if (status === 'resolved') return t('This ticket is closed.')
  if (status === 'replied')
    return t('The support team has replied in this conversation.')
  return hasEmail
    ? t(
        'Support is online 9:00–21:00 on weekdays and usually replies within 2 hours. The reply will appear in this conversation and we will email you.'
      )
    : t(
        'Support is online 9:00–21:00 on weekdays and usually replies within 2 hours. The reply will appear in this conversation.'
      )
}

// Pending: add information (plus WeChat). Replied: confirm it is solved, or say what is still wrong.
function TicketActions(props: {
  handoffId: string
  status: Status
  label: string
  userId: number
  conversation: string
}) {
  const { t } = useTranslation()
  const [writing, setWriting] = useState(false)
  const actions = useTicketActions(props.userId, props.conversation)
  const replied = props.status === 'replied'
  if (props.status === 'resolved') return null
  if (writing)
    return (
      <TicketForm
        placeholder={
          replied
            ? t('Tell the support team what is still wrong')
            : t(
                'Order number, error time or other details for the support team'
              )
        }
        submitLabel={t('Send to the support team')}
        busy={actions.note.isPending}
        onCancel={() => setWriting(false)}
        onSubmit={(note) =>
          actions.note.mutate(
            { id: props.handoffId, note },
            { onSuccess: () => setWriting(false) }
          )
        }
      />
    )
  return (
    <div className='agent-handoff-actions'>
      {replied && (
        <Button
          size='sm'
          className='agent-chip-button'
          disabled={actions.close.isPending}
          onClick={() => actions.close.mutate(props.handoffId)}
        >
          <CheckCircle2 className='size-3.5' />
          {t('Problem solved')}
        </Button>
      )}
      <Button
        size='sm'
        variant='outline'
        className='agent-chip-button'
        onClick={() => setWriting(true)}
      >
        <MessageSquarePlus className='size-3.5' />
        {replied ? t('Still need help') : t('Add information')}
      </Button>
      {!replied && <SupportContact ticket={props.label} />}
    </div>
  )
}

// The ticket's latest turn carries the explanation and actions; earlier turns of
// the same ticket only show its state.
export function HandoffCard(props: {
  handoffId?: string
  ticket?: Ticket
  repliedFallback: boolean
  hasEmail: boolean
  showActions: boolean
  userId: number
  conversation: string
}) {
  const { t } = useTranslation()
  const label = ticketLabel(props.handoffId)
  const status: Status =
    props.ticket?.status ?? (props.repliedFallback ? 'replied' : 'pending')
  const labels: Record<Status, string> = {
    pending: t('In queue'),
    replied: t('Replied'),
    resolved: t('Resolved'),
  }
  return (
    <section
      className='agent-handoff'
      data-state={status}
      aria-label={t('Support ticket')}
    >
      <header>
        <Headset className='size-4 shrink-0' />
        <strong>{t('Passed to the support team')}</strong>
        {label && <span className='agent-ticket-id'>{label}</span>}
        <span className='agent-handoff-status'>{labels[status]}</span>
      </header>
      {props.showActions && <p>{statusText(status, props.hasEmail, t)}</p>}
      {props.showActions &&
        status === 'pending' &&
        (props.ticket && props.handoffId ? (
          <TicketActions
            handoffId={props.handoffId}
            status={status}
            label={label}
            userId={props.userId}
            conversation={props.conversation}
          />
        ) : (
          <div className='agent-handoff-actions'>
            <SupportContact ticket={label} />
          </div>
        ))}
    </section>
  )
}

// Shown under the support team's reply while its ticket is waiting for the user's verdict.
export function ReplyFollowUp(props: {
  handoffId: string
  ticket?: Ticket
  userId: number
  conversation: string
}) {
  const { t } = useTranslation()
  if (!props.ticket || props.ticket.status === 'pending') return null
  if (props.ticket.status === 'resolved')
    return (
      <p className='agent-followup is-done'>
        <CheckCircle2 className='size-3.5' />
        {t('Resolved')}
      </p>
    )
  return (
    <div className='agent-followup'>
      <span>{t('Did this solve your problem?')}</span>
      <TicketActions
        handoffId={props.handoffId}
        status='replied'
        label={ticketLabel(props.handoffId)}
        userId={props.userId}
        conversation={props.conversation}
      />
    </div>
  )
}
