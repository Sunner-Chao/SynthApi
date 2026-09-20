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
import { AxiosError } from 'axios'
import i18next from 'i18next'
import { toast } from 'sonner'

const reportedErrors = new WeakSet<object>()

export function markServerErrorHandled(error: unknown): void {
  if (error && typeof error === 'object') reportedErrors.add(error)
}

export function getServerErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const data: unknown = error.response?.data
    if (data && typeof data === 'object') {
      for (const key of ['message', 'title'] as const) {
        const value = (data as Record<string, unknown>)[key]
        if (typeof value === 'string' && value.trim()) return value
      }
    }
    if (error.response?.status === 429) {
      return `${i18next.t('Too many requests')} ${i18next.t('Please try again later.')}`
    }
    if (error.response?.status === 401) return i18next.t('Session expired!')
    if (error.response?.status === 404) return i18next.t('Content not found.')
    if (error.response?.status === 500)
      return i18next.t('Internal Server Error!')
  }
  if (error instanceof Error && error.message) return error.message
  return i18next.t('Something went wrong!')
}

export function handleServerError(error: unknown): void {
  // Axios and component catches often see the very same failure. Report it
  // once, preserving the server's reason instead of adding a generic toast.
  if (error && typeof error === 'object' && reportedErrors.has(error)) return
  markServerErrorHandled(error)
  toast.error(getServerErrorMessage(error))
}
