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
import { useCallback, useEffect, useState } from 'react'
import { Gift, Loader2, Sparkles, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatAccountingQuotaWithCurrency } from '@/lib/currency'
import { formatQuota, formatCompactNumber } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import type { AdminUserRewardSummary } from '@/features/reward-center/types'
import { getUserInfo, getUserRewardSummary } from '../../api'
import type { UserInfo } from '../../types'

interface UserInfoDialogProps {
  userId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function InfoItem(props: { label: string; value: string | number }) {
  return (
    <div className='space-y-1.5'>
      <Label className='text-muted-foreground text-xs'>{props.label}</Label>
      <div className='text-sm font-semibold'>{props.value}</div>
    </div>
  )
}

export function UserInfoDialog({
  userId,
  open,
  onOpenChange,
}: UserInfoDialogProps) {
  const { t } = useTranslation()
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [rewardSummary, setRewardSummary] =
    useState<AdminUserRewardSummary | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const fetchUserInfo = useCallback(
    async (id: number) => {
      setIsLoading(true)
      try {
        const [userResult, rewardResult] = await Promise.all([
          getUserInfo(id),
          getUserRewardSummary(id),
        ])
        if (userResult.success) {
          setUserInfo(userResult.data || null)
        } else {
          toast.error(
            userResult.message || t('Failed to fetch user information')
          )
        }
        setRewardSummary(
          rewardResult.success ? rewardResult.data || null : null
        )
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch user info:', error)
        toast.error(t('Failed to fetch user information'))
      } finally {
        setIsLoading(false)
      }
    },
    [t]
  )

  useEffect(() => {
    if (open && userId) {
      // The dialog owns this request lifecycle and refreshes when its target changes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchUserInfo(userId)
    }
  }, [open, userId, fetchUserInfo])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[88vh] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('User Information')}</DialogTitle>
          <DialogDescription>
            {t(
              'View detailed information about this user including balance, usage statistics, and invitation details.'
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className='flex items-center justify-center py-8'>
            <Loader2 className='text-muted-foreground size-6 animate-spin' />
          </div>
        ) : userInfo ? (
          <div className='space-y-4 py-4'>
            {/* Basic Info */}
            <div className='grid grid-cols-2 gap-4'>
              <InfoItem label={t('Username')} value={userInfo.username} />
              {userInfo.display_name && (
                <InfoItem
                  label={t('Display Name')}
                  value={userInfo.display_name}
                />
              )}
            </div>

            {/* Balance Info */}
            <div className='grid grid-cols-2 gap-4'>
              <InfoItem
                label={t('Balance')}
                value={formatQuota(userInfo.quota)}
              />
              <InfoItem
                label={t('Used Quota')}
                value={formatAccountingQuotaWithCurrency(userInfo.used_quota)}
              />
            </div>

            {/* Statistics */}
            <div className='grid grid-cols-2 gap-4'>
              <InfoItem
                label={t('Request Count')}
                value={formatCompactNumber(userInfo.request_count)}
              />
              {userInfo.group && (
                <InfoItem label={t('User Group')} value={userInfo.group} />
              )}
            </div>

            {/* Invitation Info */}
            {(userInfo.aff_code ||
              userInfo.aff_count !== undefined ||
              (userInfo.aff_quota !== undefined && userInfo.aff_quota > 0)) && (
              <>
                <div className='grid grid-cols-2 gap-4'>
                  {userInfo.aff_code && (
                    <InfoItem
                      label={t('Invitation Code')}
                      value={userInfo.aff_code}
                    />
                  )}
                  {userInfo.aff_count !== undefined && (
                    <InfoItem
                      label={t('Invited Users')}
                      value={formatCompactNumber(userInfo.aff_count)}
                    />
                  )}
                </div>

                {userInfo.aff_quota !== undefined && userInfo.aff_quota > 0 && (
                  <InfoItem
                    label={t('Invitation Quota')}
                    value={formatAccountingQuotaWithCurrency(
                      userInfo.aff_quota
                    )}
                  />
                )}
              </>
            )}

            {rewardSummary && (
              <div className='space-y-3'>
              <div className='bg-muted/20 space-y-4 rounded-lg border p-4'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <div className='flex items-center gap-2 font-semibold'>
                    <Sparkles className='size-4 text-amber-500' />
                    {t('Invitation rebate details')}
                  </div>
                  <Badge className='bg-amber-500 text-slate-950 hover:bg-amber-500'>
                    {rewardSummary.affiliate.current_stage.name}
                  </Badge>
                </div>
                <div className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
                  <InfoItem
                    label={t('Current rebate rate')}
                    value={`${(rewardSummary.affiliate.current_stage.rate_bps / 100).toFixed(1)}%`}
                  />
                  <InfoItem
                    label={t('Effective paid invitees')}
                    value={rewardSummary.affiliate.effective_invite_count}
                  />
                  <InfoItem
                    label={t('Rebate orders')}
                    value={rewardSummary.affiliate.rebate_order_count}
                  />
                  <InfoItem
                    label={t('Total rebate earned')}
                    value={`¥${rewardSummary.affiliate.total_reward_cny.toFixed(2)}`}
                  />
                </div>
                <div className='grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-2'>
                  <div className='flex items-center gap-2 text-sm'>
                    <Users className='text-muted-foreground size-4' />
                    {rewardSummary.affiliate.next_stage
                      ? t('{{count}} more paid invitees to {{stage}}', {
                          count: Math.max(
                            0,
                            rewardSummary.affiliate.next_stage.min_invites -
                              rewardSummary.affiliate.effective_invite_count
                          ),
                          stage: rewardSummary.affiliate.next_stage.name,
                        })
                      : t('Highest invitation rebate stage reached')}
                  </div>
                </div>
              </div>
              <div className='bg-muted/20 space-y-3 rounded-lg border p-4'>
                <div className='flex items-center gap-2 font-semibold'>
                  <Gift className='size-4 text-cyan-500' />
                  {t('Thousand-yuan recharge benefit')}
                </div>
                <div className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
                  <InfoItem
                    label={t('Total recharge')}
                    value={`¥${rewardSummary.recharge.total_recharge_cny.toFixed(2)}`}
                  />
                  <InfoItem
                    label={t('Unlocked')}
                    value={rewardSummary.recharge.unlocked_count}
                  />
                  <InfoItem
                    label={t('Granted')}
                    value={rewardSummary.recharge.granted_count}
                  />
                  <InfoItem
                    label={t('Pending review')}
                    value={rewardSummary.recharge.pending_count}
                  />
                </div>
              </div>
              </div>
            )}

            {/* Remark */}
            {userInfo.remark && (
              <div className='space-y-1.5'>
                <Label className='text-muted-foreground text-xs'>
                  {t('Remark')}
                </Label>
                <div className='text-sm leading-relaxed font-semibold break-words'>
                  {userInfo.remark}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className='text-muted-foreground py-8 text-center text-sm'>
            {t('No user information available')}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
