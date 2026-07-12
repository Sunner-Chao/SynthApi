package service

import "sync"

type channelActiveUserTracker struct {
	mu             sync.RWMutex
	usersByChannel map[int]map[int]int
}

func newChannelActiveUserTracker() *channelActiveUserTracker {
	return &channelActiveUserTracker{
		usersByChannel: make(map[int]map[int]int),
	}
}

var activeChannelUsers = newChannelActiveUserTracker()

func BeginChannelActiveUse(channelID int, userID int) func() {
	return activeChannelUsers.begin(channelID, userID)
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
	if channelID <= 0 || userID <= 0 {
		return func() {}
	}

	t.mu.Lock()
	userCounts := t.usersByChannel[channelID]
	if userCounts == nil {
		userCounts = make(map[int]int)
		t.usersByChannel[channelID] = userCounts
	}
	userCounts[userID]++
	t.mu.Unlock()

	var once sync.Once
	return func() {
		once.Do(func() {
			t.end(channelID, userID)
		})
	}
}

func (t *channelActiveUserTracker) end(channelID int, userID int) {
	t.mu.Lock()
	defer t.mu.Unlock()

	userCounts := t.usersByChannel[channelID]
	if userCounts == nil {
		return
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
