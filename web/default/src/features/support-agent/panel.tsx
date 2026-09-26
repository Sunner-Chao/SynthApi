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
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useLocation } from '@tanstack/react-router'
import { Bot, Headset, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/hooks/use-media-query'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'
import { AgentAnswerContent } from './answer'
import { Composer } from './composer'
import { Conversations } from './conversations'
import { EmptyState } from './empty-state'
import { exportConversation, type ExportLabels } from './export'
import { AgentManagement } from './management'
import { pageContext } from './page-context'
import { PanelHeader } from './panel-header'
import { useHandoffQueue, type AgentTab } from './queue'
import { markRepliesSeen, useSupportReplies } from './replies'
import { ResizeHandle } from './resize-handle'
import { maskSecrets } from './secrets'
import {
  PANEL_WIDTH,
  PANEL_WIDTH_VAR,
  persistThread,
  readDraft,
  readPanelWidth,
  savePanelWidth,
  storedThread,
  writeDraft,
} from './storage'
import { StreamingAnswer } from './streaming-answer'
import { RunProgress, StoppedSteps } from './tool-calls'
import type { Turn } from './types'
import { useAgentThread } from './use-agent-thread'

const plainText = (markdown: string) =>
  markdown
    .replace(/\[(\d{1,3})\]/g, '')
    .replace(/[#*_`>|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200)

// Toasts sit outside the panel; pressing one (e.g. its close button) is not a click away.
const onToast = (event: Event) => {
  const target =
    event instanceof FocusEvent ? event.relatedTarget : event.target
  return target instanceof Element && !!target.closest('[data-sonner-toaster]')
}

export default function AgentPanel(props: {
  userId: number
  onClose: () => void
  tab: AgentTab
  onTabChange: (tab: AgentTab) => void
  initialPrompt?: string
  initialConversation?: string
  focusReply?: boolean
}) {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.auth.user)
  const admin = (user?.role ?? 0) >= 10
  const page = useLocation({ select: (l) => l.pathname })
  const context = pageContext(page)
  const touch = useMediaQuery('(pointer: coarse)')
  const [conversation, setConversation] = useState(
    () => props.initialConversation || storedThread(props.userId)
  )
  const [question, setQuestion] = useState(
    () => props.initialPrompt || readDraft(props.userId, conversation)
  )
  const [includePage, setIncludePage] = useState(true)
  const [notice, setNotice] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [width, setWidth] = useState(readPanelWidth)
  const wide = width >= (PANEL_WIDTH.normal + PANEL_WIDTH.wide) / 2
  const resize = (value: number) => {
    setWidth(value)
    savePanelWidth(value)
  }
  const [exporting, setExporting] = useState(false)
  const view: AgentTab = admin ? props.tab : 'chat'
  const queue = useHandoffQueue()
  const pendingCount =
    queue.data?.items.filter((item) => item.status === 'pending').length ?? 0
  const replies = useSupportReplies(props.userId)
  const thread = useAgentThread(
    props.userId,
    conversation,
    includePage && context ? page : ''
  )
  const history = thread.history
  const input = useRef<HTMLTextAreaElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const focusReply = useRef(!!props.focusReply)
  const scrolled = useRef(false)
  // True while the reader is at the end of the conversation; then new text is followed.
  const atEnd = useRef(true)

  // A run that just finished (or was stopped with text kept) is shown straight
  // away, before history reloads.
  const run = thread.run
  const finished =
    (run?.status === 'completed' ||
      (run?.status === 'cancelled' && run.result?.stopped)) &&
    run.result &&
    !thread.turns.some(
      (turn) => turn.response.request_id === run.result.request_id
    )
      ? ({
          id: run.id,
          question: run.question,
          response: run.result,
          created: 0,
        } satisfies Turn)
      : null
  const turns = finished ? [...thread.turns, finished] : thread.turns
  const lastTurnId = turns.at(-1)?.id
  const repliedHandoffs = new Set(
    turns
      .filter((turn) => turn.response.human_reply && turn.response.handoff_id)
      .map((turn) => turn.response.handoff_id)
  )
  const tickets = new Map(thread.tickets.map((ticket) => [ticket.id, ticket]))
  // A ticket can span several turns (request, notes); only its latest turn shows actions.
  const lastTicketTurn = new Map(
    turns.flatMap((turn) =>
      turn.response.handoff_id
        ? [[turn.response.handoff_id, turn.id] as const]
        : []
    )
  )
  const unread = new Set(replies.unread.map((item) => item.conversation))
  const unreadHere = replies.unread.find(
    (item) => item.conversation === conversation
  )?.updated
  const refetchHistory = history.refetch
  const refetchReplies = replies.refetch

  useEffect(() => {
    persistThread(props.userId, conversation)
  }, [props.userId, conversation])

  useEffect(() => {
    if (!unreadHere) return
    markRepliesSeen(props.userId, conversation, unreadHere)
    void refetchHistory()
  }, [unreadHere, conversation, props.userId, refetchHistory])

  // Refresh titles and unread markers once an answer is saved.
  const answeredRun = run?.status === 'completed' ? run.id : ''
  useEffect(() => {
    if (answeredRun) void refetchReplies()
  }, [answeredRun, refetchReplies])

  // Another conversation starts at its end.
  useEffect(() => {
    atEnd.current = true
  }, [conversation])

  useEffect(() => {
    if (!lastTurnId && !thread.isPending) return
    if (focusReply.current) {
      const answers =
        scroller.current?.querySelectorAll<HTMLElement>('[data-human-reply]')
      const target = answers?.[answers.length - 1]
      if (target) {
        focusReply.current = false
        scrolled.current = true
        target.scrollIntoView({ block: 'start' })
        return
      }
    }
    // A question just sent always shows; a finished answer does not pull the
    // view down when the reader scrolled up while it was being written.
    if (!thread.isPending && !atEnd.current) return
    bottom.current?.scrollIntoView({
      behavior: scrolled.current ? 'smooth' : 'auto',
    })
    scrolled.current = true
  }, [lastTurnId, thread.isPending])

  // Follow the answer while it is written, unless the reader scrolled up to read.
  const writtenLength = run?.partial?.answer.length ?? 0
  useEffect(() => {
    if (writtenLength && atEnd.current)
      bottom.current?.scrollIntoView({ block: 'end' })
  }, [writtenLength])

  const updateQuestion = (value: string) => {
    setQuestion(value)
    writeDraft(props.userId, conversation, value)
    if (notice) setNotice('')
  }
  const send = (raw: string) => {
    const text = raw.trim()
    if (!text || thread.isPending) return
    const masked = maskSecrets(text, t('[private key removed]'))
    if (masked.count) {
      updateQuestion(masked.text)
      setNotice(
        t('Hid {{count}} secrets in your message. Check it, then send again.', {
          count: masked.count,
        })
      )
      input.current?.focus()
      return
    }
    thread.send(text)
    setQuestion('')
    setNotice('')
    writeDraft(props.userId, conversation, '')
  }
  const selectConversation = (id: string) => {
    setConversation(id)
    setShowHistory(false)
    setQuestion(readDraft(props.userId, id))
    setNotice('')
  }
  const fresh = () => selectConversation(crypto.randomUUID())
  const rephrase = (text: string) => {
    updateQuestion(text)
    input.current?.focus()
  }
  const exportLabels: ExportLabels = {
    you: t('You'),
    assistant: t('Site assistant'),
    support: t('Reply from the support team'),
    sources: t('Sources'),
  }
  const current = replies.recent.find(
    (item) => item.conversation === conversation
  )
  const title = current?.title || turns[0]?.question || t('New conversation')
  const exportCurrent = () => {
    setExporting(true)
    exportConversation(conversation, title, exportLabels)
      .catch(() =>
        toast.error(t('Unable to export this conversation. Please retry.'))
      )
      .finally(() => setExporting(false))
  }
  const showEmpty =
    !history.isLoading &&
    !history.isError &&
    !turns.length &&
    !thread.isPending &&
    !thread.isError
  const announcement =
    run?.status === 'completed' && run.result?.answer
      ? `${t('Answer ready')}: ${plainText(run.result.answer)}`
      : run?.status === 'cancelled' && run.result?.stopped
        ? t('Stopped. The answer so far is kept.')
        : ''
  const lastQuestionTurn = [...turns].reverse().find((turn) => turn.question)

  return (
    <Sheet
      open
      onOpenChange={(open, details) => {
        if (open) return
        if (
          (details.reason === 'outside-press' ||
            details.reason === 'focus-out') &&
          onToast(details.event)
        ) {
          details.cancel()
          return
        }
        // Escape closes the history layer first, then the panel.
        if (details.reason === 'escape-key' && showHistory) {
          details.cancel()
          setShowHistory(false)
          return
        }
        props.onClose()
      }}
      modal={false}
    >
      <SheetContent
        showOverlay={false}
        showCloseButton={false}
        initialFocus={touch ? undefined : input}
        style={{ [PANEL_WIDTH_VAR]: `${width}px` } as CSSProperties}
        className='support-agent-panel w-full gap-0 shadow-xl sm:max-w-[var(--agent-panel-width)]'
      >
        <ResizeHandle width={width} onCommit={resize} />
        <SheetTitle className='sr-only'>{t('Site assistant')}</SheetTitle>
        <SheetDescription className='sr-only'>
          {t('Answers from the SynthAPI knowledge base')}
        </SheetDescription>
        <PanelHeader
          view={view}
          title={title}
          admin={admin}
          pendingCount={pendingCount}
          otherUnread={[...unread].some((id) => id !== conversation)}
          historyOpen={showHistory}
          wide={wide}
          busy={thread.isPending}
          canExport={turns.length > 0 && !exporting}
          onToggleHistory={() => setShowHistory((value) => !value)}
          onOpenHistory={() => {
            props.onTabChange('chat')
            setShowHistory(true)
          }}
          onNew={fresh}
          onToggleWide={() =>
            resize(wide ? PANEL_WIDTH.normal : PANEL_WIDTH.wide)
          }
          onExport={exportCurrent}
          onView={(tab) => {
            setShowHistory(false)
            props.onTabChange(tab)
          }}
          onClose={props.onClose}
        />
        <div className='agent-body'>
          {showHistory && view === 'chat' && (
            <>
              <button
                type='button'
                className='agent-history-scrim'
                aria-label={t('Close conversation history')}
                onClick={() => setShowHistory(false)}
              />
              <Conversations
                userId={props.userId}
                current={conversation}
                unread={unread}
                busy={thread.isPending}
                exportLabels={exportLabels}
                onSelect={selectConversation}
                onRemoved={fresh}
                onChanged={(id) => {
                  markRepliesSeen(props.userId, id)
                  void refetchReplies()
                }}
              />
            </>
          )}
          {view !== 'chat' ? (
            <AgentManagement tab={view} />
          ) : (
            <>
              <div
                ref={scroller}
                className='agent-conversation'
                aria-busy={thread.isPending}
                onScroll={(event) => {
                  const el = event.currentTarget
                  atEnd.current =
                    el.scrollHeight - el.scrollTop - el.clientHeight < 80
                }}
              >
                {history.isLoading && (
                  <Loader2 className='text-muted-foreground mx-auto my-8 size-5 animate-spin' />
                )}
                {history.isError && (
                  <p className='text-destructive text-sm'>
                    {t('Unable to load conversation. Please retry.')}
                    <Button
                      size='sm'
                      variant='ghost'
                      onClick={() => {
                        void history.refetch()
                      }}
                    >
                      {t('Retry')}
                    </Button>
                  </p>
                )}
                {showEmpty && (
                  <EmptyState
                    name={user?.display_name || user?.username || ''}
                    context={context}
                    recent={replies.recent
                      .filter((item) => item.conversation !== conversation)
                      .slice(0, 3)}
                    onAsk={send}
                    onOpen={selectConversation}
                  />
                )}
                {history.hasNextPage && (
                  <Button
                    size='sm'
                    variant='ghost'
                    className='mx-auto mb-4 flex'
                    disabled={history.isFetchingNextPage}
                    onClick={() => {
                      void history.fetchNextPage()
                    }}
                  >
                    {t('Load earlier messages')}
                  </Button>
                )}
                {turns.map((turn) => {
                  const human = !!turn.response.human_reply
                  return (
                    <article
                      key={turn.id}
                      className='agent-turn'
                      data-human-reply={human || undefined}
                    >
                      {turn.question && (
                        <div className='agent-user-message'>
                          {turn.question}
                        </div>
                      )}
                      <div className='agent-bot-row'>
                        <span
                          className={cn('agent-avatar', human && 'is-human')}
                          aria-hidden
                        >
                          {human ? (
                            <Headset className='size-3.5' />
                          ) : (
                            <Bot className='size-3.5' />
                          )}
                        </span>
                        <div className='min-w-0 flex-1'>
                          <AgentAnswerContent
                            turn={turn}
                            conversation={conversation}
                            userId={props.userId}
                            admin={admin}
                            hasEmail={!!user?.email}
                            replied={
                              !!turn.response.handoff_id &&
                              repliedHandoffs.has(turn.response.handoff_id)
                            }
                            ticket={
                              turn.response.handoff_id
                                ? tickets.get(turn.response.handoff_id)
                                : undefined
                            }
                            showTicketActions={
                              !!turn.response.handoff_id &&
                              lastTicketTurn.get(turn.response.handoff_id) ===
                                turn.id
                            }
                            saved={thread.feedback[turn.id]}
                            canRegenerate={
                              !!turn.question &&
                              turn.id === lastQuestionTurn?.id
                            }
                            busy={thread.isPending}
                            onRegenerate={() => send(turn.question)}
                            onRephrase={() => rephrase(turn.question)}
                          />
                        </div>
                      </div>
                    </article>
                  )
                })}
                {thread.isPending && (
                  <div className='agent-turn'>
                    <div className='agent-user-message'>
                      {run?.question || thread.lastQuestion}
                    </div>
                    <div className='agent-bot-row'>
                      <span className='agent-avatar' aria-hidden>
                        <Bot className='size-3.5' />
                      </span>
                      {run?.partial ? (
                        <StreamingAnswer runId={run.id} partial={run.partial} />
                      ) : (
                        <RunProgress run={run} />
                      )}
                    </div>
                  </div>
                )}
                {thread.previousRuns.length > 0 && (
                  <details className='agent-stopped'>
                    <summary>
                      {t('{{count}} earlier requests did not finish', {
                        count: thread.previousRuns.length,
                      })}
                    </summary>
                    {thread.previousRuns.map((item) => (
                      <div key={item.id} className='agent-stopped-item'>
                        <p>{item.question}</p>
                        <small>
                          {item.status === 'cancelled'
                            ? t('Cancelled')
                            : t('Interrupted')}
                        </small>
                        <StoppedSteps calls={item.tool_calls || []} />
                        <Button
                          size='sm'
                          variant='ghost'
                          disabled={thread.isPending}
                          onClick={() => send(item.question)}
                        >
                          {t('Retry')}
                        </Button>
                      </div>
                    ))}
                  </details>
                )}
                {run?.status === 'cancelled' && !run.result?.stopped && (
                  <p className='agent-inline-note'>
                    {t('Stopped. Your previous messages are saved.')}
                  </p>
                )}
                {thread.pollingError && (
                  <Button size='sm' variant='outline' onClick={thread.refetch}>
                    {t(
                      'Connection interrupted. Reconnect to check task status.'
                    )}
                  </Button>
                )}
                {thread.isError && (
                  <div role='alert' className='agent-error'>
                    {t('Unable to answer right now. Please try again.')}
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => send(thread.lastQuestion)}
                    >
                      {t('Retry')}
                    </Button>
                  </div>
                )}
                <div ref={bottom} />
              </div>
              <Composer
                inputRef={input}
                value={question}
                onChange={updateQuestion}
                onSubmit={() => send(question)}
                onStop={thread.cancel}
                pending={thread.isPending}
                stopping={thread.cancelling}
                pageLabel={context ? t(context.label) : ''}
                includePage={includePage}
                onIncludePageChange={setIncludePage}
                notice={notice}
              />
            </>
          )}
        </div>
        <div className='sr-only' aria-live='polite'>
          {announcement}
        </div>
      </SheetContent>
    </Sheet>
  )
}
