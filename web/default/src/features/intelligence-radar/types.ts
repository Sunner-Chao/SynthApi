export type ModelIntelligencePoint = {
  key: string
  label: string
  model: string
  effort: string
  iq: number
  passed: number
  total: number
  average_price_usd: number
  average_minutes: number
  combined_cost_index: number
  cache_hit_rate: number
  runs_24h: number
  runs_48h: number
  runs_total: number
  source_updated_at: string
}

export type ModelIntelligenceCommunity = {
  overall_score: number
  positive_rate: number
  recommend_index: number
  discussion_heat: number
  trust_index: number
  rating_count: number
  updated_at: string
}

export type ModelIntelligenceInsight = {
  key: string
  title: string
  model: string
  model_label: string
  effort: string
  iq: number
  average_cost_usd: number
  average_duration_minutes: number
}

export type ModelIntelligencePayload = {
  source: string
  source_url: string
  mode: string
  refreshed_at: string
  source_updated_at: string
  cache_seconds: number
  stale: boolean
  runs_24h_total: number
  runs_48h_total: number
  runs_total: number
  points: ModelIntelligencePoint[]
  rankings: ModelIntelligencePoint[]
  community: ModelIntelligenceCommunity
  insights: ModelIntelligenceInsight[]
}

export type ModelIntelligenceResponse = {
  success: boolean
  message?: string
  data?: ModelIntelligencePayload
}
