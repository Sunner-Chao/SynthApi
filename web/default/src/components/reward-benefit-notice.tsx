import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Gift, Sparkles, WalletCards, X, Zap } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { refreshSelf } from '@/lib/api'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { useStatus } from '@/hooks/use-status'
import { Button } from '@/components/ui/button'
import { useRewardOverview } from '@/features/reward-center/use-reward-overview'

export function RewardBenefitNotice() {
  const { status } = useStatus()
  const user = useAuthStore((state) => state.auth.user)
  const affiliateEnabled = status?.affiliate_milestone_reward_enabled !== false
  const rechargeEnabled = status?.recharge_benefit_enabled !== false
  const rechargeOverview = useRewardOverview('recharge', rechargeEnabled)
  const [dismissed, setDismissed] = useState(false)
  const previousSignature = useRef('')

  useQuery({
    queryKey: ['reward-notice-self'],
    queryFn: refreshSelf,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })

  const affQuota = affiliateEnabled ? (user?.aff_quota ?? 0) : 0
  const recharge = rechargeOverview.data?.recharge
  const availableClaims = rechargeEnabled ? (recharge?.available_count ?? 0) : 0
  const pendingClaims = rechargeEnabled ? (recharge?.pending_count ?? 0) : 0
  const signature = `${affQuota}:${availableClaims}:${pendingClaims}`
  const actionable = affQuota > 0 || availableClaims > 0 || pendingClaims > 0

  useEffect(() => {
    if (previousSignature.current !== signature) {
      previousSignature.current = signature
      setDismissed(false)
    }
  }, [signature])

  useEffect(() => {
    if (dismissed && actionable) {
      const timer = window.setTimeout(() => setDismissed(false), 10 * 60_000)
      return () => window.clearTimeout(timer)
    }
  }, [actionable, dismissed])

  const primary = useMemo(() => {
    if (affQuota > 0) {
      return {
        to: '/rewards/referral' as const,
        icon: WalletCards,
        title: `返利已到账 ${formatQuotaWithCurrency(affQuota, {
          digitsLarge: 2,
          digitsSmall: 2,
          abbreviate: false,
          minimumNonZero: 0.01,
        })}`,
        detail: '无需审核，立即转入主余额',
        action: '去领取',
      }
    }
    if (availableClaims > 0) {
      return {
        to: '/rewards/recharge' as const,
        icon: Zap,
        title: `已解锁 ${availableClaims} 份千元充能福利`,
        detail: `可申请 ¥${availableClaims * (recharge?.reward_unit_cny ?? 50)} API 额度`,
        action: '立即申请',
      }
    }
    return {
      to: '/rewards/recharge' as const,
      icon: Gift,
      title: `${pendingClaims} 份千元充能福利审核中`,
      detail: '审核通过后额度将自动发放',
      action: '查看进度',
    }
  }, [affQuota, availableClaims, pendingClaims, recharge?.reward_unit_cny])

  if (!actionable || dismissed) return null

  const Icon = primary.icon
  return (
    <aside className='reward-benefit-notice' aria-live='polite'>
      <span className='reward-benefit-notice__spark' aria-hidden='true'>
        <Sparkles />
      </span>
      <div className='reward-benefit-notice__icon'>
        <Icon aria-hidden='true' />
      </div>
      <div className='reward-benefit-notice__copy'>
        <strong>{primary.title}</strong>
        <span>{primary.detail}</span>
      </div>
      <Button
        size='sm'
        className='reward-benefit-notice__action'
        render={<Link to={primary.to} />}
      >
        {primary.action}
      </Button>
      <button
        type='button'
        className='reward-benefit-notice__close'
        title='稍后提醒'
        onClick={() => setDismissed(true)}
      >
        <X aria-hidden='true' />
      </button>
    </aside>
  )
}
