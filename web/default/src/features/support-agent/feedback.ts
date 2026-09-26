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

// Votes are remembered in this browser until the feedback API ships, so the
// thumbs keep their state when the conversation is reopened.
export type Vote = 'up' | 'down'

const MAX_VOTES = 200
const storageKey = (userId: number) => `support-feedback-${userId}`

function readAll(userId: number): Record<string, Vote> {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(storageKey(userId)) || '{}'
    )
    if (!value || typeof value !== 'object') return {}
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(
        (entry): entry is [string, Vote] =>
          entry[1] === 'up' || entry[1] === 'down'
      )
    )
  } catch {
    return {}
  }
}

export const readFeedback = (userId: number, turnId: string): Vote | null =>
  readAll(userId)[turnId] ?? null

export function saveFeedback(
  userId: number,
  turnId: string,
  vote: Vote | null
) {
  const rest = Object.entries(readAll(userId)).filter(([id]) => id !== turnId)
  const next = vote ? [...rest, [turnId, vote] as const] : rest
  try {
    localStorage.setItem(
      storageKey(userId),
      JSON.stringify(Object.fromEntries(next.slice(-MAX_VOTES)))
    )
  } catch {
    /* The vote still shows for this session. */
  }
}
