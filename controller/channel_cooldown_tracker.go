package controller

import (
	"sync"
	"time"
)

const (
	transientCooldownUserQuorum = 3
	transientCooldownWindow     = time.Minute
)

type channelTransientFailure struct {
	startedAt time.Time
	users     map[int]struct{}
}

type channelTransientFailureTracker struct {
	mu       sync.Mutex
	failures map[int]channelTransientFailure
}

var sharedChannelFailureTracker = channelTransientFailureTracker{
	failures: make(map[int]channelTransientFailure),
}

func isTransientCooldownClass(class string) bool {
	switch class {
	case "timeout", "connectivity", "request_failed", "upstream_gateway", "upstream_500", "upstream_5xx",
		"channel_runtime", "channel", "auth", "rate_limit", "automatic_disable":
		return true
	default:
		return false
	}
}

func shouldApplySharedChannelCooldown(channelID int, userID int, class string) (bool, int) {
	if !isTransientCooldownClass(class) {
		return true, 0
	}
	return sharedChannelFailureTracker.record(channelID, userID, time.Now())
}

func clearChannelTransientFailures(channelID int) {
	sharedChannelFailureTracker.clear(channelID)
}

func (t *channelTransientFailureTracker) record(channelID int, userID int, now time.Time) (bool, int) {
	if channelID <= 0 || userID <= 0 {
		return false, 0
	}

	t.mu.Lock()
	defer t.mu.Unlock()
	if t.failures == nil {
		t.failures = make(map[int]channelTransientFailure)
	}
	failure, ok := t.failures[channelID]
	if !ok || now.Sub(failure.startedAt) > transientCooldownWindow {
		failure = channelTransientFailure{
			startedAt: now,
			users:     make(map[int]struct{}),
		}
	}
	failure.users[userID] = struct{}{}
	count := len(failure.users)
	if count >= transientCooldownUserQuorum {
		delete(t.failures, channelID)
		return true, count
	}
	t.failures[channelID] = failure
	return false, count
}

func (t *channelTransientFailureTracker) clear(channelID int) {
	if channelID <= 0 {
		return
	}
	t.mu.Lock()
	delete(t.failures, channelID)
	t.mu.Unlock()
}
