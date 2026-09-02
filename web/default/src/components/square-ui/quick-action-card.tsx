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
import type { LucideIcon } from 'lucide-react'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface QuickActionCardProps {
  title: string
  description: string
  icon: LucideIcon
  href: string
  delay?: number
  className?: string
}

export function QuickActionCard({
  title,
  description,
  icon: Icon,
  href,
  delay = 0,
  className,
}: QuickActionCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        to={href}
        className={cn(
          'group block rounded-lg border border-border/50',
          'bg-card/20 backdrop-blur-sm',
          'p-3 transition-all duration-200',
          'hover:border-border hover:bg-card/40 hover:shadow-sm',
          className
        )}
      >
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 transition-colors group-hover:bg-primary/20">
            <Icon className="size-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium text-foreground truncate">
                {title}
              </h4>
              <ArrowRight className="size-3 text-muted-foreground transition-transform group-hover:translate-x-0.5 flex-shrink-0" />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {description}
            </p>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
