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

export function ServiceHealthBars(props: {
  rate: number
  requestCount?: number
  className?: string
}) {
  const { t } = useTranslation()
  const health = serviceHealth(props.rate, props.requestCount)
  const presentation = healthPresentation[health]
  const labels = [t(presentation.label)]
  if (health !== 'unknown')
    labels.push(`${t('Success rate')}: ${props.rate.toFixed(2)}%`)
  if (props.requestCount != null)
    labels.push(t('{{count}} requests', { count: props.requestCount }))
  const label = labels.join(' · ')
  return (
    <span
      role='img'
      aria-label={label}
      title={label}
      data-service-health={health}
      className={cn(
        'inline-flex h-4 shrink-0 items-end gap-0.5',
        props.className
      )}
    >
      {['h-2', 'h-2.5', 'h-3'].map((height) => (
        <span
          key={height}
          aria-hidden='true'
          className={cn('w-1 rounded-full', height, presentation.bar)}
        />
      ))}
    </span>
  )
}
