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

// Mirrors the credential patterns the support service refuses. Masking them
// before sending keeps the key out of the transcript and lets the question be
// answered instead of being parked in the human queue.
const API_KEY = /sk-[A-Za-z0-9_-]{16,}/g
// Up to this key's END marker (never across another BEGIN); for a cut-off paste
// only the base64 body lines, so a question typed after the key is kept.
const PRIVATE_KEY =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----(?:(?:(?!-----BEGIN )[\s\S])*?-----END [A-Z ]*PRIVATE KEY-----|(?:\r?\n[A-Za-z0-9+/=]{16,})*)/g
const PASSWORD = /((?:密码|password|secret)\s*[:：=]\s*)\S{6,}/gi

export function maskSecrets(text: string, privateKeyLabel: string) {
  let count = 0
  const masked = text
    .replace(PRIVATE_KEY, () => {
      count += 1
      return privateKeyLabel
    })
    .replace(API_KEY, (key) => {
      count += 1
      return `sk-***${key.slice(-4)}`
    })
    .replace(PASSWORD, (_match, prefix: string) => {
      count += 1
      return `${prefix}***`
    })
  return { text: masked, count }
}
