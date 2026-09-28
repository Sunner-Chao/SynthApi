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
import { Link } from '@tanstack/react-router'
import { Gift, Rocket, ShieldCheck, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useStatus } from '@/hooks/use-status'

type RewardCenterShellProps = {
  active: 'referral' | 'recharge' | 'admin'
  children: React.ReactNode
}

export function RewardCenterShell(props: RewardCenterShellProps) {
  const { status } = useStatus()
  const { t } = useTranslation()
  const affiliateEnabled = status?.affiliate_milestone_reward_enabled !== false
  const rechargeEnabled = status?.recharge_benefit_enabled !== false

  return (
    <div className='reward-shell'>
      <header className='reward-shell__header'>
        <div className='reward-shell__brand'>
          <span className='reward-shell__brand-mark'>
            <Gift aria-hidden='true' />
          </span>
          <div>
            <strong>SynthAPI {t('Referral rewards')}</strong>
            <span>INVITE · EARN · CREATE</span>
          </div>
        </div>
        <nav className='reward-shell__nav' aria-label={t('Referral rewards')}>
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
