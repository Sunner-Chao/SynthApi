import { Link, useLocation } from '@tanstack/react-router'
import { Gift, Sparkles } from 'lucide-react'
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
  const showUserRewards = affiliateEnabled || rechargeEnabled
  const isAdminPortal =
    typeof window !== 'undefined' &&
    window.location.hostname.toLowerCase() === 'admin.synthapi.asia'
  const rewardsUrl =
    !affiliateEnabled && rechargeEnabled
      ? '/rewards/recharge'
      : '/rewards/referral'

  if (!showUserRewards && !isAdminPortal) return null

  return (
    <SidebarFooter
      className={`border-sidebar-border shrink-0 border-t p-2 ${
        isAdminPortal ? 'admin-reward-sidebar-panel' : ''
      }`}
    >
      {isAdminPortal && (
        <div className='admin-reward-sidebar-label flex items-center justify-between gap-2 px-2 pb-1'>
          <span className='flex min-w-0 items-center gap-1.5 truncate text-[10px] font-bold'>
            <Sparkles className='size-3 shrink-0' aria-hidden='true' />
            福利运营舱
          </span>
          <span className='admin-reward-live'>ADMIN</span>
        </div>
      )}
      <SidebarMenu>
        {showUserRewards && (
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={
                pathname === '/rewards/referral' ||
                pathname === '/rewards/recharge'
              }
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
        )}

        {isAdminPortal && (
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname === '/rewards/admin'}
              tooltip='福利中心管理'
              className='sidebar-reward-link sidebar-reward-link--persistent'
              render={
                <Link
                  to='/rewards/admin'
                  onClick={() => setOpenMobile(false)}
                />
              }
            >
              <Gift className='size-4 shrink-0' aria-hidden='true' />
              <span className='min-w-0 flex-1'>
                <strong className='block truncate text-xs'>福利中心管理</strong>
                <small className='admin-reward-sidebar-note block truncate'>
                  活动开关、申请审核与发放记录
                </small>
              </span>
              <span className='sidebar-reward-badge shrink-0 rounded px-1.5 text-[10px] font-bold'>
                管理
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
      </SidebarMenu>
    </SidebarFooter>
  )
}
