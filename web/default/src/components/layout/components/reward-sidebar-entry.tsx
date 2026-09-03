import { Link, useLocation } from '@tanstack/react-router'
import { Gift } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth-store'
import { useStatus } from '@/hooks/use-status'
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { useRewardOverview } from '@/features/reward-center/use-reward-overview'

export function RewardSidebarEntry() {
  const { t } = useTranslation()
  const { status } = useStatus()
  const { setOpenMobile } = useSidebar()
  const pathname = useLocation({ select: (location) => location.pathname })
  const user = useAuthStore((state) => state.auth.user)
  const affiliateEnabled = status?.affiliate_milestone_reward_enabled !== false
  const rechargeEnabled = status?.recharge_benefit_enabled !== false
  const rechargeOverview = useRewardOverview('recharge', rechargeEnabled)
  const recharge = rechargeOverview.data?.recharge
  const hasAffiliateReward = affiliateEnabled && (user?.aff_quota ?? 0) > 0
  const availableClaims = rechargeEnabled ? (recharge?.available_count ?? 0) : 0
  const pendingClaims = rechargeEnabled ? (recharge?.pending_count ?? 0) : 0
  const actionable = hasAffiliateReward || availableClaims > 0
  const pending = pendingClaims > 0
  const rewardsUrl =
    !affiliateEnabled && rechargeEnabled
      ? '/rewards/recharge'
      : '/rewards/referral'

  if (!affiliateEnabled && !rechargeEnabled) return null

  return (
    <SidebarFooter className='border-sidebar-border border-t p-2'>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={pathname.startsWith('/rewards/')}
            tooltip={t('Reward Center')}
            className='sidebar-reward-link sidebar-reward-link--persistent'
            render={
              <Link to={rewardsUrl} onClick={() => setOpenMobile(false)} />
            }
          >
            <span className='sidebar-reward-icon'>
              <Gift className='size-4' aria-hidden='true' />
              {(actionable || pending) && (
                <i
                  className={
                    actionable
                      ? 'sidebar-reward-status is-actionable'
                      : 'sidebar-reward-status is-pending'
                  }
                  aria-hidden='true'
                />
              )}
            </span>
            <span className='min-w-0 flex-1 truncate font-semibold'>
              {t('Reward Center')}
            </span>
            <span className='sidebar-reward-badge shrink-0 rounded px-1.5 text-[10px] font-bold'>
              {actionable ? t('Claim') : pending ? t('Pending') : t('HOT')}
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  )
}
