import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Ban, Check, ExternalLink, Gift, Settings2, ShieldCheck, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useStatus } from '@/hooks/use-status'
import {
  getRechargeBenefitClaims,
  getRewardProgramSettings,
  reviewRechargeBenefitClaim,
  updateRewardProgramSetting,
} from './api'
import type { RewardProgramSettings } from './api'
import { RewardCenterShell } from './reward-center-shell'
import './styles.css'
import type { RechargeBenefitClaim } from './types'

function formatDate(timestamp: number) {
  if (!timestamp) return '—'
  return new Date(timestamp * 1000).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ClaimState({ status }: { status: RechargeBenefitClaim['status'] }) {
  const labels = { pending: '待审核', granted: '已发放', rejected: '已驳回' }
  return <span className={`claim-status claim-status--${status}`}>{labels[status]}</span>
}

export function AdminRewardPage() {
  const { status } = useStatus()
  const queryClient = useQueryClient()
  const [claimStatus, setClaimStatus] = useState<'pending' | 'granted' | 'rejected'>('pending')
  const settingsQuery = useQuery({
    queryKey: ['reward-admin-settings'],
    queryFn: async () => {
      const response = await getRewardProgramSettings()
      if (!response.success) throw new Error(response.message)
      return response.data
    },
  })
  const settings = settingsQuery.data ?? {
    AffiliateMilestoneRewardEnabled:
      status?.affiliate_milestone_reward_enabled !== false,
    RechargeBenefitEnabled: status?.recharge_benefit_enabled !== false,
  }

  const updateSetting = useMutation({
    mutationFn: (input: {
      key: keyof RewardProgramSettings
      value: boolean
    }) => updateRewardProgramSetting(input.key, input.value),
    onSuccess: async (response) => {
      if (!response.success) {
        toast.error(response.message || '设置更新失败')
        return
      }
      toast.success('活动设置已更新')
      await queryClient.invalidateQueries({ queryKey: ['reward-admin-settings'] })
      await queryClient.invalidateQueries({ queryKey: ['status'] })
    },
  })

  const claimsQuery = useQuery({
    queryKey: ['reward-admin-claims', claimStatus],
    queryFn: async () => {
      const response = await getRechargeBenefitClaims(claimStatus)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    enabled: !settingsQuery.isLoading,
  })

  const reviewMutation = useMutation({
    mutationFn: (input: { id: number; action: 'grant' | 'reject' }) =>
      reviewRechargeBenefitClaim(input.id, input.action),
    onSuccess: async (response) => {
      if (!response.success) {
        toast.error(response.message || '操作失败')
        return
      }
      toast.success(response.data.status === 'granted' ? '福利额度已发放' : '申请已驳回')
      await queryClient.invalidateQueries({ queryKey: ['reward-admin-claims'] })
      await queryClient.invalidateQueries({ queryKey: ['status'] })
    },
  })

  const toggle = (key: keyof RewardProgramSettings, value: boolean) => {
    updateSetting.mutate({ key, value })
  }

  if (settingsQuery.isLoading) {
    return <div className='reward-loading'><Skeleton className='h-16 w-72' /><Skeleton className='h-[65vh] w-full' /></div>
  }

  return (
    <RewardCenterShell active='admin'>
      <main className='reward-admin-page'>
        <section className='reward-admin-hero'>
          <div>
            <span className='eyebrow'>SYNTHAPI REWARD COMMAND</span>
            <h1>福利中心管理</h1>
            <p>统一管理用户端活动展示、千元充能申请与福利开关。关闭活动只影响新申请，历史记录继续保留。</p>
          </div>
          <div className='reward-admin-hero__status'><ShieldCheck /> 管理员权限</div>
        </section>

        <section className='reward-admin-program-grid'>
          <Card className='reward-admin-program-card reward-admin-program-card--affiliate'>
            <CardHeader>
              <div className='reward-admin-card-icon'><Gift /></div>
              <CardTitle>邀请返利计划</CardTitle>
              <CardDescription>用户端邀请返利页面与充值返利结算。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='reward-admin-switch-row'>
                <div><strong>{settings.AffiliateMilestoneRewardEnabled ? '用户端已开启' : '用户端已关闭'}</strong><span>历史返利台账不受影响</span></div>
                <Switch checked={settings.AffiliateMilestoneRewardEnabled} disabled={updateSetting.isPending} onCheckedChange={(checked) => toggle('AffiliateMilestoneRewardEnabled', checked)} />
              </div>
              <Button variant='outline' size='sm' render={<Link to='/rewards/referral' />}>查看用户页面 <ExternalLink /></Button>
            </CardContent>
          </Card>

          <Card className='reward-admin-program-card reward-admin-program-card--recharge'>
            <CardHeader>
              <div className='reward-admin-card-icon'><Zap /></div>
              <CardTitle>千元充能计划</CardTitle>
              <CardDescription>每累计净充值 ¥1,000，解锁 ¥50 API 限制额度。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='reward-admin-switch-row'>
                <div><strong>{settings.RechargeBenefitEnabled ? '用户端已开启' : '用户端已关闭'}</strong><span>关闭后仍可审核历史申请</span></div>
                <Switch checked={settings.RechargeBenefitEnabled} disabled={updateSetting.isPending} onCheckedChange={(checked) => toggle('RechargeBenefitEnabled', checked)} />
              </div>
              <Button variant='outline' size='sm' render={<Link to='/rewards/recharge' />}>查看用户页面 <ExternalLink /></Button>
            </CardContent>
          </Card>
        </section>

        <section className='reward-admin-claims'>
          <div className='reward-admin-section-heading'>
            <div><Settings2 /><div><h2>千元充能审核队列</h2><p>申请记录、发放状态和审核操作</p></div></div>
            <div className='admin-status-tabs'>{(['pending', 'granted', 'rejected'] as const).map((item) => <button type='button' key={item} className={claimStatus === item ? 'is-active' : ''} onClick={() => setClaimStatus(item)}>{{ pending: '待审核', granted: '已发放', rejected: '已驳回' }[item]}</button>)}</div>
          </div>
          <div className='reward-admin-claim-list'>
            {(claimsQuery.data?.items ?? []).map((claim) => (
              <article key={claim.id}>
                <div><strong>用户 #{claim.user_id}</strong><span>申请于 {formatDate(claim.requested_at)}</span></div>
                <div><b>¥{claim.reward_cny.toFixed(2)}</b><span>¥{claim.threshold_cny.toLocaleString()} 里程碑</span></div>
                <ClaimState status={claim.status} />
                {claim.status === 'pending' && <div className='reward-admin-claim-actions'><Button size='sm' disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ id: claim.id, action: 'grant' })}><Check /> 发放</Button><Button size='sm' variant='outline' disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ id: claim.id, action: 'reject' })}><Ban /> 驳回</Button></div>}
              </article>
            ))}
            {!claimsQuery.isLoading && (claimsQuery.data?.items ?? []).length === 0 && <div className='claim-empty'>当前状态下暂无申请记录。</div>}
          </div>
        </section>

        <p className='reward-admin-footnote'>当前服务器活动状态：邀请返利 {status?.affiliate_milestone_reward_enabled === false ? '关闭' : '开启'} · 千元充能 {status?.recharge_benefit_enabled === false ? '关闭' : '开启'}</p>
      </main>
    </RewardCenterShell>
  )
}
