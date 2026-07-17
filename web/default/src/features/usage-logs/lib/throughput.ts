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
import type { LogOtherData, UsageLog } from '../types'

export type ThroughputDurationSource =
  | 'upstream_after_first_event'
  | 'client_stream_span'
  | 'gateway_after_first_event'
  | 'request_after_first_response'

export interface LogThroughput {
  tokensPerSecond: number
  durationMs: number
  source: ThroughputDurationSource
  estimated: boolean
}

interface DurationCandidate {
  durationMs: number | null | undefined
  source: ThroughputDurationSource
  estimated: boolean
}

function positiveFinite(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null
}

/**
 * Calculate streaming output throughput without including request upload,
 * queueing, preprocessing, or time-to-first-token in the denominator.
 */
export function getLogThroughput(
  log: UsageLog,
  other: LogOtherData | null | undefined
): LogThroughput | null {
  if (
    !log.is_stream ||
    !Number.isFinite(log.completion_tokens) ||
    log.completion_tokens <= 0
  ) {
    return null
  }

  const trace = other?.relay_trace
  const attempts = trace?.attempts
  const lastAttempt =
    attempts && attempts.length > 0 ? attempts[attempts.length - 1] : undefined
  const gatewayAfterFirstEvent =
    trace?.total_ms != null && trace.gateway?.first_event_ms != null
      ? trace.total_ms - trace.gateway.first_event_ms
      : null
  const requestAfterFirstResponse =
    other?.frt != null && Number.isFinite(log.use_time)
      ? log.use_time * 1000 - other.frt
      : null

  const candidates: DurationCandidate[] = [
    {
      durationMs: lastAttempt?.application_stream_after_first_event_ms,
      source: 'upstream_after_first_event',
      estimated: false,
    },
    {
      durationMs: trace?.client?.stream_span_ms,
      source: 'client_stream_span',
      estimated: false,
    },
    {
      durationMs: gatewayAfterFirstEvent,
      source: 'gateway_after_first_event',
      estimated: true,
    },
    {
      durationMs: requestAfterFirstResponse,
      source: 'request_after_first_response',
      estimated: true,
    },
  ]

  for (const candidate of candidates) {
    const durationMs = positiveFinite(candidate.durationMs)
    if (durationMs == null) continue

    const tokensPerSecond = (log.completion_tokens * 1000) / durationMs
    if (!Number.isFinite(tokensPerSecond) || tokensPerSecond <= 0) continue

    return {
      tokensPerSecond,
      durationMs,
      source: candidate.source,
      estimated: candidate.estimated,
    }
  }

  return null
}

export function formatTokensPerSecond(tokensPerSecond: number): string {
  if (!Number.isFinite(tokensPerSecond) || tokensPerSecond <= 0) return '-'
  return tokensPerSecond.toFixed(1)
}
