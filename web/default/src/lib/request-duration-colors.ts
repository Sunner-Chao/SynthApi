/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

export type RequestDurationColor = 'success' | 'warning' | 'danger'

/**
 * Keep request-duration colors consistent across usage logs and monitoring.
 * Durations are expressed in seconds to match the usage-log formatter.
 */
export function getRequestDurationColor(
  seconds: number
): RequestDurationColor {
  if (seconds < 10) return 'success'
  if (seconds < 30) return 'warning'
  return 'danger'
}

export function getRequestDurationColorFromMs(
  milliseconds: number
): RequestDurationColor {
  return getRequestDurationColor(milliseconds / 1000)
}

export function getRequestThroughputColor(
  tokensPerSecond: number
): RequestDurationColor {
  if (tokensPerSecond >= 30) return 'success'
  if (tokensPerSecond >= 15) return 'warning'
  return 'danger'
}

/**
 * Match the usage-log Total badge: use measured generation throughput when it
 * is reliable, otherwise fall back to end-to-end request duration.
 */
export function getRequestResponseColor(
  seconds: number,
  completionTokens: number,
  tokensPerSecond?: number | null
): RequestDurationColor {
  if (
    completionTokens < 100 ||
    tokensPerSecond == null ||
    !Number.isFinite(tokensPerSecond) ||
    tokensPerSecond <= 0 ||
    tokensPerSecond > 1_000
  ) {
    return getRequestDurationColor(seconds)
  }
  return getRequestThroughputColor(tokensPerSecond)
}
