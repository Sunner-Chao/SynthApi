package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
)

func TestAdjustedChannelSelectionWeightPenalizesCurrentLoad(t *testing.T) {
	channel := testCachedChannel(652, 10, 100)
	channel.SetSetting(dto.ChannelSettings{MaxConcurrency: 10})

	idle := adjustedChannelSelectionWeight(channel, 100, nil, nil, 0)
	loaded := adjustedChannelSelectionWeight(channel, 100, nil, nil, 8)
	if loaded >= idle {
		t.Fatalf("loaded channel weight must be lower: idle=%d loaded=%d", idle, loaded)
	}
	if loaded != 20 {
		t.Fatalf("expected remaining-capacity weight 20, got %d", loaded)
	}
}

func TestChannelRuntimePerfP90PenalizesTailLatency(t *testing.T) {
	perf := &channelRuntimePerf{}
	for _, sample := range []int64{1000, 1100, 1200, 1300, 1400, 1500, 20000, 25000} {
		perf.ttftSamples[perf.ttftNext] = sample
		perf.ttftNext = (perf.ttftNext + 1) % channelRuntimeTTFTWindow
		perf.ttftCount++
	}
	if got := perf.ttftP90Locked(); got != 25000 {
		t.Fatalf("expected p90 tail sample 25000, got %d", got)
	}
}

func TestChannelSelectionUsesUnusedEqualPriorityBeforeLowerPriority(t *testing.T) {
	first := testCachedChannel(701, 10, 100)
	second := testCachedChannel(702, 10, 100)
	lower := testCachedChannel(703, 5, 100)
	cleanup := setupChannelCacheTestState(t, map[int]*Channel{
		first.Id:  first,
		second.Id: second,
		lower.Id:  lower,
	}, []int{first.Id, second.Id, lower.Id})
	defer cleanup()

	selected, err := GetRandomSatisfiedChannelExcluding("group-a", "gpt-test", 0, nil)
	if err != nil {
		t.Fatalf("initial selection failed: %v", err)
	}
	if selected == nil || (selected.Id != first.Id && selected.Id != second.Id) {
		t.Fatalf("expected an equal-priority channel, got %#v", selected)
	}

	secondAttempt, err := GetRandomSatisfiedChannelExcluding("group-a", "gpt-test", 1, map[int]struct{}{selected.Id: {}})
	if err != nil {
		t.Fatalf("equal-priority retry failed: %v", err)
	}
	if secondAttempt == nil || secondAttempt.Id == selected.Id || secondAttempt.Id == lower.Id {
		t.Fatalf("expected the other equal-priority channel, got %#v", secondAttempt)
	}

	thirdAttempt, err := GetRandomSatisfiedChannelExcluding("group-a", "gpt-test", 2, map[int]struct{}{first.Id: {}, second.Id: {}})
	if err != nil {
		t.Fatalf("lower-priority retry failed: %v", err)
	}
	if thirdAttempt == nil || thirdAttempt.Id != lower.Id {
		t.Fatalf("expected lower-priority fallback, got %#v", thirdAttempt)
	}
}

func setupChannelCacheTestState(t *testing.T, channels map[int]*Channel, channelIDs []int) func() {
	t.Helper()

	oldMemoryCacheEnabled := common.MemoryCacheEnabled
	oldGroup2Model2Channels := group2model2channels
	oldChannelsIDM := channelsIDM

	common.MemoryCacheEnabled = true
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
