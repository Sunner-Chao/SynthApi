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
import { api } from '@/lib/api'
import type {
  AccountContext,
  AgentAnswer,
  AgentRun,
  HistoryPage,
  ConsoleOverview,
  ContextTurn,
  Conversation,
  Handoff,
  FeedbackReason,
  FeedbackVote,
  Knowledge,
  KnowledgeDocument,
  SupportSettings,
  Ticket,
  UnresolvedReport,
  Workflow,
} from './types'

type Result<T> = { success: boolean; message?: string; data: T }
// Ticket errors are reported by the caller, which words some of them better.
const quietErrors = { skipErrorHandler: true, skipBusinessError: true }
async function unwrap<T>(request: Promise<{ data: Result<T> }>): Promise<T> {
  const response = await request
  if (!response.data.success)
    throw new Error(response.data.message || 'Support request failed')
  return response.data.data
}
export const getHistory = (conversation: string, before = '') =>
  unwrap<HistoryPage>(
    api.get('/api/support-agent/history', { params: { conversation, before } })
  )
// Background checks pass quiet so an unavailable service never raises a toast.
export const getConversations = (
  archived = false,
  q = '',
  offset = 0,
  quiet = false
) =>
  unwrap<{ items: Conversation[]; next_offset: number | null }>(
    api.get('/api/support-agent/conversations', {
      params: { include_archived: archived, q, offset },
      skipErrorHandler: quiet,
      skipBusinessError: quiet,
    })
  )
export const renameConversation = (conversation: string, title: string) =>
  unwrap<{ updated: boolean }>(
    api.patch(`/api/support-agent/conversations/${conversation}`, { title })
  )
export const setConversationArchive = (
  conversation: string,
  archived: boolean
) =>
  unwrap<{ updated: boolean }>(
    api.patch(`/api/support-agent/conversations/${conversation}`, { archived })
  )
export const deleteConversation = (conversation: string) =>
  unwrap<{ deleted: boolean }>(
    api.delete(`/api/support-agent/conversations/${conversation}`)
  )
export const startAgentRun = (body: {
  id: string
  question: string
  conversation: string
  page: string
  // Account data the user chose to share for this question.
  context?: AccountContext[]
}) =>
  unwrap<AgentRun>(
    api.post('/api/support-agent/runs', body, { timeout: 15000 })
  )
export const getAgentRun = (id: string) =>
  unwrap<AgentRun>(api.get(`/api/support-agent/runs/${id}`))
export const cancelAgentRun = (id: string) =>
  unwrap<AgentRun>(api.post(`/api/support-agent/runs/${id}/cancel`))
export const reportAction = (body: {
  conversation: string
  request_id: string
  action_id: string
  status: string
}) =>
  unwrap<{ recorded: boolean }>(
    api.post('/api/support-agent/actions/receipt', body)
  )
export const sendFeedback = (body: {
  conversation: string
  turn_id: string
  vote: FeedbackVote | null
  reason: FeedbackReason
}) =>
  unwrap<{ turn_id: string; vote: FeedbackVote | null; reason: string }>(
    api.post('/api/support-agent/feedback', body, {
      skipErrorHandler: true,
      skipBusinessError: true,
    })
  )
export const requestTicket = (body: {
  conversation: string
  question: string
  note: string
}) =>
  unwrap<{ created: boolean; ticket: Ticket }>(
    api.post('/api/support-agent/tickets', body, quietErrors)
  )
export const addTicketNote = (id: string, note: string) =>
  unwrap<Ticket>(
    api.post(`/api/support-agent/tickets/${id}/note`, { note }, quietErrors)
  )
export const closeTicket = (id: string) =>
  unwrap<Ticket>(api.post(`/api/support-agent/tickets/${id}/close`))
export const askAgent = (
  question: string,
  conversation: string,
  page: string,
  signal: AbortSignal
) =>
  unwrap<AgentAnswer>(
    api.post(
      '/api/support-agent/chat',
      { question, conversation, page },
      { signal, timeout: 120000 }
    )
  )
export const getHandoffs = () =>
  unwrap<{ items: Handoff[]; workflow: Workflow }>(
    api.get('/api/support-agent/handoffs')
  )
export const resolveHandoff = (id: string) =>
  unwrap<{ resolved: boolean }>(
    api.post(`/api/support-agent/handoffs/${id}/resolve`)
  )
export const replyHandoff = (reply: {
  id: string
  replyId: string
  message: string
  // Keep an internal knowledge draft of the case.
  draft: boolean
}) =>
  unwrap<{
    reply_id: string
    status: string
    email_sent: boolean
    email_status: string
    knowledge_draft_id: string
  }>(
    api.post(`/api/support-agent/handoffs/${reply.id}/reply`, {
      reply_id: reply.replyId,
      message: reply.message,
      draft: reply.draft,
    })
  )
export const getKnowledge = () =>
  unwrap<{ items: Knowledge[] }>(api.get('/api/support-agent/knowledge'))
export const getKnowledgeDocument = (id: string) =>
  unwrap<KnowledgeDocument>(api.get(`/api/support-agent/knowledge/${id}`))
export const saveKnowledge = (doc: {
  id: string
  title: string
  source: string
  audience: string
  content: string
  expires?: number
}) =>
  unwrap<{ id: string }>(
    api.post('/api/support-agent/knowledge', doc, { timeout: 120000 })
  )

export const getHandoffContext = (id: string) =>
  unwrap<{ turns: ContextTurn[] }>(
    api.get(`/api/support-agent/handoffs/${id}/context`)
  )
export const getUnresolved = (days: number) =>
  unwrap<UnresolvedReport>(
    api.get('/api/support-agent/admin/unresolved', {
      params: { days },
      timeout: 30000,
    })
  )
export const getConsoleOverview = () =>
  unwrap<ConsoleOverview>(api.get('/api/support-agent/admin/overview'))

export const setDesktopPause = (paused: boolean) =>
  unwrap<{ paused: boolean }>(
    api.post('/api/support-agent/pause', { scope: 'global', paused })
  )

export const getSupportSettings = () =>
  unwrap<SupportSettings>(api.get('/api/support-agent/settings'))
export const saveSupportSettings = (settings: SupportSettings) =>
  unwrap<SupportSettings>(
    api.put('/api/support-agent/admin/settings', settings)
  )
