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
import type { LogOtherData, RelayTraceAttempt, UsageLog } from '../types'

export type ThroughputDurationSource = 'upstream_after_first_event'

export type ThroughputUnavailabilityReason =
  | 'buffered_stream'
  | 'incomplete_stream'
  | 'unreliable_timing'
  | 'unreliable_tokens'
  | 'implausible_rate'

export interface LogThroughput {
  tokensPerSecond: number
  durationMs: number
  source: ThroughputDurationSource
}

export interface LogThroughputAssessment {
  throughput: LogThroughput | null
  unavailableReason: ThroughputUnavailabilityReason | null
}

// A sub-second tail after an SSE event is too short to be a useful generation
// sample. It is commonly the final flush of a buffered upstream response.
const minimumMeasuredDurationMs = 1_000
const maximumMeasuredTokensPerSecond = 1_000

function positiveFinite(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null
}

function hasLargeUnparsedBodyLead(attempt: RelayTraceAttempt): boolean {
  const bodyReadSpan = positiveFinite(attempt.application_body_read_span_ms)
  const streamSpan = positiveFinite(
    attempt.application_stream_after_first_event_ms
  )
  if (bodyReadSpan == null || streamSpan == null || bodyReadSpan <= streamSpan) {
    return false
  }

  // The difference is time spent reading an upstream response body before the
  // first valid SSE event. A substantial lead means this is not a continuous
  // token stream even when the final SSE tail happens to be long enough.
  const unparsedBodyLead = bodyReadSpan - streamSpan
  return unparsedBodyLead >= Math.max(minimumMeasuredDurationMs, streamSpan / 4)
}

function makeThroughput(
  completionTokens: number,
  durationMs: number,
  source: ThroughputDurationSource
): LogThroughput | null {
  if (durationMs < minimumMeasuredDurationMs) return null

  const tokensPerSecond = (completionTokens * 1000) / durationMs
  if (
    !Number.isFinite(tokensPerSecond) ||
    tokensPerSecond <= 0 ||
    tokensPerSecond > maximumMeasuredTokensPerSecond
  ) {
    return null
  }

  return { tokensPerSecond, durationMs, source }
}

/**
 * Show exact TPS only when the upstream trace establishes a continuous SSE
 * window. Full relay time and old second-resolution fields include upload,
 * queueing, and prompt processing, so they are never used as TPS fallbacks.
 */
export function getLogThroughputAssessment(
  log: UsageLog,
  other: LogOtherData | null | undefined
): LogThroughputAssessment {
  if (!log.is_stream) {
    return { throughput: null, unavailableReason: null }
  }
  if (!Number.isFinite(log.completion_tokens) || log.completion_tokens <= 0) {
    return { throughput: null, unavailableReason: 'unreliable_tokens' }
  }
  if (other?.stream_status != null && other.stream_status.status !== 'ok') {
    return { throughput: null, unavailableReason: 'incomplete_stream' }
  }
  if (other?.admin_info?.local_count_tokens === true) {
    return { throughput: null, unavailableReason: 'unreliable_tokens' }
  }

  const trace = other?.relay_trace
  const attempts = trace?.attempts
  const lastAttempt =
    attempts && attempts.length > 0 ? attempts[attempts.length - 1] : undefined

  const streamDuration = positiveFinite(
    lastAttempt?.application_stream_after_first_event_ms
  )
  if (lastAttempt == null || streamDuration == null) {
    return { throughput: null, unavailableReason: 'unreliable_timing' }
  }
  if (
    streamDuration < minimumMeasuredDurationMs ||
    hasLargeUnparsedBodyLead(lastAttempt)
  ) {
    return { throughput: null, unavailableReason: 'buffered_stream' }
  }

  const throughput = makeThroughput(
    log.completion_tokens,
    streamDuration,
    'upstream_after_first_event'
  )
  return throughput == null
    ? { throughput: null, unavailableReason: 'implausible_rate' }
    : { throughput, unavailableReason: null }
}

export function getLogThroughput(
  log: UsageLog,
  other: LogOtherData | null | undefined
): LogThroughput | null {
  return getLogThroughputAssessment(log, other).throughput
}

export function formatTokensPerSecond(tokensPerSecond: number): string {
  if (!Number.isFinite(tokensPerSecond) || tokensPerSecond <= 0) return '-'
  return tokensPerSecond.toFixed(1)
}
