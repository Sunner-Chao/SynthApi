import { api } from '@/lib/api'
import type { ModelIntelligenceResponse } from './types'

export async function getModelIntelligence(): Promise<ModelIntelligenceResponse> {
  const response = await api.get<ModelIntelligenceResponse>(
    '/api/model-intelligence',
    { skipErrorHandler: true }
  )
  return response.data
}
