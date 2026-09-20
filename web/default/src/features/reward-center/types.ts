export type AffiliateRewardStage = {
  code: string
  name: string
  min_invites: number
  max_invites: number
  rate_bps: number
}

export type AffiliateRebateRecord = {
  id: number
  trade_no: string
  invitee_user_id: number
  inviter_user_id: number
  paid_cny: number
  effective_invite_count: number
  stage_code: string
  stage_name: string
  rate_bps: number
  reward_quota: number
  created_at: number
}

export type AffiliateTransferRecord = {
  id: number
  user_id: number
  quota: number
  aff_quota_before: number
  aff_quota_after: number
  quota_before: number
  quota_after: number
  created_at: number
}

export type RechargeBenefitClaim = {
  id: number
  user_id: number
  milestone_index: number
  threshold_cny: number
  reward_cny: number
  reward_quota: number
  status: 'pending' | 'granted' | 'rejected'
  requested_at: number
  granted_at: number
  granted_by: number
  admin_remark: string
  created_at: number
  updated_at: number
  username?: string
}

export type RewardProgramOverview = {
  affiliate: {
    effective_invite_count: number
    current_stage: AffiliateRewardStage
    next_stage: AffiliateRewardStage | null
    total_reward_quota: number
    total_reward_cny: number
    rebate_order_count: number
    recent_records: AffiliateRebateRecord[]
    recent_transfers: AffiliateTransferRecord[]
    stages: AffiliateRewardStage[]
  }
  recharge: {
    total_recharge_cny: number
    current_cycle_cny: number
    next_threshold_cny: number
    unlocked_count: number
    available_count: number
    pending_count: number
    granted_count: number
    threshold_unit_cny: number
    reward_unit_cny: number
    recent_claims: RechargeBenefitClaim[]
  }
}

export type AdminUserRewardSummary = {
  user_id: number
  affiliate: RewardProgramOverview['affiliate']
  recharge: RewardProgramOverview['recharge']
}

export type AdminUserRewardListSummary = {
  user_id: number
  effective_invite_count: number
  current_stage: AffiliateRewardStage
  total_reward_cny: number
  rebate_order_count: number
  total_recharge_cny: number
  pending_benefit_count: number
  granted_benefit_count: number
}

export type ApiResponse<T> = {
  success: boolean
  message: string
  data: T
}

export type ClaimPage = {
  items: RechargeBenefitClaim[]
  total: number
}
