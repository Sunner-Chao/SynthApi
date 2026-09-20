import { api } from '@/lib/api'
import type {
  ApiResponse,
  AdminUserRewardSummary,
  ClaimPage,
  RechargeBenefitClaim,
  RewardProgramOverview,
} from './types'

export type RewardProgramSettings = {
  AffiliateMilestoneRewardEnabled: boolean
  RechargeBenefitEnabled: boolean
}

export async function getRewardProgramSettings(): Promise<
  ApiResponse<RewardProgramSettings>
> {
  const response = await api.get('/api/user/rewards/admin/settings', {
    skipErrorHandler: true,
  })
  return response.data
}

export async function updateRewardProgramSetting(
  key: keyof RewardProgramSettings,
  value: boolean
): Promise<ApiResponse<RewardProgramSettings>> {
  const response = await api.put(
    '/api/user/rewards/admin/settings',
    { key, value },
    { skipErrorHandler: true }
  )
  return response.data
}

export async function getRewardProgramOverview(
  program: 'affiliate' | 'recharge'
): Promise<ApiResponse<RewardProgramOverview>> {
  const response = await api.get('/api/user/rewards/overview', {
    params: { program },
    // This endpoint enriches the persistent sidebar and top notice. During a
    // rolling backend deployment it may briefly be unavailable; the page must
    // remain usable without emitting a global error toast every minute.
    skipErrorHandler: true,
  })
  return response.data
}

export async function requestRechargeBenefit(): Promise<
  ApiResponse<RechargeBenefitClaim>
> {
  const response = await api.post('/api/user/rewards/recharge/claim')
  return response.data
}

export async function getRechargeBenefitClaims(
  status = 'pending'
): Promise<ApiResponse<ClaimPage>> {
  const response = await api.get('/api/user/rewards/admin/claims', {
    // Page numbers are one-based in the backend. Sending zero is normalized
    // in most builds, but older deployments reject it before the controller.
    params: { status, p: 1, page_size: 50 },
    skipErrorHandler: true,
  })
  return response.data
}

export async function reviewRechargeBenefitClaim(
  claimId: number,
  action: 'grant' | 'reject',
  remark = ''
): Promise<ApiResponse<RechargeBenefitClaim>> {
  const response = await api.post(
    `/api/user/rewards/admin/claims/${claimId}/${action}`,
    { remark },
    { skipErrorHandler: true }
  )
  return response.data
}

export async function getAdminUserRewardSummary(
  userId: number
): Promise<ApiResponse<AdminUserRewardSummary>> {
  const response = await api.get(
    `/api/user/rewards/admin/users/${userId}/summary`,
    { skipErrorHandler: true }
  )
  return response.data
}
