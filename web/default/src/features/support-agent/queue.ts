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
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth-store'
import { getHandoffs } from './api'

export const SUPPORT_OPEN_EVENT = 'synthapi:open-support-agent'
export const SUPPORT_CLOSE_EVENT = 'synthapi:close-support-agent'
export type AgentTab = 'chat' | 'handoffs' | 'knowledge'
export type OpenRequest = {
  tab: AgentTab
  prompt?: string
  conversation?: string
  focusReply?: boolean
}
const CONVERSATION_ID = /^[a-zA-Z0-9_-]{1,100}$/

export const isConversationId = (value: unknown): value is string =>
  typeof value === 'string' && CONVERSATION_ID.test(value)

// 'notifications' is accepted from older callers; the inbox now lives in the header bell.
export function openSupportAgent(
  tab: AgentTab | 'notifications' = 'chat',
  options?: Omit<OpenRequest, 'tab'>
) {
  window.dispatchEvent(
    new CustomEvent(SUPPORT_OPEN_EVENT, {
      detail: { tab: tab === 'notifications' ? 'chat' : tab, ...options },
    })
  )
}

// Queue and knowledge work happens in the support console, not in the panel.
export const consoleHref = (tab: AgentTab) =>
  `/support-console?tab=${tab === 'knowledge' ? 'knowledge' : 'tickets'}`

export function readOpenRequest(event: Event): OpenRequest {
  const detail: unknown = event instanceof CustomEvent ? event.detail : null
  if (!detail || typeof detail !== 'object') return { tab: 'chat' }
  const value = detail as Record<string, unknown>
  const tab =
    value.tab === 'handoffs' || value.tab === 'knowledge' ? value.tab : 'chat'
  return {
    tab,
    prompt: typeof value.prompt === 'string' ? value.prompt.slice(0, 4000) : '',
    conversation: isConversationId(value.conversation)
      ? value.conversation
      : undefined,
    focusReply: value.focusReply === true,
  }
}

export const isMacPlatform = () =>
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)

export const shortcutLabel = () => (isMacPlatform() ? '⌘ J' : 'Ctrl J')

export function useHandoffQueue(active = true) {
  const user = useAuthStore((s) => s.auth.user)
  return useQuery({
    queryKey: ['support-handoffs', user?.id],
    queryFn: getHandoffs,
    enabled: active && (user?.role ?? 0) >= 10,
    staleTime: 15000,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  })
}
