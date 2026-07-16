package service

import "sync"

type channelActiveUserTracker struct {
	mu              sync.RWMutex
	usersByChannel  map[int]map[int]int
	activeByChannel map[int]int
}

func newChannelActiveUserTracker() *channelActiveUserTracker {
	return &channelActiveUserTracker{
		usersByChannel:  make(map[int]map[int]int),
		activeByChannel: make(map[int]int),
	}
}

var activeChannelUsers = newChannelActiveUserTracker()

type ChannelCapacitySnapshot struct {
	Allowed      bool
	LimitedBy    string
	Active       int
	UserActive   int
	TotalLimit   int
	PerUserLimit int
}

func BeginChannelActiveUse(channelID int, userID int) func() {
	return activeChannelUsers.begin(channelID, userID)
}

func CheckChannelActiveCapacity(channelID int, userID int, totalLimit int, perUserLimit int) ChannelCapacitySnapshot {
	return activeChannelUsers.check(channelID, userID, totalLimit, perUserLimit)
}

func TryBeginChannelActiveUse(channelID int, userID int, totalLimit int, perUserLimit int) (func(), ChannelCapacitySnapshot) {
	return activeChannelUsers.beginWithLimit(channelID, userID, totalLimit, perUserLimit)
}

func GetChannelActiveUserCounts(channelIDs []int) map[int]int {
	return activeChannelUsers.counts(channelIDs)
}

func GetChannelActiveUserIDs(channelIDs []int) map[int][]int {
	return activeChannelUsers.userIDs(channelIDs)
}

func GetChannelActiveUserSummary() (activeUsers int64, activeChannels int64) {
	return activeChannelUsers.summary()
}

func GetChannelActiveUserSummaryForChannels(channelIDs []int) (activeUsers int64, activeChannels int64) {
	return activeChannelUsers.summaryForChannels(channelIDs)
}

func (t *channelActiveUserTracker) begin(channelID int, userID int) func() {
	release, _ := t.beginWithLimit(channelID, userID, 0, 0)
	return release
}

func (t *channelActiveUserTracker) check(channelID int, userID int, totalLimit int, perUserLimit int) ChannelCapacitySnapshot {
	if channelID <= 0 || userID <= 0 {
		return ChannelCapacitySnapshot{Allowed: true, TotalLimit: totalLimit, PerUserLimit: perUserLimit}
	}
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.capacityLocked(channelID, userID, totalLimit, perUserLimit)
}

func (t *channelActiveUserTracker) beginWithLimit(channelID int, userID int, totalLimit int, perUserLimit int) (func(), ChannelCapacitySnapshot) {
	if channelID <= 0 || userID <= 0 {
		capacity := ChannelCapacitySnapshot{Allowed: true, TotalLimit: totalLimit, PerUserLimit: perUserLimit}
		return func() {}, capacity
	}

	t.mu.Lock()
	if t.usersByChannel == nil {
		t.usersByChannel = make(map[int]map[int]int)
	}
	if t.activeByChannel == nil {
		t.activeByChannel = make(map[int]int)
	}
	capacity := t.capacityLocked(channelID, userID, totalLimit, perUserLimit)
	if !capacity.Allowed {
		t.mu.Unlock()
		return nil, capacity
	}
	userCounts := t.usersByChannel[channelID]
	if userCounts == nil {
		userCounts = make(map[int]int)
		t.usersByChannel[channelID] = userCounts
	}
	userCounts[userID]++
	t.activeByChannel[channelID]++
	t.mu.Unlock()

	var once sync.Once
	return func() {
		once.Do(func() {
			t.end(channelID, userID)
		})
	}, capacity
}

func (t *channelActiveUserTracker) capacityLocked(channelID int, userID int, totalLimit int, perUserLimit int) ChannelCapacitySnapshot {
	active := t.activeByChannel[channelID]
	userActive := t.usersByChannel[channelID][userID]
	result := ChannelCapacitySnapshot{
		Allowed:      true,
		Active:       active,
		UserActive:   userActive,
		TotalLimit:   totalLimit,
		PerUserLimit: perUserLimit,
	}
	if totalLimit > 0 && active >= totalLimit {
		result.Allowed = false
		result.LimitedBy = "channel"
		return result
	}
	if perUserLimit > 0 && userActive >= perUserLimit {
		result.Allowed = false
		result.LimitedBy = "user_channel"
	}
	return result
}

func (t *channelActiveUserTracker) end(channelID int, userID int) {
	t.mu.Lock()
	defer t.mu.Unlock()

	userCounts := t.usersByChannel[channelID]
	if userCounts == nil {
		return
	}
	if t.activeByChannel[channelID] <= 1 {
		delete(t.activeByChannel, channelID)
	} else {
		t.activeByChannel[channelID]--
	}

	count := userCounts[userID]
	if count <= 1 {
		delete(userCounts, userID)
	} else {
		userCounts[userID] = count - 1
	}

	if len(userCounts) == 0 {
		delete(t.usersByChannel, channelID)
	}
}

func (t *channelActiveUserTracker) counts(channelIDs []int) map[int]int {
	t.mu.RLock()
	defer t.mu.RUnlock()

	counts := make(map[int]int, len(channelIDs))
	for _, channelID := range channelIDs {
		counts[channelID] = len(t.usersByChannel[channelID])
	}
	return counts
}

func (t *channelActiveUserTracker) userIDs(channelIDs []int) map[int][]int {
	t.mu.RLock()
	defer t.mu.RUnlock()

	result := make(map[int][]int, len(channelIDs))
	seenChannels := make(map[int]struct{}, len(channelIDs))
	for _, channelID := range channelIDs {
		if _, ok := seenChannels[channelID]; ok {
			continue
		}
		seenChannels[channelID] = struct{}{}

		userCounts := t.usersByChannel[channelID]
		users := make([]int, 0, len(userCounts))
		for userID := range userCounts {
			users = append(users, userID)
		}
		result[channelID] = users
	}
	return result
}

func (t *channelActiveUserTracker) summary() (activeUsers int64, activeChannels int64) {
	t.mu.RLock()
	defer t.mu.RUnlock()

	users := make(map[int]struct{})
	for _, userCounts := range t.usersByChannel {
		if len(userCounts) == 0 {
			continue
		}
		activeChannels++
		for userID := range userCounts {
			users[userID] = struct{}{}
		}
	}

	return int64(len(users)), activeChannels
}

func (t *channelActiveUserTracker) summaryForChannels(channelIDs []int) (activeUsers int64, activeChannels int64) {
	t.mu.RLock()
	defer t.mu.RUnlock()

	users := make(map[int]struct{})
	seenChannels := make(map[int]struct{}, len(channelIDs))
	for _, channelID := range channelIDs {
		if _, ok := seenChannels[channelID]; ok {
			continue
		}
		seenChannels[channelID] = struct{}{}

		userCounts := t.usersByChannel[channelID]
		if len(userCounts) == 0 {
			continue
		}
		activeChannels++
		for userID := range userCounts {
			users[userID] = struct{}{}
		}
	}

	return int64(len(users)), activeChannels
}
