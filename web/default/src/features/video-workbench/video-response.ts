import type { VideoGenerationResponse } from '@/features/playground/types'

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {}
  return value as Record<string, unknown>
}

function responseData(
  response: VideoGenerationResponse | null
): Record<string, unknown> {
  return record(
    Array.isArray(response?.data) ? response.data[0] : response?.data
  )
}

export function responseTaskId(response: VideoGenerationResponse): string {
  const data = responseData(response)
  return String(
    response.task_id || response.id || data.task_id || data.id || ''
  )
}

export function statusText(response: VideoGenerationResponse | null): string {
  const status = String(
    response?.status || responseData(response).status || ''
  ).toLowerCase()
  if (['completed', 'succeeded', 'success'].includes(status)) return 'completed'
  if (['failure', 'failed', 'error', 'cancelled', 'canceled'].includes(status))
    return 'failed'
  if (['processing', 'in_progress', 'running'].includes(status))
    return 'processing'
  return 'queued'
}

export function extractVideoURL(
  response: VideoGenerationResponse | null
): string {
  const data = responseData(response)
  const videos = record(data.result).videos
  const firstVideo = Array.isArray(videos) ? record(videos[0]) : {}
  const candidates = [
    response?.url,
    response?.metadata?.url,
    data.url,
    record(data.metadata).url,
    firstVideo.url,
  ]
  for (const candidate of candidates) {
    const value = Array.isArray(candidate) ? candidate[0] : candidate
    if (typeof value === 'string' && value) return value
  }
  return ''
}

export function videoContentURL(taskId: string, download = false): string {
  return `/v1/videos/${encodeURIComponent(taskId)}/content${download ? '?download=1' : ''}`
}
