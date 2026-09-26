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
import { isAxiosError } from 'axios'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { addTicketNote, closeTicket, requestTicket } from './api'

// The proxy only has generic wording, so the cases the support service reports
// by status code (see its ticket endpoints) get their own message.
function ticketError(
  error: unknown,
  t: TFunction,
  byStatus: Record<number, string>
) {
  if (!isAxiosError<{ message?: string }>(error))
    return error instanceof Error ? error.message : t('Request failed')
  const status = error.response?.status ?? 0
  return (
    byStatus[status] || error.response?.data?.message || t('Request failed')
  )
}

// Customer-side ticket actions. Each one adds a turn or changes a status, so the
// conversation (and an administrator's queue, if open) is refreshed afterwards,
// also after a failure, when the ticket may have changed in the meantime.
export function useTicketActions(userId: number, conversation: string) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const refresh = () => {
    void qc.invalidateQueries({
      queryKey: ['support-history', userId, conversation],
    })
    void qc.invalidateQueries({ queryKey: ['support-handoffs'] })
    void qc.invalidateQueries({ queryKey: ['support-replies', userId] })
  }
  const request = useMutation({
    mutationFn: (input: { question: string; note: string }) =>
      requestTicket({ conversation, ...input }),
    onSettled: refresh,
    onError: (error) =>
      toast.error(
        ticketError(error, t, {
          409: t(
            'You already have several questions with the support team. Please wait for their replies.'
          ),
        })
      ),
  })
  const note = useMutation({
    mutationFn: (input: { id: string; note: string }) =>
      addTicketNote(input.id, input.note),
    onSettled: refresh,
    onError: (error) =>
      toast.error(
        ticketError(error, t, {
          409: t('This ticket is closed.'),
          413: t(
            'This ticket already has a lot of details. Please wait for the support team to reply.'
          ),
        })
      ),
  })
  const close = useMutation({
    mutationFn: closeTicket,
    onSettled: refresh,
  })
  return { request, note, close }
}
