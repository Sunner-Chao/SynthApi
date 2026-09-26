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

// Times from the support service are Unix seconds. Components read the clock
// once through secondsNow and pass it in, so rendering stays deterministic.
export const secondsNow = () => Date.now() / 1000

const DAY = 86400

export function startOfDay(seconds: number) {
  const date = new Date(seconds * 1000)
  date.setHours(0, 0, 0, 0)
  return date.getTime() / 1000
}

export function relativeTime(seconds: number, now: number, language: string) {
  const diff = Math.max(0, now - seconds)
  const format = new Intl.RelativeTimeFormat(language, { numeric: 'auto' })
  if (diff < 60) return format.format(0, 'second')
  if (diff < 3600) return format.format(-Math.floor(diff / 60), 'minute')
  if (seconds >= startOfDay(now))
    return format.format(-Math.floor(diff / 3600), 'hour')
  if (seconds >= startOfDay(now) - DAY) return format.format(-1, 'day')
  return new Date(seconds * 1000).toLocaleDateString(language, {
    month: 'short',
    day: 'numeric',
  })
}

export function clockTime(seconds: number, language: string) {
  return new Date(seconds * 1000).toLocaleTimeString(language, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export type DayGroup = 'today' | 'yesterday' | 'week' | 'earlier'

export function dayGroup(seconds: number, now: number): DayGroup {
  const today = startOfDay(now)
  if (seconds >= today) return 'today'
  if (seconds >= today - DAY) return 'yesterday'
  if (seconds >= today - 6 * DAY) return 'week'
  return 'earlier'
}
