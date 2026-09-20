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
export type ServiceHealth = 'healthy' | 'warning' | 'critical' | 'unknown'

export type HealthSample = {
  success_rate: number
  request_count?: number
  success_count?: number
}

// Availability is independent of generation speed. Keep measured rates intact;
// require enough evidence before presenting a severe aggregate failure.
export function serviceHealth(
  rate: number,
  requestCount?: number
): ServiceHealth {
  if (
    !Number.isFinite(rate) ||
    (requestCount != null &&
      (!Number.isFinite(requestCount) || requestCount <= 0))
  )
    return 'unknown'
  if (rate >= 90) return 'healthy'
  if (rate < 50 && requestCount != null && requestCount >= 10) return 'critical'
  return 'warning'
}

export const healthPresentation = {
  healthy: {
    bar: 'bg-emerald-500 dark:bg-emerald-400',
    text: 'text-emerald-600 dark:text-emerald-400',
    surface:
      'border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-500/20 dark:bg-emerald-500/10',
    height: 'h-full',
    color: '#10b981',
    intent: 'success',
    label: 'Available',
  },
  warning: {
    bar: 'bg-amber-400 dark:bg-amber-300',
    text: 'text-amber-600 dark:text-amber-400',
    surface:
      'border-amber-200/80 bg-amber-50/70 dark:border-amber-500/25 dark:bg-amber-500/10',
    height: 'h-[72%]',
    color: '#fbbf24',
    intent: 'warning',
    label: 'Some requests failed',
  },
  critical: {
    bar: 'bg-rose-500 dark:bg-rose-400',
    text: 'text-rose-600 dark:text-rose-400',
    surface:
      'border-rose-200/80 bg-rose-50/70 dark:border-rose-500/25 dark:bg-rose-500/10',
    height: 'h-[40%]',
    color: '#f43f5e',
    intent: 'danger',
    label: 'High failure rate',
  },
  unknown: {
    bar: 'bg-slate-200/80 dark:bg-white/10',
    text: 'text-muted-foreground',
    surface: 'border-border bg-muted/30',
    height: 'h-[40%]',
    color: '#94a3b8',
    intent: 'default',
    label: 'No request data',
  },
} as const

export function summarizeHealth(samples: HealthSample[]): HealthSample {
  const valid = samples.filter(
    (sample) =>
      serviceHealth(sample.success_rate, sample.request_count) !== 'unknown'
  )
  if (valid.length === 0)
    return { success_rate: Number.NaN, request_count: 0, success_count: 0 }
  // Legacy responses without counts cannot be weighted reliably. They also
  // cannot establish the sample size required for a critical status.
  if (valid.some((sample) => sample.request_count == null)) {
    return {
      success_rate:
        valid.reduce((sum, sample) => sum + sample.success_rate, 0) /
        valid.length,
    }
  }
  const requestCount = valid.reduce(
    (sum, sample) => sum + (sample.request_count ?? 0),
    0
  )
  const successCount = valid.reduce(
    (sum, sample) =>
      sum +
      (sample.success_count ??
        (sample.success_rate * (sample.request_count ?? 0)) / 100),
    0
  )
  return {
    success_rate: (successCount / requestCount) * 100,
    request_count: requestCount,
    success_count: successCount,
  }
}

export const DISPLAY_RECENT_REQUEST_COUNT = 30

export function recentRequestHealth(
  success: boolean,
  consecutiveFailures: number
): ServiceHealth {
  if (success) return 'healthy'
  return consecutiveFailures >= 3 ? 'critical' : 'warning'
}

export function summarizeRecentRequests(
  requests: { success: boolean }[]
): HealthSample {
  const displayed = requests.slice(-DISPLAY_RECENT_REQUEST_COUNT)
  const successCount = displayed.filter((request) => request.success).length
  return {
    success_rate: displayed.length
      ? (successCount / displayed.length) * 100
      : Number.NaN,
    request_count: displayed.length,
    success_count: successCount,
  }
}
