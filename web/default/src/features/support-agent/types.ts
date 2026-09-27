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
export type Source = {
  id: string
  number: number
  title: string
  source: string
  updated: number
}
export type AgentAnswer = {
  answer: string
  status: 'answered' | 'handoff'
  sources: Source[]
  links: { path: string; label: string }[]
  handoff_id?: string
  request_id: string
  knowledge_version: string
  needs_human: boolean
  human_reply?: boolean
  user_requested?: boolean
  actions?: AgentAction[]
  tool_calls?: ToolCall[]
  // Set on an answer the user stopped while it was being written, or that was
  // cut off (too long, timed out) after part of it had been shown.
  stopped?: boolean
  truncated?: boolean
  // A general answer (greeting, AI or programming concepts) not based on site knowledge.
  general?: boolean
  // The answer needs this account data from the user to be accurate.
  request_context?: AccountContextKind
  // Account data the user shared with this question (the data itself is not kept).
  context_kinds?: AccountContextKind[]
}
// Account data a user can share for one question, formatted in the browser.
export type AccountContextKind =
  | 'recent_requests'
  | 'quota_summary'
  | 'key_status'
export type AccountContext = { kind: AccountContextKind; text: string }
export type AgentAction = {
  id: string
  path: string
  label: string
  description: string
  target: string
  draft?: string
  risk: 'safe' | 'sensitive'
  requires_confirmation: boolean
}
export type ToolCall = {
  id: string
  name: string
  args: Record<string, unknown>
  result: Record<string, unknown>
  status: 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted'
  error: string
  started: number
  finished: number
}
export type Turn = {
  id: string
  question: string
  response: AgentAnswer
  created: number
}
export type Conversation = {
  conversation: string
  title: string
  created: number
  updated: number
  archived: number
  turns: number
  last_question?: string
}
export type Handoff = {
  id: string
  principal: string
  conversation: string
  question: string
  reason: string
  status: string
  created: number
  reply?: string
  knowledge_draft_id?: string
  requester?: {
    id: number
    username: string
    email: string
    quota?: number
    created_at?: number
  }
}
export type Knowledge = {
  id: string
  title: string
  source: string
  audience: string
  updated: number
  expires: number
}
export type KnowledgeDocument = Knowledge & { content: string }

// Support console (administrators). Text arrives with secrets and contact details masked.
export type ContextTurn = {
  id: string
  question: string
  created: number
  answer: string
  status: string
  human_reply: boolean
  handoff_id: string
  stopped: boolean
  sources: string[]
  // Kinds of account data the user shared with the question (older services omit it).
  context_kinds?: AccountContextKind[]
}
// A ticket, or an answer someone marked as not helpful.
export type UnresolvedItem = {
  kind: 'ticket' | 'disliked'
  id: string
  question: string
  created: number
  // Ticket: why it was passed on. Disliked answer: the reason code picked.
  reason: string
  status?: string
  reply?: string
  answer?: string
  sources?: string[]
}
// Questions that ask the same thing, grouped by the service.
export type UnresolvedCluster = {
  id: string
  title: string
  count: number
  tickets: number
  disliked: number
  latest: number
  items: UnresolvedItem[]
}
export type UnresolvedReport = {
  days: number
  mode: 'semantic' | 'lexical'
  clusters: UnresolvedCluster[]
}
export type ConsoleOverview = {
  days: number
  tickets: { pending: number; replied: number; resolved: number }
  votes: { up: number; down: number }
  answers: { total: number; handoff: number }
  // Site tickets only; seconds.
  first_reply: { median: number | null; count: number }
}

// Maintained in the support console; read by everyone who opens the assistant.
export type ServiceHours = {
  weekdays_only: boolean
  start: string
  end: string
  reply_hours: number
}
export type SupportSettings = {
  service_hours: ServiceHours
  // Suggested questions for the Chinese interface, by page prefix ("general" elsewhere).
  starters: Record<string, string[]>
}

export type Workflow = {
  counts: Record<string, number>
  paused: boolean
  jobs: {
    id: string
    contact: string
    status: string
    attempt: number
    created: number
    updated: number
    error: string
  }[]
}

export type AgentRun = {
  id: string
  conversation: string
  question: string
  status:
    | 'queued'
    | 'running'
    | 'completed'
    | 'cancelled'
    | 'failed'
    | 'interrupted'
  result: AgentAnswer
  tool_calls: ToolCall[]
  error: string
  // While running: the answer written so far, once it is known to be grounded.
  partial?: { answer: string; sources: Source[] }
  // While queued: how many questions are ahead of this one.
  queue_ahead?: number
}
export type FeedbackVote = 'up' | 'down'
export type FeedbackReason =
  | ''
  | 'inaccurate'
  | 'unclear'
  | 'not_working'
  | 'other'
export type Ticket = {
  id: string
  status: 'pending' | 'replied' | 'resolved'
  created: number
  updated: number
}
export type HistoryPage = {
  turns: Turn[]
  next_before: string | null
  runs: AgentRun[]
  // Present from the phase-2 service on; older responses omit them.
  feedback?: Record<string, { vote: FeedbackVote; reason: FeedbackReason }>
  tickets?: Ticket[]
}
