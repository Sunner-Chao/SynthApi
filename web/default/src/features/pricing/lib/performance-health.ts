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
import {
  serviceHealth,
  summarizeHealth,
  type HealthSample,
} from '@/lib/service-health'
import type { PerformanceGroup } from '@/features/performance-metrics/types'
import type { UptimeDayPoint } from './mock-stats'

export function toUptimeSeries(groups: PerformanceGroup[]): UptimeDayPoint[] {
  const byTs = new Map<number, HealthSample[]>()
  for (const group of groups) {
    for (const point of group.series) {
      const current = byTs.get(point.ts) ?? []
      current.push(point)
      byTs.set(point.ts, current)
    }
  }
  return Array.from(byTs.entries())
    .sort(([a], [b]) => a - b)
    .map(([ts, samples]) => {
      const summary = summarizeHealth(samples)
      const health = serviceHealth(summary.success_rate, summary.request_count)
      return {
        date: new Date(ts * 1000).toISOString(),
        uptime_pct: summary.success_rate,
        request_count: summary.request_count,
        success_count: summary.success_count,
        incidents: health === 'critical' ? 1 : 0,
        outage_minutes: 0,
      }
    })
}

export function summarizeUptime(series: UptimeDayPoint[]): HealthSample {
  return summarizeHealth(
    series.map((point) => ({
      success_rate: point.uptime_pct,
      request_count: point.request_count,
      success_count: point.success_count,
    }))
  )
}
