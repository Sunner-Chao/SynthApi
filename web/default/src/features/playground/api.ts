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
import { API_ENDPOINTS } from './constants'
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageGenerationHistoryItem,
  ModelOption,
  GroupOption,
  VideoGenerationRequest,
  VideoGenerationResponse,
  VideoGenerationHistoryItem,
} from './types'

/**
 * Send chat completion request (non-streaming)
 */
export async function sendChatCompletion(
  payload: ChatCompletionRequest
): Promise<ChatCompletionResponse> {
  const res = await api.post(API_ENDPOINTS.CHAT_COMPLETIONS, payload, {
    skipErrorHandler: true,
  } as Record<string, unknown>)
  return res.data
}

export async function sendVideoGeneration(
  payload: VideoGenerationRequest,
  signal?: AbortSignal
): Promise<VideoGenerationResponse> {
  const res = await api.post('/pg/videos/generations', payload, {
    signal,
    skipErrorHandler: true,
  } as Record<string, unknown>)
  return res.data
}

export async function getVideoGenerationTask(
  taskId: string,
  signal?: AbortSignal
): Promise<VideoGenerationResponse> {
  const res = await api.get(`/pg/videos/generations/${encodeURIComponent(taskId)}`, {
    signal,
    skipErrorHandler: true,
  } as Record<string, unknown>)
  return res.data
}

export async function getVideoGenerationHistory(): Promise<
  VideoGenerationHistoryItem[]
> {
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60
  const res = await api.get('/api/task/self', {
    params: {
      p: 1,
      page_size: 50,
      action: 'videoGenerate',
      start_timestamp: sevenDaysAgo,
    },
  })
  const items = res.data?.data?.items
  return Array.isArray(items) ? items : []
}

export async function getImageGenerationHistory(): Promise<
  ImageGenerationHistoryItem[]
> {
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60
  const res = await api.get('/api/task/self', {
    params: {
      p: 1,
      page_size: 50,
      action: 'imageGenerate',
      start_timestamp: sevenDaysAgo,
    },
  })
  const items = res.data?.data?.items
  return Array.isArray(items) ? items : []
}

export async function sendImageGeneration(
  payload: ImageGenerationRequest,
  signal?: AbortSignal
): Promise<ImageGenerationResponse> {
  const res = await api.post(API_ENDPOINTS.IMAGE_GENERATIONS, payload, {
    signal,
    skipErrorHandler: true,
  } as Record<string, unknown>)
  return res.data
}

export async function getImageGenerationTask(
  taskId: string,
  signal?: AbortSignal
): Promise<ImageGenerationResponse> {
  const res = await api.get(
    `${API_ENDPOINTS.IMAGE_GENERATION_TASKS}/${encodeURIComponent(taskId)}`,
    {
      signal,
      skipErrorHandler: true,
    } as Record<string, unknown>
  )
  return res.data
}

/**
 * Get user available models
 */
export async function getUserModels(): Promise<ModelOption[]> {
  const res = await api.get(API_ENDPOINTS.USER_MODELS)
  const { data } = res

  if (!data.success || !Array.isArray(data.data)) {
    return []
  }

  return data.data.map((model: string) => ({
    label: model,
    value: model,
  }))
}

/**
 * Get user groups
 */
export async function getUserGroups(
  imageOnly = false,
  videoOnly = false
): Promise<GroupOption[]> {
  const endpoint = imageOnly
    ? `${API_ENDPOINTS.USER_GROUPS}?image=true`
    : videoOnly
      ? `${API_ENDPOINTS.USER_GROUPS}?video=true`
      : API_ENDPOINTS.USER_GROUPS
  const res = await api.get(endpoint)
  const { data } = res

  if (!data.success || !data.data) {
    return []
  }

  const groupData = data.data as Record<
    string,
    {
      desc: string
      ratio: number
      supports_resolution_pricing?: boolean
      supports_custom_image_parameters?: boolean
      supports_custom_video_parameters?: boolean
      models?: string[]
    }
  >

  // label is for button display (name only); desc is for dropdown content
  return Object.entries(groupData).map(([group, info]) => ({
    label: group,
    value: group,
    ratio: info.ratio,
    desc: info.desc,
    supportsResolutionPricing: info.supports_resolution_pricing,
    supportsCustomImageParameters: info.supports_custom_image_parameters,
    supportsCustomVideoParameters: info.supports_custom_video_parameters,
    models: info.models,
  }))
}
