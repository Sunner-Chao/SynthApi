package setting

import "sync/atomic"

var affiliateMilestoneRewardEnabled atomic.Bool
var rechargeBenefitEnabled atomic.Bool

func init() {
	affiliateMilestoneRewardEnabled.Store(true)
	rechargeBenefitEnabled.Store(true)
}

func IsAffiliateMilestoneRewardEnabled() bool {
	return affiliateMilestoneRewardEnabled.Load()
}

func SetAffiliateMilestoneRewardEnabled(enabled bool) {
	affiliateMilestoneRewardEnabled.Store(enabled)
}

func IsRechargeBenefitEnabled() bool {
	return rechargeBenefitEnabled.Load()
}

func SetRechargeBenefitEnabled(enabled bool) {
	rechargeBenefitEnabled.Store(enabled)
}
