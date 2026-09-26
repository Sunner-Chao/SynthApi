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
  actions?: AgentAction[]
  tool_calls?: ToolCall[]
}
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
  requester?: { id: number; username: string; email: string }
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
}
export type HistoryPage = {
  turns: Turn[]
  next_before: string | null
  runs: AgentRun[]
}
