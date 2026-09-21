package perfmetrics

import "testing"

func TestMergeRecentRequestStatusesKeepsNewestBoundedHistory(t *testing.T) {
	persisted := make([]RecentRequestStatus, 0, recentRequestStatusLimit)
	for index := int64(1); index <= recentRequestStatusLimit; index++ {
		persisted = append(persisted, RecentRequestStatus{Ts: index, Success: true})
	}
	local := []RecentRequestStatus{
		{Ts: recentRequestStatusLimit, Success: true},
		{Ts: recentRequestStatusLimit + 1, Success: false, LatencyMs: 4200},
	}

	merged := mergeRecentRequestStatuses(persisted, local)
	if len(merged) != recentRequestStatusLimit {
		t.Fatalf("expected %d statuses, got %d", recentRequestStatusLimit, len(merged))
	}
	if merged[0].Ts != 2 {
		t.Fatalf("expected oldest status to roll off, got ts=%d", merged[0].Ts)
	}
	last := merged[len(merged)-1]
	if last.Ts != recentRequestStatusLimit+1 || last.Success || last.LatencyMs != 4200 {
		t.Fatalf("unexpected newest status: %#v", last)
	}
}
