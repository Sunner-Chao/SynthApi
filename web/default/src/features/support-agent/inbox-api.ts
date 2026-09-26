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
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth-store'
import { api } from '@/lib/api'

export type InboxItem = {
  id: number
  kind: string
  title: string
  content: string
  link: string
  created_at: number
  read_at: number
  email_status: string
  email_sent_at: number
}
export type InboxPreferences = {
  email_enabled: boolean
  referral_footer_enabled: boolean
  marketing_enabled: boolean
  mail_configured: boolean
}
async function unpack<T>(
  request: Promise<{ data: { success: boolean; data: T; message?: string } }>
) {
  const response = await request
  if (!response.data.success)
    throw new Error(response.data.message || 'Notification request failed')
  return response.data.data
}
export function useBusinessInbox() {
  const userId = useAuthStore((s) => s.auth.user?.id)
  return useQuery({
    queryKey: ['business-inbox', userId],
    queryFn: () =>
      unpack<{ items: InboxItem[]; unread: number }>(
        api.get('/api/user/notifications', { skipErrorHandler: true })
      ),
    enabled: !!userId,
    staleTime: 15000,
    refetchInterval: 30000,
  })
}
export const readInbox = (ids: number[]) =>
  unpack(api.post('/api/user/notifications/read', { ids }))
export const getInboxPreferences = () =>
  unpack<InboxPreferences>(api.get('/api/user/notifications/preferences'))
export const saveInboxPreferences = (value: InboxPreferences) =>
  unpack<InboxPreferences>(
    api.put('/api/user/notifications/preferences', {
      email_enabled: value.email_enabled,
      referral_footer_enabled: value.referral_footer_enabled,
      marketing_enabled: value.marketing_enabled,
    })
  )
