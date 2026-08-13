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
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { refreshSelf } from '@/lib/api'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { useStatus } from '@/hooks/use-status'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { transferAffiliateQuota } from '@/features/wallet/api'
import { RewardCenterShell } from './reward-center-shell'
import './styles.css'
import type { AffiliateRewardStage } from './types'
import { useRewardOverview } from './use-reward-overview'

const stageIcons = [Star, Flame, Orbit, Rocket, Crown, Trophy]

function rateLabel(stage: AffiliateRewardStage) {
  return `${stage.rate_bps / 100}%`
}

export function ReferralPage() {
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
    const link = `${window.location.origin}/register?aff=${code}`
    await navigator.clipboard.writeText(link)
    toast.success('邀请链接已复制')
  }, [user?.aff_code])

  useEffect(() => {
    if (!affiliateEnabled && status?.recharge_benefit_enabled !== false) {
      void navigate({ to: '/rewards/recharge', replace: true })
    }
  }, [affiliateEnabled, navigate, status?.recharge_benefit_enabled])

  if (!affiliateEnabled) return null

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
        <div className='cosmos-stars' aria-hidden='true' />
        <div className='cosmos-nebula cosmos-nebula--one' aria-hidden='true' />
        <div className='cosmos-nebula cosmos-nebula--two' aria-hidden='true' />

        <section className='referral-hero'>
          <div className='referral-copy'>
            <span className='eyebrow'>AFFILIATE VOYAGE · 2026</span>
            <h1>
              邀友启航，
              <span>返利直达 20%</span>
            </h1>
            <p>
              邀请好友完成真实充值，解锁银河里程碑。原固定邀请奖励保持不变。
            </p>
            <div className='referral-actions'>
              <Button className='invite-button' onClick={copyInviteLink}>
                <Copy aria-hidden='true' />
                复制邀请链接
              </Button>
              <div className='max-rate'>
                <strong>20%</strong>
                <span>最高返利</span>
              </div>
            </div>
          </div>

          <div
            className='galaxy-staircase referral-reference-art'
            style={
              {
                '--reward-reference-art':
                  "url('/reward-assets/referral-staircase-clean-v2.webp')",
              } as React.CSSProperties
            }
            aria-hidden='true'
          >
            <span className='reference-art-glow' />
          </div>

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
              <strong>{affiliate?.current_stage.name ?? '待启航'}</strong>
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
                      <Sparkles aria-hidden='true' /> 当前段位
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
                  <span className='claim-check'><Check aria-hidden='true' /></span>
                  <div>
                    <strong>
                      已转入 {formatQuotaWithCurrency(record.quota, {
                        digitsLarge: 2,
                        digitsSmall: 2,
                        abbreviate: false,
                        minimumNonZero: 0.01,
                      })}
                    </strong>
                    <small>
                      返利余额 {formatQuotaWithCurrency(record.aff_quota_before, {
                        digitsLarge: 2,
                        digitsSmall: 2,
                        abbreviate: false,
                      })} → {formatQuotaWithCurrency(record.aff_quota_after, {
                        digitsLarge: 2,
                        digitsSmall: 2,
                        abbreviate: false,
                      })}
                    </small>
                  </div>
                  <time>{new Date(record.created_at * 1000).toLocaleString('zh-CN', { hour12: false })}</time>
                  <span className='claim-status claim-status--granted'>已到账</span>
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
