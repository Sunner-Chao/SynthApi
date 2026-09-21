/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { CircleHelp, Cloud, Gauge, Network, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatusBadge, type StatusBadgeProps } from '@/components/status-badge'
import type { ApiIngressLine } from '../types'

interface ApiLineBadgeProps {
  line?: ApiIngressLine
  host?: string
  className?: string
}

export function ApiLineBadge({ line, host, className }: ApiLineBadgeProps) {
  const { t } = useTranslation()

  let label = t('Route not recorded')
  let icon = CircleHelp
  let variant: StatusBadgeProps['variant'] = 'neutral'

  if (line === 'official') {
    label = t('Official API')
    icon = Cloud
    variant = 'info'
  } else if (line === 'fast') {
    label = t('High-speed route')
    icon = Zap
    variant = 'success'
  }

  return (
    <StatusBadge
      label={label}
      icon={icon}
      variant={variant}
      size='sm'
      copyable={false}
      showDot={false}
      className={className}
      title={host ? `${t('Endpoint')}: ${host}` : t('Route not recorded')}
      aria-label={label}
    />
  )
}

interface WorkerNodeBadgeProps {
  node?: string
  className?: string
}

export function WorkerNodeBadge({ node, className }: WorkerNodeBadgeProps) {
  const { t } = useTranslation()
  const normalized = node?.trim().toLowerCase()
  if (!normalized) return null

  const isShanghai =
    normalized.includes('shanghai') || normalized.includes('上海')
  const isProduction =
    normalized.includes('aliyun') ||
    normalized.includes('prod') ||
    normalized.includes('production')
  const label = isShanghai
    ? t('Shanghai worker')
    : isProduction
      ? t('Local worker')
      : node

  return (
    <StatusBadge
      label={label}
      icon={Network}
      variant={isShanghai ? 'success' : 'info'}
      size='sm'
      copyable={false}
      showDot={false}
      className={className}
      title={`${t('Load-balanced worker')}: ${label}`}
      aria-label={`${t('Load-balanced worker')}: ${label}`}
    />
  )
}

interface ChannelConcurrencyBadgeProps {
  active?: number
  limit?: number
  className?: string
}

export function ChannelConcurrencyBadge({
  active,
  limit,
  className,
}: ChannelConcurrencyBadgeProps) {
  const { t } = useTranslation()
  if (!Number.isFinite(active) || !Number.isFinite(limit) || Number(limit) <= 0) {
    return null
  }

  const safeActive = Math.max(0, Math.round(Number(active)))
  const safeLimit = Math.max(1, Math.round(Number(limit)))
  const utilization = (safeActive / safeLimit) * 100
  const progress = Math.min(100, Math.max(0, utilization))
  const variant: StatusBadgeProps['variant'] =
    utilization >= 90 ? 'danger' : utilization >= 70 ? 'warning' : 'success'
  const indicatorClass =
    variant === 'danger'
      ? 'bg-destructive'
      : variant === 'warning'
        ? 'bg-warning'
        : 'bg-success'
  const label = t('Concurrency capacity')

  return (
    <StatusBadge
      icon={Gauge}
      variant={variant}
      size='sm'
      copyable={false}
      showDot={false}
      className={className}
      title={label}
      aria-label={`${label}: ${safeActive}/${safeLimit}`}
    >
      <span className='tabular-nums'>
        {t('Concurrency')} {safeActive}/{safeLimit}
      </span>
      <span className='bg-muted h-1 w-7 overflow-hidden rounded-full' aria-hidden='true'>
        <span
          className={`block h-full rounded-full transition-[width] ${indicatorClass}`}
          style={{ width: `${progress}%` }}
        />
      </span>
    </StatusBadge>
  )
}
