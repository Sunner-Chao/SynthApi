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
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { useAuthStore } from '@/stores/auth-store'
import { getSupportSettings } from './api'
import type { ServiceHours, SupportSettings } from './types'

// What the service returns until the console changes it.
export const DEFAULT_SETTINGS: SupportSettings = {
  service_hours: {
    weekdays_only: true,
    start: '09:00',
    end: '21:00',
    reply_hours: 2,
  },
  starters: {},
}

export const SETTINGS_KEY = ['support-settings']

// Parts missing from a reply (an older service, or a partial one) fall back
// to the defaults, so no reader has to check them.
export function normalizeSettings(
  data?: Partial<SupportSettings> | null
): SupportSettings {
  return {
    service_hours: {
      ...DEFAULT_SETTINGS.service_hours,
      ...data?.service_hours,
    },
    starters: data?.starters ?? {},
  }
}

// Service hours and suggested questions, maintained in the support console.
export function useSupportSettings(): SupportSettings {
  const signedIn = useAuthStore((s) => Boolean(s.auth.user?.id))
  const query = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: getSupportSettings,
    enabled: signedIn,
    staleTime: 5 * 60 * 1000,
  })
  return useMemo(() => normalizeSettings(query.data), [query.data])
}

// "09:00" reads as "9:00" in the promise shown to customers.
const clock = (value: string) => value.replace(/^0(?=\d)/, '')

export function serviceHoursText(
  hours: ServiceHours,
  withEmail: boolean,
  t: TFunction
) {
  const values = {
    start: clock(hours.start),
    end: clock(hours.end),
    count: hours.reply_hours,
  }
  if (hours.weekdays_only)
    return withEmail
      ? t(
          'Support is online {{start}}–{{end}} on weekdays and usually replies within {{count}} hours. The reply will appear in this conversation and we will email you.',
          values
        )
      : t(
          'Support is online {{start}}–{{end}} on weekdays and usually replies within {{count}} hours. The reply will appear in this conversation.',
          values
        )
  return withEmail
    ? t(
        'Support is online {{start}}–{{end}} every day and usually replies within {{count}} hours. The reply will appear in this conversation and we will email you.',
        values
      )
    : t(
        'Support is online {{start}}–{{end}} every day and usually replies within {{count}} hours. The reply will appear in this conversation.',
        values
      )
}

// Custom questions are written in Chinese, so other interface languages keep the defaults.
export function customStarters(
  settings: SupportSettings,
  prefix: string | undefined,
  language: string
) {
  if (!language.toLowerCase().startsWith('zh')) return null
  const questions = settings.starters[prefix ?? 'general']
  return questions?.length ? questions : null
}
