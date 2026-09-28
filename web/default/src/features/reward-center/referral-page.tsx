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
import { useCallback, useEffect, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  Check,
  CircleDollarSign,
  Copy,
  Crown,
  Flame,
  Orbit,
  Rocket,
  Sparkles,
  Star,
  Trophy,
  Users,
  WalletCards,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { refreshSelf } from '@/lib/api'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { useStatus } from '@/hooks/use-status'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { transferAffiliateQuota } from '@/features/wallet/api'
import { getPublicSiteOrigin } from '@/features/wallet/lib/affiliate'
import { RewardCenterShell } from './reward-center-shell'
import './styles.css'
import type { AffiliateRewardStage } from './types'
import { useRewardOverview } from './use-reward-overview'

const stageIcons = [Star, Flame, Orbit, Rocket, Crown, Trophy]

function rateLabel(stage: AffiliateRewardStage) {
  return `${stage.rate_bps / 100}%`
}

export function ReferralPage() {
  const { t } = useTranslation()
  const { status } = useStatus()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.auth.user)
  const affiliateEnabled = status?.affiliate_milestone_reward_enabled !== false
  const overviewQuery = useRewardOverview('affiliate', affiliateEnabled)
  const affiliate = overviewQuery.data?.affiliate
  const inviteCount = affiliate?.effective_invite_count ?? 0
  const availableRewardQuota = user?.aff_quota ?? 0
  const transferMutation = useMutation({
    mutationFn: () => transferAffiliateQuota({ quota: availableRewardQuota }),
    onSuccess: async (response) => {
      if (!response.success) {
        toast.error(response.message || '返利转入失败')
        return
      }
      const transferredQuota = response.data?.quota ?? availableRewardQuota
      const transferredAmount = formatQuotaWithCurrency(transferredQuota, {
        digitsLarge: 2,
        digitsSmall: 2,
        abbreviate: false,
        minimumNonZero: 0.01,
      })
      toast.success(`${transferredAmount} 返利已成功转入主余额`)
      await refreshSelf()
      await queryClient.invalidateQueries({
        queryKey: ['reward-program-overview', 'affiliate'],
      })
    },
  })
  const currentStageIndex = useMemo(() => {
    if (!affiliate) return -1
    return affiliate.stages.findIndex(
      (stage) => stage.code === affiliate.current_stage.code
    )
  }, [affiliate])

  const copyInviteLink = useCallback(async () => {
    const code = user?.aff_code
    if (!code) {
      toast.error('邀请码尚未生成，请先进入钱包刷新邀请信息')
      return
    }
    const link = `${getPublicSiteOrigin()}/register?aff=${encodeURIComponent(code)}`
    await navigator.clipboard.writeText(link)
    toast.success('邀请链接已复制')
  }, [user?.aff_code])

  useEffect(() => {
    if (!affiliateEnabled && status?.recharge_benefit_enabled !== false) {
      void navigate({ to: '/rewards/recharge', replace: true })
    }
  }, [affiliateEnabled, navigate, status?.recharge_benefit_enabled])

  if (!affiliateEnabled) return null

  if (overviewQuery.isError)
    return (
      <div className='reward-loading' role='alert'>
        {t('Unable to load rewards. Please retry.')}
        <Button
          onClick={() => {
            void overviewQuery.refetch()
          }}
        >
          {t('Retry')}
        </Button>
      </div>
    )

  if (overviewQuery.isLoading) {
    return (
      <div className='reward-loading'>
        <Skeleton className='h-16 w-72' />
        <Skeleton className='h-[65vh] w-full' />
      </div>
    )
  }

  return (
    <RewardCenterShell active='referral'>
      <main className='referral-universe'>
        <section className='referral-hero'>
          <div className='referral-copy'>
            <span className='eyebrow'>SYNTHAPI · {t('Referral program')}</span>
            <h1>
              {t('Share something useful.')}
              <span>{t('Earn rewards together.')}</span>
            </h1>
            <p>
              {t(
                'Invite friends to SynthAPI. When they complete an eligible payment, your referral reward is credited automatically.'
              )}
            </p>
            <div className='referral-actions'>
              <Button className='invite-button' onClick={copyInviteLink}>
                <Copy aria-hidden='true' />
                复制邀请链接
              </Button>
              <div className='max-rate'>
                <strong>
                  {Math.max(
                    0,
                    ...(affiliate?.stages ?? []).map((stage) => stage.rate_bps)
                  ) / 100}
                  %
                </strong>
                <span>最高返利</span>
              </div>
            </div>
          </div>

          <div className='referral-reference-art' aria-hidden='true' />

          <aside className='milestone-panel'>
            <div className='milestone-panel__title'>
              <span>
                <Users aria-hidden='true' /> 我的里程碑
              </span>
              <CircleDollarSign aria-hidden='true' />
            </div>
            <div className='milestone-number'>
              <strong>{inviteCount}</strong>
              <span>
                {affiliate?.next_stage
                  ? `/ ${affiliate.next_stage.min_invites}`
                  : ' / MAX'}
              </span>
            </div>
            <p>位有效付费邀请</p>
            <div className='milestone-progress'>
              <span
                style={{
                  width: `${Math.min(
                    100,
                    affiliate?.next_stage
                      ? (inviteCount / affiliate.next_stage.min_invites) * 100
                      : 100
                  )}%`,
                }}
              />
            </div>
            <div className='milestone-stage'>
              <span>当前阶段</span>
              <strong>
                {affiliate?.current_stage.name ?? '尚未达成首个有效邀请'}
              </strong>
            </div>
            <div className='milestone-reward'>
              <Sparkles aria-hidden='true' />
              已获阶梯返利 ¥{affiliate?.total_reward_cny.toFixed(2) ?? '0.00'}
            </div>
            <div className='affiliate-claim-card'>
              <div>
                <span>当前可转主余额</span>
                <strong>
                  {formatQuotaWithCurrency(availableRewardQuota, {
                    digitsLarge: 2,
                    digitsSmall: 2,
                    abbreviate: false,
                    minimumNonZero: 0.01,
                  })}
                </strong>
                <small>返利自动到账，无需管理员审核</small>
              </div>
              <Button
                type='button'
                disabled={
                  availableRewardQuota <= 0 || transferMutation.isPending
                }
                onClick={() => transferMutation.mutate()}
              >
                <WalletCards aria-hidden='true' />
                {availableRewardQuota > 0 ? '立即转入余额' : '暂无待转返利'}
              </Button>
            </div>
          </aside>
        </section>

        <div className='reward-section-heading'>
          <h2>{t('Your referral milestones')}</h2>
          <p>{t('More eligible referrals unlock a higher reward rate.')}</p>
        </div>
        <section className='stage-voyage' aria-label='邀请返利阶段'>
          {(affiliate?.stages ?? []).map((stage, index) => {
            const Icon = stageIcons[index] ?? Star
            const active = index === currentStageIndex
            const reached = index <= currentStageIndex
            return (
              <div className='stage-segment' key={stage.code}>
                <article
                  className={`stage-card ${active ? 'is-active' : ''} ${reached ? 'is-reached' : ''}`}
                  aria-current={active ? 'step' : undefined}
                >
                  <span className='stage-index'>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className='stage-emblem'>
                    <Icon aria-hidden='true' />
                  </div>
                  <h2>{stage.name}</h2>
                  <strong>{rateLabel(stage)}</strong>
                  <span className='stage-range'>
                    {stage.max_invites > 0
                      ? `${stage.min_invites}-${stage.max_invites} 位有效邀请`
                      : `${stage.min_invites}+ 位有效邀请`}
                  </span>
                  {active ? (
                    <span className='stage-current'>
                      <Sparkles aria-hidden='true' /> 当前等级
                    </span>
                  ) : reached ? (
                    <span className='stage-reached'>
                      <Check aria-hidden='true' /> 已解锁
                    </span>
                  ) : null}
                </article>
                {index < (affiliate?.stages.length ?? 0) - 1 && (
                  <ArrowRight className='stage-arrow' aria-hidden='true' />
                )}
              </div>
            )
          })}
        </section>

        <section
          className='referral-how-it-works'
          aria-label={t('How it works')}
        >
          {[
            [
              '01',
              t('Share your link'),
              t(
                'Send your personal invitation link to a friend who needs an API.'
              ),
            ],
            [
              '02',
              t('Your friend gets started'),
              t('They register through your link and complete a real payment.'),
            ],
            [
              '03',
              t('Your reward arrives'),
              t(
                'Track credited rewards here and transfer them to your API balance.'
              ),
            ],
          ].map(([step, title, description]) => (
            <article key={step}>
              <span>{step}</span>
              <h2>{title}</h2>
              <p>{description}</p>
            </article>
          ))}
        </section>

        <section className='affiliate-transfer-history'>
          <div className='claim-history__title'>
            <div>
              <WalletCards aria-hidden='true' />
              <span>
                <strong>返利领取记录</strong>
                <small>每次转入主余额均永久保留审计记录</small>
              </span>
            </div>
            <span className='history-total'>最近 12 次</span>
          </div>
          <div className='claim-list'>
            {(affiliate?.recent_transfers ?? []).length === 0 ? (
              <div className='claim-empty'>领取返利后，记录将在这里显示。</div>
            ) : (
              affiliate?.recent_transfers.map((record) => (
                <article className='claim-row' key={record.id}>
                  <span className='claim-check'>
                    <Check aria-hidden='true' />
                  </span>
                  <div>
                    <strong>
                      已转入{' '}
                      {formatQuotaWithCurrency(record.quota, {
                        digitsLarge: 2,
                        digitsSmall: 2,
                        abbreviate: false,
                        minimumNonZero: 0.01,
                      })}
                    </strong>
                    <small>
                      返利余额{' '}
                      {formatQuotaWithCurrency(record.aff_quota_before, {
                        digitsLarge: 2,
                        digitsSmall: 2,
                        abbreviate: false,
                      })}{' '}
                      →{' '}
                      {formatQuotaWithCurrency(record.aff_quota_after, {
                        digitsLarge: 2,
                        digitsSmall: 2,
                        abbreviate: false,
                      })}
                    </small>
                  </div>
                  <time>
                    {new Date(record.created_at * 1000).toLocaleString(
                      'zh-CN',
                      { hour12: false }
                    )}
                  </time>
                  <span className='claim-status claim-status--granted'>
                    已到账
                  </span>
                </article>
              ))
            )}
          </div>
        </section>

        <footer className='reward-rules'>
          <span>有效邀请仅统计完成真实净充值的唯一受邀用户</span>
          <span>返利按每笔实际支付 CNY 结算至邀请额度</span>
          <span>退款、失败与人工冲正不参与</span>
        </footer>
      </main>
    </RewardCenterShell>
  )
}
