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
import type { TFunction } from 'i18next'

export function statusLabel(status: string | undefined, t: TFunction) {
  if (status === 'pending') return t('Waiting for a reply')
  if (status === 'replied') return t('Waiting for the user')
  return t('Resolved')
}

// Same labels the user picked from under the answer.
const REASONS: Record<string, string> = {
  inaccurate: 'Inaccurate',
  unclear: 'Hard to follow',
  not_working: "Steps didn't work",
  other: 'Other',
  '': 'No reason given',
}

export const reasonLabel = (reason: string, t: TFunction) =>
  t(REASONS[reason] ?? 'Other')

export const when = (seconds: number) =>
  new Date(seconds * 1000).toLocaleString()
