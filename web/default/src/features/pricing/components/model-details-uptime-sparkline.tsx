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
import { useTranslation } from 'react-i18next'
import { healthPresentation, serviceHealth } from '@/lib/service-health'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ServiceHealthBars } from '@/components/service-health-bars'
import type { UptimeDayPoint } from '../lib/mock-stats'
import { summarizeUptime } from '../lib/performance-health'

type UptimeSparklineProps = {
  series: UptimeDayPoint[]
  size?: 'sm' | 'md'
  showOverall?: boolean
  emptyLabel?: string
  className?: string
}

export function UptimeSparkline(props: UptimeSparklineProps) {
  const { t } = useTranslation()
  const size = props.size ?? 'md'
  const summary = summarizeUptime(props.series)
  const health = serviceHealth(summary.success_rate, summary.request_count)
  const overall = Number.isFinite(summary.success_rate)
    ? `${summary.success_rate.toFixed(1)}%`
    : '—'

  if (props.series.length === 0) {
    return (
      <span className={cn('text-muted-foreground text-xs', props.className)}>
        {props.emptyLabel ?? '—'}
      </span>
    )
  }

  return (
    <div className={cn('flex items-center gap-2', props.className)}>
      <div
        className={cn(
          'flex items-end',
          size === 'sm' ? 'h-3.5 gap-px' : 'h-5 gap-[2px]'
        )}
        role='img'
        aria-label={`${t('Success rate')} · 24h: ${overall}`}
      >
        {props.series.map((point) => {
          const pointHealth = serviceHealth(
            point.uptime_pct,
            point.request_count
          )
          const presentation = healthPresentation[pointHealth]
          return (
            <Tooltip key={point.date}>
              <TooltipTrigger
                render={
                  <div
                    className={cn(
                      'flex h-full items-end rounded-sm transition-opacity hover:opacity-80',
                      size === 'sm' ? 'w-[3px]' : 'w-1'
                    )}
                  />
                }
              >
                <div
                  data-service-health={pointHealth}
                  className={cn(
                    'w-full rounded-sm',
                    presentation.bar,
                    presentation.height
                  )}
                  aria-hidden='true'
                />
              </TooltipTrigger>
              <TooltipContent side='top' className='font-mono text-xs'>
                <div className='font-medium'>
                  {new Date(point.date).toLocaleString()}
                </div>
                <div>{t(presentation.label)}</div>
                {pointHealth !== 'unknown' && (
                  <div>
                    {t('Success rate')}: {point.uptime_pct.toFixed(2)}%
                  </div>
                )}
                {point.request_count != null && (
                  <div>
                    {t('{{count}} requests', { count: point.request_count })}
                  </div>
                )}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
      {(props.showOverall ?? true) && (
        <>
          <ServiceHealthBars
            rate={summary.success_rate}
            requestCount={summary.request_count}
          />
          <span
            className={cn(
              'font-mono text-sm font-semibold tabular-nums',
              healthPresentation[health].text
            )}
          >
            {overall}
          </span>
        </>
      )}
    </div>
  )
}
