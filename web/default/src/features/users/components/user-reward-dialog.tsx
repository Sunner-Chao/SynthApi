/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useQuery } from '@tanstack/react-query'
import { Gift, Loader2, Sparkles, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getUserRewardSummary } from '../api'
import type { User } from '../types'

export function UserRewardDialog(props: {
  user: User
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const summaryQuery = useQuery({
    queryKey: ['admin-user-reward-summary', props.user.id],
    queryFn: async () => {
      const response = await getUserRewardSummary(props.user.id)
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Failed to load reward summary')
      }
      return response.data
    },
    enabled: props.open,
  })
  const summary = summaryQuery.data

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>{t('Reward details')}</DialogTitle>
          <DialogDescription>
            {props.user.username} · ID {props.user.id}
          </DialogDescription>
        </DialogHeader>
        {summaryQuery.isLoading ? (
          <div className='flex justify-center py-10'>
            <Loader2 className='text-muted-foreground size-6 animate-spin' />
          </div>
        ) : summary ? (
          <div className='space-y-4'>
            <section className='bg-muted/20 space-y-3 rounded-lg border p-4'>
              <div className='flex items-center justify-between gap-3'>
                <div className='flex items-center gap-2 font-semibold'>
                  <Sparkles className='size-4 text-amber-500' />
                  {t('Invitation rebate details')}
                </div>
                <Badge className='bg-amber-500 text-slate-950 hover:bg-amber-500'>
                  {summary.affiliate.current_stage.name}
                </Badge>
              </div>
              <div className='grid grid-cols-2 gap-3 text-sm sm:grid-cols-4'>
                <Metric
                  label={t('Current rebate rate')}
                  value={`${(summary.affiliate.current_stage.rate_bps / 100).toFixed(1)}%`}
                />
                <Metric
                  label={t('Effective paid invitees')}
                  value={summary.affiliate.effective_invite_count}
                />
                <Metric
                  label={t('Rebate orders')}
                  value={summary.affiliate.rebate_order_count}
                />
                <Metric
                  label={t('Total rebate earned')}
                  value={`¥${summary.affiliate.total_reward_cny.toFixed(2)}`}
                />
              </div>
              <div className='text-muted-foreground flex items-center gap-2 border-t pt-3 text-sm'>
                <Users className='size-4' />
                {summary.affiliate.next_stage
                  ? t('{{count}} more paid invitees to {{stage}}', {
                      count: Math.max(
                        0,
                        summary.affiliate.next_stage.min_invites -
                          summary.affiliate.effective_invite_count
                      ),
                      stage: summary.affiliate.next_stage.name,
                    })
                  : t('Highest invitation rebate stage reached')}
              </div>
            </section>
            <section className='bg-muted/20 space-y-3 rounded-lg border p-4'>
              <div className='flex items-center gap-2 font-semibold'>
                <Gift className='size-4 text-cyan-500' />
                {t('Thousand-yuan recharge benefit')}
              </div>
              <div className='grid grid-cols-2 gap-3 text-sm sm:grid-cols-4'>
                <Metric
                  label={t('Total recharge')}
                  value={`¥${summary.recharge.total_recharge_cny.toFixed(2)}`}
                />
                <Metric
                  label={t('Unlocked')}
                  value={summary.recharge.unlocked_count}
                />
                <Metric
                  label={t('Granted')}
                  value={summary.recharge.granted_count}
                />
                <Metric
                  label={t('Pending review')}
                  value={summary.recharge.pending_count}
                />
              </div>
            </section>
          </div>
        ) : (
          <div className='text-muted-foreground py-10 text-center text-sm'>
            {t('No reward data available')}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Metric(props: { label: string; value: string | number }) {
  return (
    <div>
      <span className='text-muted-foreground text-xs'>{props.label}</span>
      <strong className='mt-1 block'>{props.value}</strong>
    </div>
  )
}
