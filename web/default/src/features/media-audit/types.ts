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
export type MediaKind = 'image' | 'video'
export type MediaView = 'requests' | 'tasks' | 'midjourney'
export interface MediaRow {
  id: string
  source: string
  created_at: number
  finish_time?: number
  model: string
  task_id?: string
  request_id?: string
  status: string
  action?: string
  quota: number
  duration: number
  prompt?: string
  message?: string
  progress?: string
  size?: string
  quality?: string
  image_count?: number
  content_url?: string
  user_id?: number
  username?: string
  channel_id?: number
  token_name?: string
  group?: string
  request_path?: string
}
export interface MediaPage {
  page: number
  page_size: number
  items: MediaRow[]
  summary: { total: number; charged: number; refunded: number; errors: number }
}
export interface MediaFilters {
  start: string
  end: string
  model: string
  identifier: string
  status: string
  user_id: string
  channel_id: string
}
