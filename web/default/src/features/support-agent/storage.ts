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

// Browser storage is optional everywhere: private windows and blocked site
// data must still give a working assistant.
const threadKey = (userId: number) => `support-thread-${userId}`
const draftKey = (userId: number, conversation: string) =>
  `support-draft-${userId}-${conversation}`
const WIDE_KEY = 'support-panel-wide'

export function storedThread(userId: number) {
  try {
    return sessionStorage.getItem(threadKey(userId)) || 'default'
  } catch {
    return 'default'
  }
}

export function persistThread(userId: number, conversation: string) {
  try {
    sessionStorage.setItem(threadKey(userId), conversation)
  } catch {
    /* Optional browser storage. */
  }
}

export function readDraft(userId: number, conversation: string) {
  try {
    return sessionStorage.getItem(draftKey(userId, conversation)) || ''
  } catch {
    return ''
  }
}

export function writeDraft(userId: number, conversation: string, text: string) {
  try {
    if (text.trim())
      sessionStorage.setItem(
        draftKey(userId, conversation),
        text.slice(0, 4000)
      )
    else sessionStorage.removeItem(draftKey(userId, conversation))
  } catch {
    /* Optional browser storage. */
  }
}

export function readWide() {
  try {
    return localStorage.getItem(WIDE_KEY) === '1'
  } catch {
    return false
  }
}

export function saveWide(wide: boolean) {
  try {
    localStorage.setItem(WIDE_KEY, wide ? '1' : '0')
  } catch {
    /* Optional browser storage. */
  }
}
