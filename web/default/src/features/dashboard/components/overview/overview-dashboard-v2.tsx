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
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  Activity,
  CreditCard,
  KeyRound,
  Radio,
  TrendingUp,
  Wallet,
  Zap,
  Users,
  BarChart3,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { motion } from 'motion/react'

import { useAuthStore } from '@/stores/auth-store'
import { ROLE } from '@/lib/roles'
import { getApiKeys } from '@/features/keys/api'
import { getUserModels } from '@/lib/api'
import { formatNumber, formatQuota } from '@/lib/format'

import { StatCard } from '@/components/square-ui/stat-card'
import { ChartCard } from '@/components/square-ui/chart-card'
import { UpgradeCard } from '@/components/square-ui/upgrade-card'
import { QuickActionCard } from '@/components/square-ui/quick-action-card'
import { Button } from '@/components/ui/button'

export function OverviewDashboardV2() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)

  const requestCount = Number(user?.request_count ?? 0)
  const remainQuota = Number(user?.quota ?? 0)
  const usedQuota = Number(user?.used_quota ?? 0)
  const isAdmin = Boolean(user?.role && user.role >= ROLE.ADMIN)

  const apiKeysQuery = useQuery({
    queryKey: ['dashboard', 'overview', 'api-keys'],
    queryFn: async () => {
      const result = await getApiKeys({ p: 1, size: 10 })
      return result.success ? (result.data?.items ?? []) : []
    },
    staleTime: 60 * 1000,
  })

  const modelsQuery = useQuery({
    queryKey: ['dashboard', 'overview', 'user-models'],
    queryFn: async () => {
      const result = await getUserModels()
      return result.success ? (result.data ?? []) : []
    },
    staleTime: 5 * 60 * 1000,
  })

  const activeKeysCount = useMemo(
    () => apiKeysQuery.data?.filter((key) => key.status === 1).length ?? 0,
    [apiKeysQuery.data]
  )

  const totalQuota = usedQuota + remainQuota
  const usagePercentage = totalQuota > 0 ? (usedQuota / totalQuota) * 100 : 0

  return (
    <div className="square-ui-app-container">
      <div className="square-ui-content-container">
        {/* Header */}
        <div className="square-ui-header">
          <div>
            <motion.h1
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xl font-bold text-foreground"
            >
              {t('Dashboard')}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-sm text-muted-foreground mt-0.5"
            >
              {t('Welcome back')}, {user?.username || t('User')}
            </motion.p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/keys">
                <KeyRound className="size-4 mr-2" />
                {t('New Key')}
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/wallet">
                <CreditCard className="size-4 mr-2" />
                {t('Top Up')}
              </Link>
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto p-3 sm:p-4 md:p-7">
          <div className="square-ui-section">
            {/* Stats Grid */}
            <div className="square-ui-grid-4">
              <StatCard
                title={t('Total Requests')}
                value={formatNumber(requestCount)}
                icon={Activity}
                trend={{ value: 12.5, isPositive: true }}
                description={t('Last 30 days')}
                delay={0}
              />
              <StatCard
                title={t('Active Keys')}
                value={activeKeysCount}
                icon={KeyRound}
                description={t('Out of {{total}}', {
                  total: apiKeysQuery.data?.length ?? 0,
                })}
                delay={0.05}
              />
              <StatCard
                title={t('Balance')}
                value={formatQuota(remainQuota)}
                icon={Wallet}
                trend={{ value: 8.2, isPositive: false }}
                description={t('Available credits')}
                delay={0.1}
              />
              <StatCard
                title={t('Models')}
                value={modelsQuery.data?.length ?? 0}
                icon={Zap}
                description={t('Enabled models')}
                delay={0.15}
              />
            </div>

            {/* Main Grid: Charts + Sidebar */}
            <div className="square-ui-grid-3 mt-6">
              {/* Usage Chart */}
              <ChartCard
                title={t('Usage Overview')}
                description={t('API usage in the last 7 days')}
                delay={0.2}
                className="lg:col-span-2"
              >
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <BarChart3 className="size-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">
                      {t('Chart integration coming soon')}
                    </p>
                  </div>
                </div>
              </ChartCard>

              {/* Sidebar: Quick Actions */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3">
                    {t('Quick Actions')}
                  </h3>
                  <div className="space-y-2">
                    <QuickActionCard
                      title={t('API Keys')}
                      description={t('Manage your API keys')}
                      icon={KeyRound}
                      href="/keys"
                      delay={0.25}
                    />
                    <QuickActionCard
                      title={t('Channels')}
                      description={t('Configure providers')}
                      icon={Radio}
                      href="/channels"
                      delay={0.3}
                    />
                    <QuickActionCard
                      title={t('Usage Logs')}
                      description={t('View request history')}
                      icon={Activity}
                      href="/logs"
                      delay={0.35}
                    />
                  </div>
                </div>

                <UpgradeCard />
              </div>
            </div>

            {/* Quota Progress */}
            <ChartCard
              title={t('Quota Usage')}
              description={t(
                'Used {{used}} of {{total}} credits ({{percentage}}%)',
                {
                  used: formatQuota(usedQuota),
                  total: formatQuota(totalQuota),
                  percentage: usagePercentage.toFixed(1),
                }
              )}
              delay={0.4}
              action={
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/wallet">{t('Add Credits')}</Link>
                </Button>
              }
            >
              <div className="relative pt-4">
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(usagePercentage, 100)}%` }}
                    transition={{ duration: 1, ease: 'easeOut', delay: 0.5 }}
                    className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full"
                  />
                </div>
                <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                  <span>{formatQuota(usedQuota)} {t('used')}</span>
                  <span>{formatQuota(remainQuota)} {t('remaining')}</span>
                </div>
              </div>
            </ChartCard>

            {/* Admin Stats (if admin) */}
            {isAdmin && (
              <div className="square-ui-grid-3 mt-6">
                <StatCard
                  title={t('Total Users')}
                  value="1,234"
                  icon={Users}
                  trend={{ value: 5.2, isPositive: true }}
                  description={t('Registered users')}
                  delay={0.45}
                />
                <StatCard
                  title={t('Revenue')}
                  value="$12,345"
                  icon={TrendingUp}
                  trend={{ value: 18.7, isPositive: true }}
                  description={t('This month')}
                  delay={0.5}
                />
                <StatCard
                  title={t('System Load')}
                  value="67%"
                  icon={Activity}
                  description={t('CPU usage')}
                  delay={0.55}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
