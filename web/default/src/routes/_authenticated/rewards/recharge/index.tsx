import { createFileRoute } from '@tanstack/react-router'
import { RechargePage } from '@/features/reward-center'

export const Route = createFileRoute('/_authenticated/rewards/recharge/')({
  component: RechargePage,
})
