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
  ApiKey,
  ApiResponse,
  GetApiKeysParams,
  GetApiKeysResponse,
  SearchApiKeysParams,
  ApiKeyFormData,
  GroupChannelStatusSummary,
  TokenAutoGroupsConfig,
} from './types'

// ============================================================================
// API Key Management
// ============================================================================

// Get paginated API keys list
export async function getApiKeys(
  params: GetApiKeysParams = {}
): Promise<GetApiKeysResponse> {
  const { p = 1, size = 10 } = params
  const res = await api.get(`/api/token/?p=${p}&size=${size}`)
  return res.data
}

// Search API keys by keyword or token (with pagination)
export async function searchApiKeys(
  params: SearchApiKeysParams
): Promise<GetApiKeysResponse> {
  const { keyword = '', token = '', p, size } = params
  const queryParams = new URLSearchParams()
  if (keyword) queryParams.set('keyword', keyword)
  if (token) queryParams.set('token', token)
  if (p != null) queryParams.set('p', String(p))
  if (size != null) queryParams.set('size', String(size))
  const res = await api.get(`/api/token/search?${queryParams.toString()}`)
  return res.data
}

// Get single API key by ID
export async function getApiKey(id: number): Promise<ApiResponse<ApiKey>> {
  const res = await api.get(`/api/token/${id}`)
  return res.data
}

export async function getTokenAutoGroups(): Promise<
  ApiResponse<TokenAutoGroupsConfig>
> {
  const res = await api.get('/api/token/auto-groups')
  return res.data
}

// Create a new API key
export async function createApiKey(
  data: ApiKeyFormData
): Promise<ApiResponse<ApiKey>> {
  const res = await api.post('/api/token/', data)
  return res.data
}

// Update an existing API key
export async function updateApiKey(
  data: ApiKeyFormData & { id: number }
): Promise<ApiResponse<ApiKey>> {
  const res = await api.put('/api/token/', data)
  return res.data
}

export async function getGroupChannelStatus(
  params: { refresh?: boolean; group?: string } = {}
): Promise<
  ApiResponse<Record<string, GroupChannelStatusSummary>> & {
    refreshed?: boolean
    updated_at?: number
  }
> {
  const searchParams = new URLSearchParams()
  if (params.refresh) {
    searchParams.set('refresh', 'true')
  }
  if (params.group) {
    searchParams.set('group', params.group)
  }
  const query = searchParams.toString()
  const res = await api.get(
    `/api/user/self/group_channel_status${query ? `?${query}` : ''}`,
    {
      disableDuplicate: true,
    }
  )
  return res.data
}

// Delete a single API key
export async function deleteApiKey(id: number): Promise<ApiResponse> {
  const res = await api.delete(`/api/token/${id}/`)
  return res.data
}

// Batch delete multiple API keys
export async function batchDeleteApiKeys(
  ids: number[]
): Promise<ApiResponse<number>> {
  const res = await api.post('/api/token/batch', { ids })
  return res.data
}

// Update API key status (enable/disable)
export async function updateApiKeyStatus(
  id: number,
  status: number
): Promise<ApiResponse<ApiKey>> {
  const res = await api.put('/api/token/?status_only=true', { id, status })
  return res.data
}

// Fetch the real (unmasked) key for a token by ID
export async function fetchTokenKey(
  id: number
): Promise<{ success: boolean; message?: string; data?: { key: string } }> {
  const res = await api.post(`/api/token/${id}/key`)
  return res.data
}

// Batch fetch real (unmasked) keys for multiple tokens
export async function fetchTokenKeysBatch(ids: number[]): Promise<{
  success: boolean
  message?: string
  data?: { keys: Record<number, string> }
}> {
  const res = await api.post('/api/token/batch/keys', { ids })
  return res.data
}

function normalizeServerAddress(serverAddress: string): string {
  return serverAddress.replace(/\/+$/, '')
}

function isConcreteModelName(model: string): boolean {
  const value = model.trim()
  return (
    Boolean(value) &&
    !value.startsWith('regex:') &&
    !/[.*^$()[\]{}|\\]/.test(value)
  )
}

async function resolveApiKeyTestModel(args: {
  apiKey: string
  serverAddress: string
  model?: string
}): Promise<string> {
  const explicitModel = args.model?.trim()
  if (explicitModel && isConcreteModelName(explicitModel)) return explicitModel

  const response = await fetch(
    `${normalizeServerAddress(args.serverAddress)}/v1/models`,
    {
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
      },
    }
  )
  const data = (await response.json().catch(() => null)) as {
    data?: Array<{ id?: string }>
    error?: { message?: string }
    message?: string
  } | null

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        data?.message ||
        `HTTP ${response.status} ${response.statusText}`.trim()
    )
  }

  const models = (data?.data || [])
    .map((item) => item.id?.trim())
    .filter((item): item is string => Boolean(item))
  const chatModel = selectChatTestModel(models)
  if (!chatModel) {
    throw new Error('No chat model is available for this API key')
  }
  return chatModel
}

function selectChatTestModel(models: string[]): string {
  const nonChatPattern =
    /(embedding|embed|rerank|image|gpt-image|sora|video|audio|tts|whisper|midjourney|kling|jimeng|seedream)/i
  const chatModels = models.filter((model) => !nonChatPattern.test(model))
  const priorities = [
    /^claude/i,
    /^gpt/i,
    /^doubao/i,
    /^deepseek/i,
    /^qwen/i,
    /^gemini/i,
    /^kimi/i,
    /^glm/i,
  ]
  for (const pattern of priorities) {
    const found = chatModels.find((model) => pattern.test(model))
    if (found) return found
  }
  return chatModels[0] || ''
}

export async function testApiKeyConnection(args: {
  apiKey: string
  serverAddress: string
  model?: string
}): Promise<{ success: boolean; message?: string; time?: number }> {
  const endpoint = `${normalizeServerAddress(args.serverAddress)}/v1/chat/completions`
  const startedAt = performance.now()

  try {
    const model = await resolveApiKeyTestModel(args)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: 'ping',
          },
        ],
        max_tokens: 1,
      }),
    })
    const elapsed = (performance.now() - startedAt) / 1000
    const data = (await response.json().catch(() => null)) as {
      error?: { message?: string }
      message?: string
    } | null

    if (!response.ok) {
      return {
        success: false,
        message:
          data?.error?.message ||
          data?.message ||
          `HTTP ${response.status} ${response.statusText}`.trim(),
        time: elapsed,
      }
    }

    return {
      success: true,
      time: elapsed,
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Request failed',
    }
  }
}
