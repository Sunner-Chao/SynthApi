import type { LogOtherData, RelayTraceAttempt, UsageLog } from '../types'

export type FirstResponseLatencySource =
  | 'upstream_first_event'
  | 'upstream_first_body'
  | 'end_to_end'

export interface FirstResponseLatency {
  milliseconds: number
  source: FirstResponseLatencySource
}

function validLatency(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null
  return value
}

export function getFinalRelayAttempt(
  other: LogOtherData | null
): RelayTraceAttempt | null {
  const attempts = other?.relay_trace?.attempts
  if (!Array.isArray(attempts) || attempts.length === 0) return null
  return attempts[attempts.length - 1] ?? null
}

export function getUpstreamFirstResponseLatency(
  log: Pick<UsageLog, 'is_stream'>,
  other: LogOtherData | null
): FirstResponseLatency | null {
  const attempt = getFinalRelayAttempt(other)
  const source: FirstResponseLatencySource = log.is_stream
    ? 'upstream_first_event'
    : 'upstream_first_body'
  const milliseconds = validLatency(
    log.is_stream
      ? attempt?.upstream_to_first_event_ms
      : attempt?.application_first_body_read_ms
  )

  return milliseconds == null ? null : { milliseconds, source }
}

export function getEndToEndFirstResponseLatency(
  other: LogOtherData | null
): FirstResponseLatency | null {
  const milliseconds = validLatency(other?.frt)
  return milliseconds == null ? null : { milliseconds, source: 'end_to_end' }
}

export function getLogFirstResponseLatency(
  log: Pick<UsageLog, 'is_stream'>,
  other: LogOtherData | null
): FirstResponseLatency | null {
  return (
    getUpstreamFirstResponseLatency(log, other) ??
    getEndToEndFirstResponseLatency(other)
  )
}
