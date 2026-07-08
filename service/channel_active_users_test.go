package service

import (
	"reflect"
	"testing"
)

func TestChannelActiveUserTrackerRefCountsUsersPerChannel(t *testing.T) {
	tracker := newChannelActiveUserTracker()

	endFirst := tracker.begin(10, 100)
	endSecond := tracker.begin(10, 100)
	endOtherUser := tracker.begin(10, 200)

	assertEqual(t, map[int]int{10: 2, 11: 0}, tracker.counts([]int{10, 11}))

	endFirst()
	endFirst()
	assertEqual(t, map[int]int{10: 2}, tracker.counts([]int{10}))

	endSecond()
	assertEqual(t, map[int]int{10: 1}, tracker.counts([]int{10}))

	endOtherUser()
	assertEqual(t, map[int]int{10: 0}, tracker.counts([]int{10}))
}

func TestChannelActiveUserTrackerSummaryDeduplicatesUsers(t *testing.T) {
	tracker := newChannelActiveUserTracker()

	endChannelOne := tracker.begin(1, 100)
	endChannelTwoSameUser := tracker.begin(2, 100)
	endChannelTwoOtherUser := tracker.begin(2, 200)

	activeUsers, activeChannels := tracker.summary()
	assertEqual(t, int64(2), activeUsers)
	assertEqual(t, int64(2), activeChannels)

	endChannelOne()
	activeUsers, activeChannels = tracker.summary()
	assertEqual(t, int64(2), activeUsers)
	assertEqual(t, int64(1), activeChannels)

	endChannelTwoSameUser()
	endChannelTwoOtherUser()
	activeUsers, activeChannels = tracker.summary()
	assertEqual(t, int64(0), activeUsers)
	assertEqual(t, int64(0), activeChannels)
}

func TestChannelActiveUserTrackerIgnoresInvalidInput(t *testing.T) {
	tracker := newChannelActiveUserTracker()

	tracker.begin(0, 100)()
	tracker.begin(10, 0)()

	activeUsers, activeChannels := tracker.summary()
	assertEqual(t, int64(0), activeUsers)
	assertEqual(t, int64(0), activeChannels)
	assertEqual(t, map[int]int{10: 0}, tracker.counts([]int{10}))
}

func assertEqual[T any](t *testing.T, expected T, actual T) {
	t.Helper()
	if !reflect.DeepEqual(expected, actual) {
		t.Fatalf("expected %#v, got %#v", expected, actual)
	}
}
