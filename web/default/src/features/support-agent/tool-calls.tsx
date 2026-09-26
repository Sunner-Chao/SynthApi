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
import { useEffect, useState } from 'react'
import type { TFunction } from 'i18next'
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  ListChecks,
  Loader2,
  XCircle,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AgentRun, ToolCall } from './types'

const STEP_NAMES: Record<string, string> = {
  knowledge_search: 'Search knowledge',
  answer_generation: 'Compose answer',
  page_guide: 'Page guidance',
}

function stepName(call: ToolCall, t: TFunction) {
  return STEP_NAMES[call.name] ? t(STEP_NAMES[call.name]) : call.name
}

// Plain-language result of a step; raw parameters stay in the developer view.
function stepNote(call: ToolCall, t: TFunction) {
  if (call.status === 'failed') return t('Did not finish')
  if (call.status === 'cancelled') return t('Cancelled')
  if (call.status === 'interrupted') return t('Interrupted')
  if (call.name === 'knowledge_search' && call.status === 'succeeded') {
    const count = Number(call.result?.source_count)
    if (Number.isFinite(count))
      return count > 0
        ? t('{{count}} documents found', { count })
        : t('No matching documents')
  }
  return ''
}

function totalSeconds(calls: ToolCall[]) {
  const starts = calls.map((call) => call.started).filter((v) => v > 0)
  const ends = calls.map((call) => call.finished).filter((v) => v > 0)
  if (!starts.length || !ends.length) return 0
  return Math.max(0, Math.max(...ends) - Math.min(...starts))
}

function StepIcon(props: { status: ToolCall['status'] }) {
  if (props.status === 'running')
    return <Loader2 className='size-3.5 shrink-0 animate-spin' />
  if (props.status === 'succeeded')
    return <CheckCircle2 className='agent-step-ok size-3.5 shrink-0' />
  if (props.status === 'failed')
    return <XCircle className='text-destructive size-3.5 shrink-0' />
  return <Ban className='size-3.5 shrink-0' />
}

function StepList(props: { calls: ToolCall[] }) {
  const { t } = useTranslation()
  return (
    <ol className='agent-step-list'>
      {props.calls.map((call) => {
        const note = stepNote(call, t)
        return (
          <li key={call.id} data-status={call.status}>
            <StepIcon status={call.status} />
            <span>{stepName(call, t)}</span>
            {note && <small>{note}</small>}
          </li>
        )
      })}
    </ol>
  )
}

// Raw arguments and results are only useful to administrators debugging the agent.
function DeveloperDetails(props: { calls: ToolCall[] }) {
  const { t } = useTranslation()
  return (
    <details className='agent-dev-details'>
      <summary>{t('Developer details')}</summary>
      {props.calls.map((call) => (
        <div key={call.id} className='agent-dev-call'>
          <p>
            {call.name} · {call.status} ·{' '}
            {new Date(call.started * 1000).toLocaleTimeString()}
            {call.finished > 0 &&
              ` · ${Math.max(0, call.finished - call.started).toFixed(1)}s`}
          </p>
          <pre>{JSON.stringify(call.args, null, 2)}</pre>
          <pre>{JSON.stringify(call.result, null, 2)}</pre>
          {!!call.error && <p>{call.error}</p>}
        </div>
      ))}
    </details>
  )
}

// One collapsed line above a finished answer: what the assistant did and how long it took.
export function StepsSummary(props: { calls: ToolCall[]; admin: boolean }) {
  const { t } = useTranslation()
  if (!props.calls.length) return null
  const seconds = totalSeconds(props.calls)
  return (
    <details className='agent-steps'>
      <summary>
        <ListChecks className='size-3.5 shrink-0' />
        <span>
          {t('{{count}} steps completed', { count: props.calls.length })}
          {seconds > 0 &&
            ` · ${t('{{seconds}} s', { seconds: seconds.toFixed(1) })}`}
        </span>
        <ChevronDown className='agent-steps-chevron size-3.5 shrink-0' />
      </summary>
      <StepList calls={props.calls} />
      {props.admin && <DeveloperDetails calls={props.calls} />}
    </details>
  )
}

// Live progress while a run is queued or working.
export function RunProgress(props: { run?: AgentRun | null }) {
  const { t } = useTranslation()
  const [tenths, setTenths] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setTenths((value) => value + 1), 100)
    return () => window.clearInterval(timer)
  }, [])
  const calls = props.run?.tool_calls ?? []
  const queued = !props.run || props.run.status === 'queued'
  const working = calls.some((call) => call.status === 'running')
  return (
    <div className='agent-progress' role='status'>
      <div className='agent-progress-head'>
        <Loader2 className='size-3.5 shrink-0 animate-spin' />
        <span>{queued ? t('Waiting to start…') : t('Working on it')}</span>
        <span className='agent-progress-time'>
          {t('{{seconds}} s', { seconds: (tenths / 10).toFixed(1) })}
        </span>
      </div>
      {calls.length > 0 && <StepList calls={calls} />}
      {!queued && !working && (
        <p className='agent-progress-next'>
          {calls.length
            ? t('Putting the answer together…')
            : t('Reading your question…')}
        </p>
      )}
    </div>
  )
}

// Compact record for runs that stopped before answering.
export function StoppedSteps(props: { calls: ToolCall[] }) {
  if (!props.calls.length) return null
  return <StepList calls={props.calls} />
}
