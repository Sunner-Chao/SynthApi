import { createFileRoute } from '@tanstack/react-router'
import { ReferralPage } from '@/features/reward-center'

export const Route = createFileRoute('/_authenticated/rewards/referral/')({
  component: ReferralPage,
})
