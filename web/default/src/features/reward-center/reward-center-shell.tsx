import { Link } from '@tanstack/react-router'
import { Gift, Rocket, ShieldCheck, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStatus } from '@/hooks/use-status'

type RewardCenterShellProps = {
  active: 'referral' | 'recharge' | 'admin'
  children: React.ReactNode
}

export function RewardCenterShell(props: RewardCenterShellProps) {
  const { status } = useStatus()
  const affiliateEnabled =
    status?.affiliate_milestone_reward_enabled !== false
  const rechargeEnabled = status?.recharge_benefit_enabled !== false

  return (
    <div className='reward-shell'>
      <header className='reward-shell__header'>
        <div className='reward-shell__brand'>
          <span className='reward-shell__brand-mark'>
            <Gift aria-hidden='true' />
          </span>
          <div>
            <strong>SynthAPI 福利中心</strong>
            <span>REWARD COMMAND</span>
          </div>
        </div>
        <nav className='reward-shell__nav' aria-label='福利中心导航'>
          {props.active === 'admin' && (
            <Link
              to='/rewards/admin'
              className={cn(
                'reward-shell__nav-item',
                props.active === 'admin' && 'is-active'
              )}
            >
              <ShieldCheck aria-hidden='true' />
              管理中心
            </Link>
          )}
          {affiliateEnabled && (
            <Link
              to='/rewards/referral'
              className={cn(
                'reward-shell__nav-item',
                props.active === 'referral' && 'is-active'
              )}
            >
              <Rocket aria-hidden='true' />
              邀请返利
            </Link>
          )}
          {rechargeEnabled && (
            <Link
              to='/rewards/recharge'
              className={cn(
                'reward-shell__nav-item',
                props.active === 'recharge' && 'is-active'
              )}
            >
              <Zap aria-hidden='true' />
              千元充能
            </Link>
          )}
        </nav>
      </header>
      {props.children}
    </div>
  )
}
