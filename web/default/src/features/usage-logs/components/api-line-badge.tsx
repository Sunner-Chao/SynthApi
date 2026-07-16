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
import { CircleHelp, Cloud, Zap } from 'lucide-react'
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
