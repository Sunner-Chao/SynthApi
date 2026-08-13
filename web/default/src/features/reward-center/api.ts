import { api } from '@/lib/api'
import type {
  ApiResponse,
  AdminUserRewardSummary,
  ClaimPage,
  RechargeBenefitClaim,
  RewardProgramOverview,
} from './types'

export async function getRewardProgramOverview(
  program: 'affiliate' | 'recharge'
): Promise<ApiResponse<RewardProgramOverview>> {
  const response = await api.get('/api/user/rewards/overview', {
    params: { program },
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
    { remark }
  )
  return response.data
}

export async function getAdminUserRewardSummary(
  userId: number
): Promise<ApiResponse<AdminUserRewardSummary>> {
  const response = await api.get(
    `/api/user/rewards/admin/users/${userId}/summary`
  )
  return response.data
}
