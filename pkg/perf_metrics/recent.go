package perfmetrics

import (
	"context"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

const recentRequestStatusLimit = 60

const recentRequestStatusRedisNamespace = "new-api:channel_monitor:recent:v1:"

// RecentRequestStatus is the lightweight per-request state used by the group
// monitor. It intentionally omits request content and user identifiers.
type RecentRequestStatus struct {
	Ts                  int64 `json:"ts"`
	Success             bool  `json:"success"`
	LatencyMs           int64 `json:"latency_ms,omitempty"`
	OutputTokens        int64 `json:"output_tokens,omitempty"`
	GenerationMs        int64 `json:"generation_ms,omitempty"`
	ThroughputAvailable bool  `json:"throughput_available,omitempty"`
}

var recentRequestStatuses = struct {
	sync.RWMutex
	items        map[string][]RecentRequestStatus
	loadedGroups map[string]bool
}{
	items:        make(map[string][]RecentRequestStatus),
	loadedGroups: make(map[string]bool),
}

func recentRequestStatusRedisKey(group string) string {
	return recentRequestStatusRedisNamespace + common.Sha1([]byte(group))
}

func persistRecentRequestStatus(group string, status RecentRequestStatus) {
	if !common.RedisEnabled || common.RDB == nil {
		return
	}
	payload, err := common.Marshal(status)
	if err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	key := recentRequestStatusRedisKey(group)
	pipe := common.RDB.TxPipeline()
	pipe.LPush(ctx, key, payload)
	pipe.LTrim(ctx, key, 0, recentRequestStatusLimit-1)
	_, _ = pipe.Exec(ctx)
}

func sameRecentRequestStatus(left, right RecentRequestStatus) bool {
	return left.Ts == right.Ts &&
		left.Success == right.Success &&
		left.LatencyMs == right.LatencyMs &&
		left.OutputTokens == right.OutputTokens &&
		left.GenerationMs == right.GenerationMs &&
		left.ThroughputAvailable == right.ThroughputAvailable
}

func mergeRecentRequestStatuses(persisted, local []RecentRequestStatus) []RecentRequestStatus {
	merged := make([]RecentRequestStatus, 0, len(persisted)+len(local))
	merged = append(merged, persisted...)
	for _, candidate := range local {
		duplicate := false
		for _, existing := range merged {
			if sameRecentRequestStatus(existing, candidate) {
				duplicate = true
				break
			}
		}
		if !duplicate {
			merged = append(merged, candidate)
		}
	}
	if len(merged) > recentRequestStatusLimit {
		merged = merged[len(merged)-recentRequestStatusLimit:]
	}
	return merged
}

// hydrateRecentRequestStatusGroup restores the bounded history after a
// process restart. Redis is only the durable backing store; reads continue to
// use the in-process slice after the first successful hydration.
func hydrateRecentRequestStatusGroup(group string) {
	group = strings.TrimSpace(group)
	if group == "" {
		return
	}
	recentRequestStatuses.RLock()
	loaded := recentRequestStatuses.loadedGroups[group]
	recentRequestStatuses.RUnlock()
	if loaded {
		return
	}
	if !common.RedisEnabled || common.RDB == nil {
		recentRequestStatuses.Lock()
		recentRequestStatuses.loadedGroups[group] = true
		recentRequestStatuses.Unlock()
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	values, err := common.RDB.LRange(ctx, recentRequestStatusRedisKey(group), 0, recentRequestStatusLimit-1).Result()
	cancel()
	if err != nil {
		return
	}
	persisted := make([]RecentRequestStatus, 0, len(values))
	// Redis stores newest-first; the API contract remains oldest-to-newest.
	for index := len(values) - 1; index >= 0; index-- {
		var status RecentRequestStatus
		if err := common.Unmarshal([]byte(values[index]), &status); err != nil {
			continue
		}
		persisted = append(persisted, status)
	}

	recentRequestStatuses.Lock()
	recentRequestStatuses.items[group] = mergeRecentRequestStatuses(persisted, recentRequestStatuses.items[group])
	recentRequestStatuses.loadedGroups[group] = true
	recentRequestStatuses.Unlock()
}

func recordRecentRequestStatus(sample Sample) {
	group := strings.TrimSpace(sample.Group)
	if group == "" {
		group = "default"
	}
	status := RecentRequestStatus{
		Ts:           time.Now().Unix(),
		Success:      sample.Success,
		LatencyMs:    sample.LatencyMs,
		OutputTokens: sample.OutputTokens,
		GenerationMs: sample.GenerationMs,
		ThroughputAvailable: sample.HasTtft &&
			sample.OutputTokens > 0 &&
			sample.GenerationMs >= 1000,
	}

	persistRecentRequestStatus(group, status)
	recentRequestStatuses.Lock()
	items := append(recentRequestStatuses.items[group], status)
	if len(items) > recentRequestStatusLimit {
		items = items[len(items)-recentRequestStatusLimit:]
	}
	recentRequestStatuses.items[group] = items
	recentRequestStatuses.Unlock()
}

// QueryRecentRequestStatuses returns oldest-to-newest entries for one group.
func QueryRecentRequestStatuses(group string, limit int) []RecentRequestStatus {
	group = strings.TrimSpace(group)
	if group == "" {
		return nil
	}
	if limit <= 0 || limit > recentRequestStatusLimit {
		limit = recentRequestStatusLimit
	}
	hydrateRecentRequestStatusGroup(group)

	recentRequestStatuses.RLock()
	items := recentRequestStatuses.items[group]
	if len(items) > limit {
		items = items[len(items)-limit:]
	}
	result := append([]RecentRequestStatus(nil), items...)
	recentRequestStatuses.RUnlock()
	return result
}

// QueryRecentRequestStatusesAll returns a bounded copy suitable for a monitor
// endpoint without exposing the mutable in-process ring buffers.
func QueryRecentRequestStatusesAll(limit int) map[string][]RecentRequestStatus {
	if limit <= 0 || limit > recentRequestStatusLimit {
		limit = recentRequestStatusLimit
	}
	result := make(map[string][]RecentRequestStatus)
	recentRequestStatuses.RLock()
	for group, items := range recentRequestStatuses.items {
		if len(items) > limit {
			items = items[len(items)-limit:]
		}
		result[group] = append([]RecentRequestStatus(nil), items...)
	}
	recentRequestStatuses.RUnlock()
	return result
}
