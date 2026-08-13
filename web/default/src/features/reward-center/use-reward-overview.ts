import { useQuery } from '@tanstack/react-query'
import { getRewardProgramOverview } from './api'

export function useRewardOverview(
  program: 'affiliate' | 'recharge',
  enabled = true
) {
  return useQuery({
    queryKey: ['reward-program-overview', program],
    queryFn: async () => {
      const response = await getRewardProgramOverview(program)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    refetchInterval: 60_000,
    enabled,
  })
}
