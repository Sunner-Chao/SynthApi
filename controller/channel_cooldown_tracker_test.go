package controller

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestTransientCooldownRequiresDistinctUsers(t *testing.T) {
	tracker := channelTransientFailureTracker{failures: make(map[int]channelTransientFailure)}
	now := time.Now()

	apply, count := tracker.record(1, 20, now)
	require.False(t, apply)
	require.Equal(t, 1, count)
	apply, count = tracker.record(1, 20, now.Add(time.Second))
	require.False(t, apply)
	require.Equal(t, 1, count)
	apply, count = tracker.record(1, 120, now.Add(2*time.Second))
	require.False(t, apply)
	require.Equal(t, 2, count)
	apply, count = tracker.record(1, 150, now.Add(3*time.Second))
	require.True(t, apply)
	require.Equal(t, transientCooldownUserQuorum, count)
}

func TestTransientCooldownWindowAndSuccessReset(t *testing.T) {
	tracker := channelTransientFailureTracker{failures: make(map[int]channelTransientFailure)}
	now := time.Now()

	apply, count := tracker.record(1, 20, now)
	require.False(t, apply)
	require.Equal(t, 1, count)
	apply, count = tracker.record(1, 120, now.Add(transientCooldownWindow+time.Second))
	require.False(t, apply)
	require.Equal(t, 1, count)

	tracker.clear(1)
	apply, count = tracker.record(1, 150, now.Add(transientCooldownWindow+2*time.Second))
	require.False(t, apply)
	require.Equal(t, 1, count)
}

func TestSharedCooldownQuorumIncludesUserSpecificUpstreamClasses(t *testing.T) {
	for _, class := range []string{"auth", "rate_limit", "channel_runtime", "channel", "automatic_disable"} {
		require.True(t, isTransientCooldownClass(class), class)
	}
	require.False(t, isTransientCooldownClass("credential"))
}
