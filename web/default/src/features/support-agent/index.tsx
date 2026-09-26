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
import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { Bot, LayoutDashboard } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from '@/components/ui/sidebar'
import { AssistantActionGuide } from './action-guide'
import { HandoffNotifications, ReplyNotifications } from './notifications'
import {
  consoleHref,
  isConversationId,
  openSupportAgent,
  readOpenRequest,
  shortcutLabel,
  SUPPORT_CLOSE_EVENT,
  SUPPORT_OPEN_EVENT,
  useHandoffQueue,
  type OpenRequest,
} from './queue'
import { useSupportReplies } from './replies'
import { persistThread } from './storage'
import './styles.css'

const AgentPanel = lazy(() => import('./panel'))
const PENDING_OPEN_KEY = 'support-open-after-login'

export function SupportAgentEntry() {
  const { t } = useTranslation()
  const { setOpenMobile } = useSidebar()
  const userId = useAuthStore((s) => s.auth.user?.id)
  const admin = useAuthStore((s) => (s.auth.user?.role ?? 0) >= 10)
  const onConsole = useLocation({
    select: (location) => location.pathname.startsWith('/support-console'),
  })
  const replies = useSupportReplies(userId)
  const queue = useHandoffQueue()
  const pendingCount =
    queue.data?.items.filter((item) => item.status === 'pending').length ?? 0
  return (
    <div className='px-2 pb-2'>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip={t('Site assistant')}
            className='border-border bg-accent/50 h-11 border'
            onClick={() => {
              setOpenMobile(false)
              openSupportAgent()
            }}
          >
            <Bot className='text-primary size-4' />
            <span className='font-medium'>{t('Site assistant')}</span>
            {replies.unread.length > 0 && (
              <span
                className='agent-unread-dot'
                aria-label={t('New reply from the support team')}
              />
            )}
            <span className='text-muted-foreground ml-auto text-[10px]'>
              {shortcutLabel()}
            </span>
          </SidebarMenuButton>
          {admin && (
            <SidebarMenuButton
              className='agent-queue-entry mt-1 h-9'
              tooltip={t('Support console')}
              isActive={onConsole}
              render={
                <Link
                  to='/support-console'
                  search={{ tab: 'tickets' }}
                  onClick={() => setOpenMobile(false)}
                />
              }
            >
              <LayoutDashboard className='size-4 shrink-0' />
              <span>{t('Support console')}</span>
              {pendingCount > 0 && (
                <span
                  className='agent-queue-count ml-auto'
                  aria-label={t('{{count}} pending questions', {
                    count: pendingCount,
                  })}
                >
                  {pendingCount}
                </span>
              )}
            </SidebarMenuButton>
          )}
        </SidebarMenuItem>
      </SidebarMenu>
    </div>
  )
}

// Header entry, so phones and collapsed sidebars can reach the assistant too.
export function SupportAgentHeaderButton() {
  const { t } = useTranslation()
  const userId = useAuthStore((s) => s.auth.user?.id)
  const replies = useSupportReplies(userId)
  if (!userId) return null
  const label = `${t('Site assistant')} (${shortcutLabel()})`
  return (
    <Button
      variant='ghost'
      size='icon'
      className='hover:bg-muted/50 relative size-9'
      aria-label={label}
      title={label}
      onClick={() => openSupportAgent()}
    >
      <Bot className='size-[1.15rem]' />
      {replies.unread.length > 0 && (
        <span className='agent-unread-dot is-corner' />
      )}
    </Button>
  )
}

type RootState = { open: boolean; request: OpenRequest; session: number }

// Links such as /?assistant=<conversation> (reply emails) open that conversation.
function linkedRequest(): OpenRequest | null {
  if (typeof window === 'undefined') return null
  const search = new URLSearchParams(window.location.search)
  const conversation = search.get('assistant')
  if (isConversationId(conversation))
    return { tab: 'chat', conversation, focusReply: true }
  if (search.get('support') === 'handoffs') return { tab: 'handoffs' }
  return null
}

