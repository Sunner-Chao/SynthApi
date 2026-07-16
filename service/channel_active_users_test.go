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

func TestChannelActiveUserTrackerEnforcesChannelLimit(t *testing.T) {
	tracker := newChannelActiveUserTracker()

	first, capacity := tracker.beginWithLimit(171, 20, 1, 0)
	if !capacity.Allowed || first == nil {
		t.Fatal("first request should be admitted")
	}
	second, capacity := tracker.beginWithLimit(171, 21, 1, 0)
	if capacity.Allowed || second != nil {
		t.Fatal("second request should be rejected at the channel limit")
	}
	assertEqual(t, "channel", capacity.LimitedBy)

	first()
	third, capacity := tracker.beginWithLimit(171, 21, 1, 0)
	if !capacity.Allowed || third == nil {
		t.Fatal("request should be admitted after a slot is released")
	}
	third()
}

func TestChannelActiveUserTrackerEnforcesPerUserChannelLimit(t *testing.T) {
	tracker := newChannelActiveUserTracker()

	first, capacity := tracker.beginWithLimit(171, 20, 10, 1)
	if !capacity.Allowed || first == nil {
		t.Fatal("first request should be admitted")
	}
	second, capacity := tracker.beginWithLimit(171, 20, 10, 1)
	if capacity.Allowed || second != nil {
		t.Fatal("same user should be rejected at the per-user channel limit")
	}
	assertEqual(t, "user_channel", capacity.LimitedBy)
	assertEqual(t, 1, capacity.Active)
	assertEqual(t, 1, capacity.UserActive)

	otherUser, capacity := tracker.beginWithLimit(171, 21, 10, 1)
	if !capacity.Allowed || otherUser == nil {
		t.Fatal("another user should still be admitted")
	}
	first()
	otherUser()
}

func assertEqual[T any](t *testing.T, expected T, actual T) {
	t.Helper()
	if !reflect.DeepEqual(expected, actual) {
		t.Fatalf("expected %#v, got %#v", expected, actual)
	}
}
