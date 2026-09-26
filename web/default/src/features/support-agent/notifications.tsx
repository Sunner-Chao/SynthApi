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
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { openSupportAgent, useHandoffQueue } from './queue'
import { useSupportReplies } from './replies'

// Assistant alerts sit bottom-right so they never cover the header or the panel's close button.
const POSITION = 'bottom-right' as const

export function HandoffNotifications(props: {
  userId: number
  panelOpen: boolean
}) {
  const { t } = useTranslation()
  const queue = useHandoffQueue()
  const notified = useRef(new Set<string>())
  const initialized = useRef(false)
  const toastId = `support-queue-${props.userId}`
  useEffect(() => {
    if (!queue.data) return
    if (props.panelOpen) {
      toast.dismiss(toastId)
      return
    }
    const storageKey = `support-notified-${props.userId}`
    if (!initialized.current) {
      initialized.current = true
      try {
        const stored: unknown = JSON.parse(
          sessionStorage.getItem(storageKey) || '[]'
        )
        if (Array.isArray(stored)) {
          notified.current = new Set(
            stored.filter((id): id is string => typeof id === 'string')
          )
        }
      } catch {
        /* Notifications still work when browser storage is disabled. */
      }
    }
    const pending = queue.data.items.filter((item) => item.status === 'pending')
    if (!pending.length) {
      toast.dismiss(toastId)
      return
    }
    if (pending.every((item) => notified.current.has(item.id))) return
    for (const item of pending) notified.current.add(item.id)
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify([...notified.current].slice(-500))
      )
    } catch {
      /* Keep deduplication in memory. */
    }
    toast.warning(t('Human review needed'), {
      id: toastId,
      position: POSITION,
      description: t('{{count}} questions are waiting for an administrator.', {
        count: pending.length,
      }),
      duration: 12000,
      closeButton: true,
      action: {
        label: t('View queue'),
        onClick: () => openSupportAgent('handoffs'),
      },
    })
  }, [queue.data, props.panelOpen, props.userId, t, toastId])
  useEffect(
    () => () => {
      toast.dismiss(toastId)
    },
    [toastId]
  )
  return null
}

// Tells the user once per session when the support team answers while the panel is closed.
export function ReplyNotifications(props: {
  userId: number
  panelOpen: boolean
}) {
  const { t } = useTranslation()
  const replies = useSupportReplies(props.userId)
  const payload = JSON.stringify(
    replies.unread.map((item) => [item.conversation, item.updated, item.title])
  )
  const toastId = `support-reply-${props.userId}`
  useEffect(() => {
    if (props.panelOpen) return
    const items = JSON.parse(payload) as [string, number, string][]
    const storageKey = `support-reply-alerts-${props.userId}`
    let shown = new Set<string>()
    try {
      const stored: unknown = JSON.parse(
        sessionStorage.getItem(storageKey) || '[]'
      )
      if (Array.isArray(stored))
        shown = new Set(
          stored.filter((v): v is string => typeof v === 'string')
        )
    } catch {
      /* Alerts may repeat once per page load without storage. */
    }
    const fresh = items.filter(
      ([id, updated]) => !shown.has(`${id}:${updated}`)
    )
    if (!fresh.length) return
    for (const [id, updated] of fresh) shown.add(`${id}:${updated}`)
    try {
      sessionStorage.setItem(storageKey, JSON.stringify([...shown].slice(-200)))
    } catch {
      /* Keep going without deduplication storage. */
    }
    const [conversation, , title] = fresh[0]
    toast.info(t('The support team replied'), {
      id: toastId,
      position: POSITION,
      description:
        fresh.length > 1
          ? t('New replies in {{count}} conversations', { count: fresh.length })
          : title,
      duration: 12000,
      closeButton: true,
      action: {
        label: t('View'),
        onClick: () =>
          openSupportAgent('chat', { conversation, focusReply: true }),
      },
    })
  }, [payload, props.panelOpen, props.userId, t, toastId])
  useEffect(() => {
    if (props.panelOpen) toast.dismiss(toastId)
  }, [props.panelOpen, toastId])
  return null
}
