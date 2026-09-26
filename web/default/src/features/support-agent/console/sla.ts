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

// The reply promise ("usually within N hours") only counts time inside the
// published service hours, in China time (UTC+8 all year), whatever the
// browser's time zone is.
export type ReplyWindow = {
  weekdays_only: boolean
  start: string
  end: string
  reply_hours: number
}

const CHINA_OFFSET = 8 * 3600 * 1000
const DAY = 86400 * 1000
const MINUTE = 60 * 1000
// Enough for 72 working hours even with a one-hour working day.
const MAX_DAYS = 120

const minutesOf = (clock: string) => {
  const [hours, minutes] = clock.split(':').map(Number)
  return hours * 60 + minutes
}

// When a ticket created at `created` (Unix seconds) is due, in epoch milliseconds.
export function replyDeadline(created: number, window: ReplyWindow): number {
  const open = minutesOf(window.start) * MINUTE
  const close = minutesOf(window.end) * MINUTE
  let left = window.reply_hours * 60 * MINUTE
  // Shifted so that UTC calendar arithmetic reads China wall-clock time.
  let at = created * 1000 + CHINA_OFFSET
  for (let day = 0; left > 0 && day < MAX_DAYS; day++) {
    const midnight = Math.floor(at / DAY) * DAY
    const weekday = new Date(midnight).getUTCDay()
    const working = !window.weekdays_only || (weekday >= 1 && weekday <= 5)
    const from = Math.max(at, midnight + open)
    const until = midnight + close
    if (working && from < until) {
      const used = Math.min(left, until - from)
      left -= used
      at = from + used
    }
    if (left > 0) at = midnight + DAY
  }
  return at - CHINA_OFFSET
}

// "1:05" for one hour five minutes; hours are not folded into days.
export function hoursAndMinutes(milliseconds: number) {
  const minutes = Math.floor(Math.abs(milliseconds) / MINUTE)
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
}
