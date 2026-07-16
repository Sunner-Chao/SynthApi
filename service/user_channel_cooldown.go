package service

import (
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	userChannelCooldownMinimum    = 30 * time.Second
	userChannelCooldownMaximum    = 15 * time.Minute
	userChannelFailureResetWindow = 30 * time.Minute
)

type userChannelCooldownKey struct {
	userID    int
	channelID int
}

type userChannelCooldownEntry struct {
	consecutiveFailures int
	lastFailure         time.Time
	until               time.Time
}

type userChannelCooldownTracker struct {
	mu      sync.Mutex
	entries map[userChannelCooldownKey]userChannelCooldownEntry
}

var sharedUserChannelCooldowns = userChannelCooldownTracker{
	entries: make(map[userChannelCooldownKey]userChannelCooldownEntry),
}

func MarkUserChannelCooldown(c *gin.Context, channelID int, baseDuration time.Duration) time.Duration {
	if c == nil {
		return 0
	}
	return sharedUserChannelCooldowns.record(c.GetInt("id"), channelID, baseDuration, time.Now())
}

func ClearUserChannelCooldown(c *gin.Context, channelID int) {
	if c == nil {
		return
	}
	sharedUserChannelCooldowns.clear(c.GetInt("id"), channelID)
}

func IsUserChannelCoolingDown(c *gin.Context, channelID int) bool {
	if c == nil {
		return false
	}
	return sharedUserChannelCooldowns.isCoolingDown(c.GetInt("id"), channelID, time.Now())
}

func channelSelectionExcludedIDs(c *gin.Context) map[int]struct{} {
	if c == nil {
		return nil
	}
	excluded := cloneChannelIDSet(ImportedAccountExcludedChannelIDs(c))
	for channelID := range requestChannelSelectionExcludedIDs(c) {
		if excluded == nil {
			excluded = make(map[int]struct{})
		}
		excluded[channelID] = struct{}{}
	}
	for channelID := range sharedUserChannelCooldowns.excludedIDs(c.GetInt("id"), time.Now()) {
		if excluded == nil {
			excluded = make(map[int]struct{})
		}
		excluded[channelID] = struct{}{}
	}
	return excluded
}

func cloneChannelIDSet(source map[int]struct{}) map[int]struct{} {
	if len(source) == 0 {
		return nil
	}
	cloned := make(map[int]struct{}, len(source))
	for channelID := range source {
		cloned[channelID] = struct{}{}
	}
	return cloned
}

func (t *userChannelCooldownTracker) record(userID int, channelID int, baseDuration time.Duration, now time.Time) time.Duration {
	if userID <= 0 || channelID <= 0 || baseDuration <= 0 {
		return 0
	}
	if baseDuration < userChannelCooldownMinimum {
		baseDuration = userChannelCooldownMinimum
	}

	key := userChannelCooldownKey{userID: userID, channelID: channelID}
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.entries == nil {
		t.entries = make(map[userChannelCooldownKey]userChannelCooldownEntry)
	}
	entry := t.entries[key]
	if entry.lastFailure.IsZero() || now.Sub(entry.lastFailure) > userChannelFailureResetWindow {
		entry.consecutiveFailures = 0
	}
	entry.consecutiveFailures++
	entry.lastFailure = now

	duration := baseDuration
	for i := 1; i < entry.consecutiveFailures && duration < userChannelCooldownMaximum; i++ {
		if duration > userChannelCooldownMaximum/2 {
			duration = userChannelCooldownMaximum
			break
		}
		duration *= 2
	}
	if duration > userChannelCooldownMaximum {
		duration = userChannelCooldownMaximum
	}
	entry.until = now.Add(duration)
	t.entries[key] = entry
	return duration
}

func (t *userChannelCooldownTracker) clear(userID int, channelID int) {
	if userID <= 0 || channelID <= 0 {
		return
	}
	t.mu.Lock()
	delete(t.entries, userChannelCooldownKey{userID: userID, channelID: channelID})
	t.mu.Unlock()
}

func (t *userChannelCooldownTracker) isCoolingDown(userID int, channelID int, now time.Time) bool {
	if userID <= 0 || channelID <= 0 {
		return false
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	entry, ok := t.entries[userChannelCooldownKey{userID: userID, channelID: channelID}]
	return ok && now.Before(entry.until)
}

func (t *userChannelCooldownTracker) excludedIDs(userID int, now time.Time) map[int]struct{} {
	if userID <= 0 {
		return nil
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	excluded := make(map[int]struct{})
	for key, entry := range t.entries {
		if now.Sub(entry.lastFailure) > userChannelFailureResetWindow {
			delete(t.entries, key)
			continue
		}
		if key.userID == userID && now.Before(entry.until) {
			excluded[key.channelID] = struct{}{}
		}
	}
	if len(excluded) == 0 {
		return nil
	}
	return excluded
}