function initialState(signedIn: boolean, admin: boolean): RootState {
  const linked = linkedRequest()
  if (linked?.conversation && !signedIn) {
    try {
      sessionStorage.setItem(PENDING_OPEN_KEY, linked.conversation)
    } catch {
      /* The link still works after signing in again. */
    }
  }
  // Old queue links (?support=handoffs) take administrators to the console
  // (see SupportAgentRoot); everyone else gets the conversation.
  const forConsole = !!linked && linked.tab !== 'chat'
  return {
    open: !!linked && signedIn && !(forConsole && admin),
    request: linked && !forConsole ? linked : { tab: 'chat' },
    session: 0,
  }
}

export function SupportAgentRoot() {
  const user = useAuthStore((s) => s.auth.user)
  const userId = user?.id
  const admin = (user?.role ?? 0) >= 10
  const navigate = useNavigate()
  // The queue is already on screen in the console; no toast about it there.
  const onConsole = useLocation({
    select: (location) => location.pathname.startsWith('/support-console'),
  })
  const [state, setState] = useState<RootState>(() =>
    initialState(!!userId, admin)
  )

  useEffect(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('assistant')) return
    url.searchParams.delete('assistant')
    window.history.replaceState(window.history.state, '', url)
  }, [])

  useEffect(() => {
    if (
      admin &&
      new URLSearchParams(window.location.search).get('support') === 'handoffs'
    )
      void navigate({ href: consoleHref('handoffs') })
  }, [admin, navigate])

  useEffect(() => {
    if (!userId) return
    let pending = ''
    try {
      pending = sessionStorage.getItem(PENDING_OPEN_KEY) || ''
      sessionStorage.removeItem(PENDING_OPEN_KEY)
    } catch {
      /* Optional browser storage. */
    }
    if (isConversationId(pending))
      openSupportAgent('chat', { conversation: pending, focusReply: true })
  }, [userId])

  useEffect(() => {
    const show = (event: Event) => {
      const asked = readOpenRequest(event)
      // Queue and knowledge work happens in the support console (administrators);
      // anyone else asking for it gets the conversation.
      if (
        asked.tab !== 'chat' &&
        (useAuthStore.getState().auth.user?.role ?? 0) >= 10
      ) {
        setState((previous) => ({ ...previous, open: false }))
        void navigate({ href: consoleHref(asked.tab) })
        return
      }
      const request: OpenRequest = { ...asked, tab: 'chat' }
      if (request.conversation && userId)
        persistThread(userId, request.conversation)
      setState((previous) => ({
        open: true,
        request,
        // A prompt or a specific conversation starts the panel afresh.
        session:
          request.prompt || request.conversation
            ? previous.session + 1
            : previous.session,
      }))
    }
    const hotkey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault()
        setState((previous) => ({ ...previous, open: !previous.open }))
      }
    }
    const close = () => setState((previous) => ({ ...previous, open: false }))
    window.addEventListener(SUPPORT_CLOSE_EVENT, close)
    window.addEventListener(SUPPORT_OPEN_EVENT, show)
    window.addEventListener('keydown', hotkey)
    return () => {
      window.removeEventListener(SUPPORT_CLOSE_EVENT, close)
      window.removeEventListener(SUPPORT_OPEN_EVENT, show)
      window.removeEventListener('keydown', hotkey)
    }
  }, [userId, navigate])

  const { request } = state
  return (
    <>
      {userId && (
        <ReplyNotifications
          key={`replies-${userId}`}
          userId={userId}
          panelOpen={state.open}
        />
      )}
      {userId && admin && (
        <HandoffNotifications
          key={userId}
          userId={userId}
          panelOpen={state.open || onConsole}
        />
      )}
      {state.open && userId && (
        <Suspense fallback={null}>
          <AgentPanel
            key={`${userId}:${state.session}`}
            userId={userId}
            initialPrompt={request.prompt}
            initialConversation={request.conversation}
            focusReply={request.focusReply}
            onClose={() =>
              setState((previous) => ({ ...previous, open: false }))
            }
          />
        </Suspense>
      )}
      <AssistantActionGuide key={userId} />
    </>
  )
}
