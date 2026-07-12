package perfmetrics

import (
	"strings"
	"sync"
	"time"
)

type GroupRouteHint struct {
	Group        string
	AvgTtftMs    int64
	AvgLatencyMs int64
	SuccessRate  float64
	RequestCount int64
	SuccessCount int64
}

type groupRouteHintsCacheEntry struct {
	expiresAt time.Time
	hints     map[string]GroupRouteHint
}

var (
	groupRouteHintsCache sync.Map
	groupRouteHintsLock  sync.Mutex
)

func GetGroupRouteHints(modelName string, hours int, ttl time.Duration) map[string]GroupRouteHint {
	modelName = strings.TrimSpace(modelName)
	if modelName == "" {
		return nil
	}
	if hours <= 0 {
		hours = 24
	}
	if ttl <= 0 {
		ttl = time.Minute
	}

	now := time.Now()
	if cached, ok := groupRouteHintsCache.Load(modelName); ok {
		entry := cached.(groupRouteHintsCacheEntry)
		if now.Before(entry.expiresAt) {
			return copyGroupRouteHints(entry.hints)
		}
	}

	groupRouteHintsLock.Lock()
	defer groupRouteHintsLock.Unlock()

	if cached, ok := groupRouteHintsCache.Load(modelName); ok {
		entry := cached.(groupRouteHintsCacheEntry)
		if now.Before(entry.expiresAt) {
			return copyGroupRouteHints(entry.hints)
		}
	}

	result, err := Query(QueryParams{Model: modelName, Hours: hours})
	if err != nil {
		return nil
	}

	hints := make(map[string]GroupRouteHint, len(result.Groups))
	for _, group := range result.Groups {
		groupName := strings.TrimSpace(group.Group)
		if groupName == "" {
			continue
		}
		hints[groupName] = GroupRouteHint{
			Group:        groupName,
			AvgTtftMs:    group.AvgTtftMs,
			AvgLatencyMs: group.AvgLatencyMs,
			SuccessRate:  group.SuccessRate,
			RequestCount: group.RequestCount,
			SuccessCount: group.SuccessCount,
		}
	}

	groupRouteHintsCache.Store(modelName, groupRouteHintsCacheEntry{
		expiresAt: now.Add(ttl),
		hints:     hints,
	})
	return copyGroupRouteHints(hints)
}

func copyGroupRouteHints(source map[string]GroupRouteHint) map[string]GroupRouteHint {
	if len(source) == 0 {
		return nil
	}
	copied := make(map[string]GroupRouteHint, len(source))
	for key, value := range source {
		copied[key] = value
	}
	return copied
}
