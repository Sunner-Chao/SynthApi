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
import {
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { sendFeedback } from './api'
import type { FeedbackReason, FeedbackVote, HistoryPage } from './types'

// Votes are saved with the conversation on the server. Votes given before the
// feedback API existed are only in this browser; they show until replaced.
const storageKey = (userId: number) => `support-feedback-${userId}`

function readAll(userId: number): Record<string, FeedbackVote> {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(storageKey(userId)) || '{}'
    )
    if (!value || typeof value !== 'object') return {}
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(
        (entry): entry is [string, FeedbackVote] =>
          entry[1] === 'up' || entry[1] === 'down'
      )
    )
  } catch {
    return {}
  }
}

const readFeedback = (userId: number, turnId: string): FeedbackVote | null =>
  readAll(userId)[turnId] ?? null

function forgetLocalVote(userId: number, turnId: string) {
  const all = readAll(userId)
  if (!(turnId in all)) return
  const rest = Object.entries(all).filter(([id]) => id !== turnId)
  try {
    localStorage.setItem(
      storageKey(userId),
      JSON.stringify(Object.fromEntries(rest))
    )
  } catch {
    /* The server copy takes precedence anyway. */
  }
}

type Saved = { vote: FeedbackVote; reason: FeedbackReason }

// The vote shown is the one in the conversation's cached history, updated at
// once on click, so it is current after the panel is reopened or refetched.
export function useAnswerFeedback(
  userId: number,
  conversation: string,
  turnId: string,
  saved?: Saved
) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const historyKey = ['support-history', userId, conversation]
  const mutation = useMutation({
    mutationFn: sendFeedback,
    retry: 2,
    onError: () => {
      toast.error(t('Unable to save your feedback. Please retry.'))
      void qc.invalidateQueries({ queryKey: historyKey })
    },
  })
  const record = (vote: FeedbackVote | null, reason: FeedbackReason) => {
    qc.setQueryData<InfiniteData<HistoryPage>>(historyKey, (data) => {
      if (!data?.pages.length) return data
      const [first, ...older] = data.pages
      const others = Object.fromEntries(
        Object.entries(first.feedback ?? {}).filter(([id]) => id !== turnId)
      )
      const feedback = vote ? { ...others, [turnId]: { vote, reason } } : others
      return { ...data, pages: [{ ...first, feedback }, ...older] }
    })
    forgetLocalVote(userId, turnId)
    mutation.mutate({ conversation, turn_id: turnId, vote, reason })
  }
  return {
    vote: saved ? saved.vote : readFeedback(userId, turnId),
    reason: saved?.reason ?? '',
    record,
  }
}
