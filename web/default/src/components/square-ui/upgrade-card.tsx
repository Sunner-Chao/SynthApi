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

import { motion } from 'motion/react'
import { Link } from '@tanstack/react-router'
import { Crown, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface UpgradeCardProps {
  delay?: number
  className?: string
}

export function UpgradeCard({ delay = 0.4, className }: UpgradeCardProps) {
  const { t } = useTranslation()

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'relative overflow-hidden rounded-lg border border-primary/20',
        'bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5',
        'p-4',
        className
      )}
    >
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-2">
          <div className="rounded-md bg-primary/20 p-1.5">
            <Crown className="size-4 text-primary" />
          </div>
          <h4 className="text-sm font-semibold text-foreground">
            {t('Upgrade Plan')}
          </h4>
        </div>
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          {t('Get more credits, faster speeds, and priority support')}
        </p>
        <Button size="sm" variant="default" className="w-full" asChild>
          <Link to="/pricing">
            {t('View Plans')}
            <ArrowRight className="size-3 ml-1.5" />
          </Link>
        </Button>
      </div>
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-50" />
    </motion.div>
  )
}
