package model

import (
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
)

func TestGetRandomSatisfiedChannelSkipsSingleCoolingChannel(t *testing.T) {
	restore := setupChannelCacheTestState(t, map[int]*Channel{
		1: testCachedChannel(1, 10, 100),
	}, []int{1})
	defer restore()

	MarkChannelCooldown(1, time.Minute, "test")

	channel, err := GetRandomSatisfiedChannelExcluding("group-a", "gpt-test", 0, nil)
	if err != nil {
		t.Fatalf("GetRandomSatisfiedChannelExcluding returned error: %v", err)
	}
	if channel != nil {
		t.Fatalf("expected no selectable channel while the only channel is cooling, got #%d", channel.Id)
	}
}

func TestGetRandomSatisfiedChannelFallsBackToLowerPriorityWhenTopPriorityCooling(t *testing.T) {
	restore := setupChannelCacheTestState(t, map[int]*Channel{
		1: testCachedChannel(1, 10, 100),
		2: testCachedChannel(2, 5, 100),
	}, []int{1, 2})
	defer restore()

	MarkChannelCooldown(1, time.Minute, "test")

	channel, err := GetRandomSatisfiedChannelExcluding("group-a", "gpt-test", 0, nil)
	if err != nil {
		t.Fatalf("GetRandomSatisfiedChannelExcluding returned error: %v", err)
	}
	if channel == nil || channel.Id != 2 {
		t.Fatalf("expected lower-priority ready channel #2, got %#v", channel)
	}
}

func TestGetRandomSatisfiedChannelReturnsNilWhenAllCandidatesCooling(t *testing.T) {
	restore := setupChannelCacheTestState(t, map[int]*Channel{
		1: testCachedChannel(1, 10, 100),
		2: testCachedChannel(2, 5, 100),
	}, []int{1, 2})
	defer restore()

	MarkChannelCooldown(1, time.Minute, "test")
	MarkChannelCooldown(2, time.Minute, "test")

	channel, err := GetRandomSatisfiedChannelExcluding("group-a", "gpt-test", 0, nil)
	if err != nil {
		t.Fatalf("GetRandomSatisfiedChannelExcluding returned error: %v", err)
	}
	if channel != nil {
		t.Fatalf("expected no selectable channel while all channels are cooling, got #%d", channel.Id)
	}
}

func setupChannelCacheTestState(t *testing.T, channels map[int]*Channel, channelIDs []int) func() {
	t.Helper()

	oldMemoryCacheEnabled := common.MemoryCacheEnabled
	oldGroup2Model2Channels := group2model2channels
	oldChannelsIDM := channelsIDM
	oldCooldowns := channelCooldowns

	common.MemoryCacheEnabled = true
	channelCooldowns = sync.Map{}
	channelsIDM = channels
	group2model2channels = map[string]map[string][]int{
		"group-a": {
			"gpt-test": channelIDs,
		},
	}

	return func() {
		common.MemoryCacheEnabled = oldMemoryCacheEnabled
		group2model2channels = oldGroup2Model2Channels
		channelsIDM = oldChannelsIDM
		channelCooldowns = oldCooldowns
	}
}

func testCachedChannel(id int, priority int64, weight uint) *Channel {
	return &Channel{
		Id:       id,
		Priority: &priority,
		Weight:   &weight,
		Status:   common.ChannelStatusEnabled,
	}
}
