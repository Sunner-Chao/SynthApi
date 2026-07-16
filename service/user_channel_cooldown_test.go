package service

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestUserChannelCooldownBacksOffAndIsolatesUsers(t *testing.T) {
	tracker := userChannelCooldownTracker{entries: make(map[userChannelCooldownKey]userChannelCooldownEntry)}
	now := time.Now()

	require.Equal(t, 90*time.Second, tracker.record(20, 652, 90*time.Second, now))
	require.True(t, tracker.isCoolingDown(20, 652, now.Add(time.Minute)))
	require.False(t, tracker.isCoolingDown(21, 652, now.Add(time.Minute)))

	require.Equal(t, 3*time.Minute, tracker.record(20, 652, 90*time.Second, now.Add(time.Minute)))
	require.Equal(t, 6*time.Minute, tracker.record(20, 652, 90*time.Second, now.Add(2*time.Minute)))
	require.Equal(t, 12*time.Minute, tracker.record(20, 652, 90*time.Second, now.Add(3*time.Minute)))
	require.Equal(t, userChannelCooldownMaximum, tracker.record(20, 652, 90*time.Second, now.Add(4*time.Minute)))
}

func TestUserChannelCooldownExclusionsClearAndReset(t *testing.T) {
	tracker := userChannelCooldownTracker{entries: make(map[userChannelCooldownKey]userChannelCooldownEntry)}
	now := time.Now()

	tracker.record(20, 652, time.Minute, now)
	tracker.record(20, 171, time.Minute, now)
	tracker.record(21, 19, time.Minute, now)
	require.Equal(t, map[int]struct{}{171: {}, 652: {}}, tracker.excludedIDs(20, now.Add(30*time.Second)))

	tracker.clear(20, 652)
	require.Equal(t, map[int]struct{}{171: {}}, tracker.excludedIDs(20, now.Add(30*time.Second)))
	require.Empty(t, tracker.excludedIDs(20, now.Add(userChannelFailureResetWindow+time.Second)))
	require.Equal(t, time.Minute, tracker.record(20, 171, time.Minute, now.Add(userChannelFailureResetWindow+2*time.Second)))
}

func TestUserChannelCooldownUsesMinimumDuration(t *testing.T) {
	tracker := userChannelCooldownTracker{entries: make(map[userChannelCooldownKey]userChannelCooldownEntry)}
	require.Equal(t, userChannelCooldownMinimum, tracker.record(20, 652, time.Second, time.Now()))
	require.Zero(t, tracker.record(0, 652, time.Minute, time.Now()))
}
