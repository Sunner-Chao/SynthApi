import type { ChannelMonitorItem } from '@/features/dashboard/types'

export function hasUsageMetrics(item: ChannelMonitorItem): boolean {
  return (
    item.success_rate_source === 'usage' &&
    (item.usage_request_count ?? 0) > 0
  )
}

export function getUsageSuccessRate(item: ChannelMonitorItem): number {
  return hasUsageMetrics(item) && typeof item.success_rate === 'number'
    ? item.success_rate
    : Number.NaN
}

export function getAvailabilityRate(item: ChannelMonitorItem): number {
  if (typeof item.availability_rate === 'number') return item.availability_rate
  const total = item.channel_count ?? 0
  if (total <= 0) return Number.NaN
  return ((item.enabled_count ?? 0) / total) * 100
}

export function getDisplayRate(item: ChannelMonitorItem): number {
  const usageRate = getUsageSuccessRate(item)
  if (Number.isFinite(usageRate)) return usageRate
  return getAvailabilityRate(item)
}
