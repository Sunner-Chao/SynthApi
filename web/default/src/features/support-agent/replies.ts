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
import { useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getConversations } from './api'
import type { Conversation } from './types'

// A support reply is stored as a turn without a question, so a conversation
// whose latest turn has no question ends with a reply from the team. Replies
// newer than the last time the user opened that conversation count as unread.
type Seen = { since: number; items: Record<string, number> }

const NOBODY: Seen = { since: Number.POSITIVE_INFINITY, items: {} }
const MAX_TRACKED = 200
const cache = new Map<number, Seen>()
const listeners = new Set<() => void>()
const storageKey = (userId: number) => `support-seen-${userId}`

function isSeen(value: unknown): value is Seen {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record.since === 'number' &&
    !!record.items &&
    typeof record.items === 'object'
  )
}

function save(userId: number, seen: Seen) {
  cache.set(userId, seen)
  try {
    const items = Object.entries(seen.items)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_TRACKED)
    localStorage.setItem(
      storageKey(userId),
      JSON.stringify({ since: seen.since, items: Object.fromEntries(items) })
    )
  } catch {
    /* Unread markers stay in memory when storage is unavailable. */
  }
}

function load(userId: number): Seen {
  const cached = cache.get(userId)
  if (cached) return cached
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(storageKey(userId)) || 'null'
    )
    if (isSeen(stored)) {
      cache.set(userId, stored)
      return stored
    }
  } catch {
    /* Fall through to a fresh baseline. */
  }
  // Replies that arrived before this browser started tracking are not new.
  const fresh: Seen = { since: Date.now() / 1000, items: {} }
  save(userId, fresh)
  return fresh
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (!event.key?.startsWith('support-seen-')) return
    cache.clear()
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function markRepliesSeen(
  userId: number,
  conversation: string,
  updated = 0
) {
  const seen = load(userId)
  const at = Math.max(updated, Date.now() / 1000)
  if ((seen.items[conversation] ?? 0) >= at) return
  save(userId, {
    since: seen.since,
    items: { ...seen.items, [conversation]: at },
  })
  for (const listener of listeners) listener()
}

export const hasUnreadReply = (item: Conversation, seen: Seen) =>
  item.turns > 0 &&
  item.last_question === '' &&
  item.updated > (seen.items[item.conversation] ?? seen.since)

export function useSupportReplies(userId?: number) {
  const seen = useSyncExternalStore(
    subscribe,
    () => (userId ? load(userId) : NOBODY),
    () => NOBODY
  )
  const list = useQuery({
    queryKey: ['support-replies', userId],
    queryFn: () => getConversations(false, '', 0, true),
    enabled: !!userId,
    retry: 1,
    staleTime: 60000,
    refetchOnWindowFocus: true,
    // Only people who have talked to the assistant can receive replies.
    refetchInterval: (query) =>
      query.state.data?.items.length ? 120000 : false,
  })
  const items = list.data?.items ?? []
  return {
    recent: items,
    unread: items.filter((item) => hasUnreadReply(item, seen)),
    refetch: list.refetch,
  }
}
