import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  Ban,
  Check,
  ChevronRight,
  Clock3,
  Coins,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { useStatus } from '@/hooks/use-status'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getRechargeBenefitClaims,
  requestRechargeBenefit,
  reviewRechargeBenefitClaim,
} from './api'
import { RewardCenterShell } from './reward-center-shell'
import './styles.css'
import type { RechargeBenefitClaim } from './types'
import { useRewardOverview } from './use-reward-overview'

function formatTime(timestamp: number) {
  if (!timestamp) return '--'
  return new Date(timestamp * 1000).toLocaleString('zh-CN', {
    hour12: false,
  })
}

function ClaimStatus(props: { status: RechargeBenefitClaim['status'] }) {
  const config = {
    pending: { label: '审核中', icon: Clock3 },
    granted: { label: '已领取', icon: Check },
    rejected: { label: '可重申', icon: Ban },
  }[props.status]
  const Icon = config.icon
  return (
    <span className={`claim-status claim-status--${props.status}`}>
      <Icon aria-hidden='true' /> {config.label}
    </span>
  )
}

export function RechargePage() {
  const { status } = useStatus()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.auth.user)
  const rechargeEnabled = status?.recharge_benefit_enabled !== false
  const overviewQuery = useRewardOverview('recharge', rechargeEnabled)
  const recharge = overviewQuery.data?.recharge
  const [adminStatus, setAdminStatus] = useState('pending')
  const isAdmin = (user?.role ?? 0) >= 10
  const progress = Math.min(
    100,
    ((recharge?.current_cycle_cny ?? 0) /
      (recharge?.threshold_unit_cny || 1000)) *
      100
  )
  const energy = progress / 100
  const progressAngle = progress * 3.6
  const energyParticles = useMemo(() => {
    const count = progress <= 0 ? 0 : Math.min(24, 4 + Math.floor(progress / 5))

    return Array.from({ length: count }, (_, index) => ({
      angle: (index * 137.5 + progress * 1.8) % 360,
      inset: 9 + ((index * 7) % 18),
      delay: -((index * 0.31) % 3.6),
      duration: 1.7 + ((index * 13) % 19) / 10,
      size: 2 + ((index * 5) % 4),
    }))
  }, [progress])

  const claimMutation = useMutation({
    mutationFn: requestRechargeBenefit,
    onSuccess: async (response) => {
      if (!response.success) return
      toast.success('申请已进入管理员审核队列')
      await queryClient.invalidateQueries({
        queryKey: ['reward-program-overview', 'recharge'],
      })
      await queryClient.invalidateQueries({
        queryKey: ['reward-admin-claims'],
      })
    },
  })

  const adminClaimsQuery = useQuery({
    queryKey: ['reward-admin-claims', adminStatus],
    queryFn: async () => {
      const response = await getRechargeBenefitClaims(adminStatus)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    enabled: isAdmin && rechargeEnabled,
  })

  const reviewMutation = useMutation({
    mutationFn: (input: { id: number; action: 'grant' | 'reject' }) =>
      reviewRechargeBenefitClaim(input.id, input.action),
    onSuccess: async (response) => {
      if (!response.success) return
      toast.success(
        response.data.status === 'granted' ? '福利已发放' : '申请已驳回'
      )
      await queryClient.invalidateQueries({ queryKey: ['reward-admin-claims'] })
      await queryClient.invalidateQueries({
        queryKey: ['reward-program-overview', 'recharge'],
      })
    },
  })

  const remaining = useMemo(() => {
    const threshold = recharge?.threshold_unit_cny ?? 1000
    const current = recharge?.current_cycle_cny ?? 0
    if (current >= threshold) return 0
    return threshold - current
  }, [recharge])

  useEffect(() => {
    if (
      !rechargeEnabled &&
      status?.affiliate_milestone_reward_enabled !== false
    ) {
      void navigate({ to: '/rewards/referral', replace: true })
    }
  }, [navigate, rechargeEnabled, status?.affiliate_milestone_reward_enabled])

  if (!rechargeEnabled) return null

  if (overviewQuery.isLoading) {
    return (
      <div className='reward-loading'>
        <Skeleton className='h-16 w-72' />
        <Skeleton className='h-[65vh] w-full' />
      </div>
    )
  }

  return (
    <RewardCenterShell active='recharge'>
      <main className='recharge-station'>
        <div className='station-grid' aria-hidden='true' />
        <section className='recharge-heading'>
          <span>ENERGY BENEFIT PROGRAM</span>
          <h1>
            千元充能计划 <Zap aria-hidden='true' />
          </h1>
          <p>
            每累计净充值 <strong>¥1,000</strong>，解锁 <strong>¥50</strong> API
            限制额度
          </p>
        </section>

        <section className='recharge-core'>
          <div
            className='crystal-reactor recharge-reference-art'
            style={
              {
                '--reward-reference-art':
                  "url('/reward-assets/recharge-reactor-clean.webp')",
              } as React.CSSProperties
            }
            aria-hidden='true'
          >
            <span className='reference-art-glow' />
          </div>

          <div className='recharge-gauge'>
            <div
              className={`gauge-ring ${progress >= 100 ? 'is-charged' : ''}`}
              role='progressbar'
              aria-label='千元充能进度'
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              style={
                {
                  '--progress': `${progressAngle}deg`,
                  '--progress-warm': `${progressAngle * 0.38}deg`,
                  '--progress-cyan': `${progressAngle * 0.76}deg`,
                  '--energy': energy,
                  '--energy-glow': 0.2 + energy * 0.42,
                  '--energy-core': 0.08 + energy * 0.22,
                  '--particle-opacity': progress <= 0 ? 0 : 0.3 + energy * 0.7,
                  '--particle-speed': `${Math.max(4.8, 8 - energy * 3.2)}s`,
                  '--stream-blur': `${4 + energy * 9}px`,
                } as React.CSSProperties
              }
            >
              <span className='gauge-energy-stream' aria-hidden='true' />
              <span className='gauge-charge-front' aria-hidden='true' />
              <span className='gauge-energy-particles' aria-hidden='true'>
                {energyParticles.map((particle, index) => (
                  <i
                    key={index}
                    style={
                      {
                        '--particle-angle': `${particle.angle}deg`,
                        '--particle-inset': `${particle.inset}%`,
                        '--particle-delay': `${particle.delay}s`,
                        '--particle-duration': `${particle.duration}s`,
                        '--particle-size': `${particle.size}px`,
                      } as React.CSSProperties
                    }
                  />
                ))}
              </span>
              <div className='gauge-ring__inner'>
                <span>累计净充值</span>
                <strong>
                  ¥{(recharge?.total_recharge_cny ?? 0).toLocaleString()}
                </strong>
                <small>
                  / ¥{recharge?.next_threshold_cny.toLocaleString() ?? '1,000'}
                </small>
                <b className='gauge-percent'>{progress.toFixed(0)}% 充能</b>
                <div className='gauge-line' />
                <em>
                  {remaining > 0
                    ? `还差 ¥${remaining.toFixed(0)} 解锁下一份`
                    : '已有福利可申请'}
                </em>
              </div>
            </div>
          </div>

          <aside className='benefit-vault'>
            <span className='benefit-vault__label'>可领取额度</span>
            <div className='benefit-ticket'>
              <div>
                <span>¥</span>
                <strong>{recharge?.reward_unit_cny ?? 50}</strong>
                <p>API 限制额度</p>
              </div>
              <KeyRound aria-hidden='true' />
            </div>
            <Button
              className='claim-button'
              disabled={
                (recharge?.available_count ?? 0) <= 0 || claimMutation.isPending
              }
              onClick={() => claimMutation.mutate()}
            >
              {(recharge?.available_count ?? 0) > 0
                ? `申请领取 · 可领 ${recharge?.available_count} 份`
                : recharge?.pending_count
                  ? '福利审核中'
                  : '继续充能解锁'}
              <ChevronRight aria-hidden='true' />
            </Button>
            <div className='benefit-facts'>
              <span>
                <LockKeyhole /> 已解锁 {recharge?.unlocked_count ?? 0} 次
              </span>
              <span>
                <Coins /> 额度自动累计
              </span>
              <span>
                <Ban /> 不可提现或转赠
              </span>
            </div>
          </aside>
        </section>

        <section className='claim-history'>
          <div className='claim-history__title'>
            <div>
              <Sparkles aria-hidden='true' />
              <span>
                <strong>解锁记录</strong>
                <small>每个千元里程碑均有独立审计记录</small>
              </span>
            </div>
            <span className='history-total'>
              已发放 {recharge?.granted_count ?? 0} 份
            </span>
          </div>
          <div className='claim-list'>
            {(recharge?.recent_claims ?? []).length === 0 ? (
              <div className='claim-empty'>
                完成首个 ¥1,000 充能里程碑后，记录将在这里点亮。
              </div>
            ) : (
              recharge?.recent_claims.map((claim) => (
                <article className='claim-row' key={claim.id}>
                  <span className='claim-check'>
                    <Check aria-hidden='true' />
                  </span>
                  <div>
                    <strong>解锁 ¥{claim.reward_cny} API 限制额度</strong>
                    <small>
                      累计净充值达 ¥{claim.threshold_cny.toLocaleString()}
                    </small>
                  </div>
                  <time>{formatTime(claim.requested_at)}</time>
                  <ClaimStatus status={claim.status} />
                </article>
              ))
            )}
          </div>
        </section>

        {isAdmin && (
          <section className='admin-claim-console'>
            <div className='admin-console__header'>
              <div>
                <ShieldCheck /> 管理员发放台
              </div>
              <div className='admin-status-tabs'>
                {(['pending', 'granted', 'rejected'] as const).map((status) => (
                  <button
                    type='button'
                    key={status}
                    className={adminStatus === status ? 'is-active' : ''}
                    onClick={() => setAdminStatus(status)}
                  >
                    {
                      {
                        pending: '待审核',
                        granted: '已发放',
                        rejected: '已驳回',
                      }[status]
                    }
                  </button>
                ))}
              </div>
            </div>
            <div className='admin-claim-list'>
              {(adminClaimsQuery.data?.items ?? []).map((claim) => (
                <article key={claim.id}>
                  <span>用户 #{claim.user_id}</span>
                  <strong>
                    ¥{claim.threshold_cny.toLocaleString()} 里程碑
                  </strong>
                  <ClaimStatus status={claim.status} />
                  {claim.status === 'pending' && (
                    <div>
                      <Button
                        size='sm'
                        onClick={() =>
                          reviewMutation.mutate({
                            id: claim.id,
                            action: 'grant',
                          })
                        }
                      >
                        <Check /> 发放
                      </Button>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() =>
                          reviewMutation.mutate({
                            id: claim.id,
                            action: 'reject',
                          })
                        }
                      >
                        <Ban /> 驳回
                      </Button>
                    </div>
                  )}
                </article>
              ))}
              {!adminClaimsQuery.isLoading &&
                (adminClaimsQuery.data?.items ?? []).length === 0 && (
                  <div className='claim-empty'>当前状态下暂无申请。</div>
                )}
            </div>
          </section>
        )}
      </main>
    </RewardCenterShell>
  )
}
