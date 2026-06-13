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
import { api } from '@/lib/api'
import type {
  ChannelMonitorResponse,
  QuotaDataItem,
  UptimeGroupResult,
} from './types'

export type DashboardApiResponse<T> = {
  success: boolean
  message?: string
  data?: T
}

export type DashboardQuotaParams = {
  start_timestamp?: number | Date
  end_timestamp?: number | Date
  default_time?: string
  time_granularity?: string
  username?: string
}

function normalizeQuotaParams(params: DashboardQuotaParams) {
  return {
    ...params,
    start_timestamp:
      params.start_timestamp instanceof Date
        ? Math.floor(params.start_timestamp.getTime() / 1000)
        : params.start_timestamp,
    end_timestamp:
      params.end_timestamp instanceof Date
        ? Math.floor(params.end_timestamp.getTime() / 1000)
        : params.end_timestamp,
  }
}

export async function getUserQuotaDates(
  params: DashboardQuotaParams,
  isAdmin = false
): Promise<DashboardApiResponse<QuotaDataItem[]>> {
  const res = await api.get<DashboardApiResponse<QuotaDataItem[]>>(
    isAdmin ? '/api/data/' : '/api/data/self',
    { params: normalizeQuotaParams(params) }
  )
  return res.data
}

export async function getUserQuotaDataByUsers(
  params: DashboardQuotaParams
): Promise<DashboardApiResponse<QuotaDataItem[]>> {
  const res = await api.get<DashboardApiResponse<QuotaDataItem[]>>(
    '/api/data/users',
    { params: normalizeQuotaParams(params) }
  )
  return res.data
}

export async function getUptimeStatus(): Promise<
  DashboardApiResponse<UptimeGroupResult[]>
> {
  const res =
    await api.get<DashboardApiResponse<UptimeGroupResult[]>>(
      '/api/uptime/status'
    )
  return res.data
}

export async function getChannelMonitor(): Promise<ChannelMonitorResponse> {
  const res = await api.get<ChannelMonitorResponse>(
    '/api/dashboard/channel-monitor'
  )
  return res.data
}
