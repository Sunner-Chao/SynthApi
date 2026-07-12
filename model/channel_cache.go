package model

import (
	"errors"
	"fmt"
	"math/rand"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

var group2model2channels map[string]map[string][]int // enabled channel
var channelsIDM map[int]*Channel                     // all channels include disabled
var channelSyncLock sync.RWMutex

const (
	channelLatencyNoPenaltyMs = 3000
	channelLatencyModerateMs  = 8000
	channelLatencyHighMs      = 15000
)

func InitChannelCache() {
	if !common.MemoryCacheEnabled {
		return
	}
	newChannelId2channel := make(map[int]*Channel)
	var channels []*Channel
	DB.Find(&channels)
	for _, channel := range channels {
		newChannelId2channel[channel.Id] = channel
	}
	var abilities []*Ability
	DB.Find(&abilities)
	groups := make(map[string]bool)
	for _, ability := range abilities {
		groups[ability.Group] = true
	}
	newGroup2model2channels := make(map[string]map[string][]int)
	for group := range groups {
		newGroup2model2channels[group] = make(map[string][]int)
	}
	for _, channel := range channels {
		if channel.Status != common.ChannelStatusEnabled {
			continue // skip disabled channels
		}
		groups := strings.Split(channel.Group, ",")
		for _, group := range groups {
			group = strings.TrimSpace(group)
			if group == "" {
				continue
			}
			if _, ok := newGroup2model2channels[group]; !ok {
				newGroup2model2channels[group] = make(map[string][]int)
			}
			models := strings.Split(channel.Models, ",")
			for _, model := range models {
				model = strings.TrimSpace(model)
				if model == "" {
					continue
				}
				if _, ok := newGroup2model2channels[group][model]; !ok {
					newGroup2model2channels[group][model] = make([]int, 0)
				}
				newGroup2model2channels[group][model] = append(newGroup2model2channels[group][model], channel.Id)
			}
		}
	}

	// sort by priority
	for group, model2channels := range newGroup2model2channels {
		for model, channels := range model2channels {
			sort.Slice(channels, func(i, j int) bool {
				return newChannelId2channel[channels[i]].GetPriority() > newChannelId2channel[channels[j]].GetPriority()
			})
			newGroup2model2channels[group][model] = channels
		}
	}

	channelSyncLock.Lock()
	group2model2channels = newGroup2model2channels
	//channelsIDM = newChannelId2channel
	for i, channel := range newChannelId2channel {
		if channel.ChannelInfo.IsMultiKey {
			channel.Keys = channel.GetKeys()
			if channel.ChannelInfo.MultiKeyMode == constant.MultiKeyModePolling {
				if oldChannel, ok := channelsIDM[i]; ok {
					// 存在旧的渠道，如果是多key且轮询，保留轮询索引信息
					if oldChannel.ChannelInfo.IsMultiKey && oldChannel.ChannelInfo.MultiKeyMode == constant.MultiKeyModePolling {
						channel.ChannelInfo.MultiKeyPollingIndex = oldChannel.ChannelInfo.MultiKeyPollingIndex
					}
				}
			}
		}
	}
	channelsIDM = newChannelId2channel
	channelSyncLock.Unlock()
	common.SysLog("channels synced from database")
}

func SyncChannelCache(frequency int) {
	for {
		time.Sleep(time.Duration(frequency) * time.Second)
		common.SysLog("syncing channels from database")
		InitChannelCache()
	}
}

func GetRandomSatisfiedChannel(group string, model string, retry int) (*Channel, error) {
	return GetRandomSatisfiedChannelExcluding(group, model, retry, nil)
}

func GetRandomSatisfiedChannelExcluding(group string, model string, retry int, excludeIDs map[int]struct{}) (*Channel, error) {
	// if memory cache is disabled, get channel directly from database
	if !common.MemoryCacheEnabled {
		if len(excludeIDs) > 0 {
			return getChannelExcludingDB(group, model, retry, excludeIDs)
		}
		return GetChannel(group, model, retry)
	}

	logPerfHints := channelLogSelectionHints(model, group)
	channelPerfHints := channelPerfSelectionHints(model, group)

	channelSyncLock.RLock()
	defer channelSyncLock.RUnlock()

	// First, try to find channels with the exact model name.
	channels := group2model2channels[group][model]

	// If no channels found, try to find channels with the normalized model name.
	if len(channels) == 0 {
		normalizedModel := ratio_setting.FormatMatchingModelName(model)
		channels = group2model2channels[group][normalizedModel]
	}

	if len(channels) == 0 {
		return nil, nil
	}

	channels = filterExcludedChannelIDs(channels, excludeIDs)
	if len(channels) == 0 {
		return nil, nil
	}

	uniquePriorities := make(map[int]bool)
	for _, channelId := range channels {
		if channel, ok := channelsIDM[channelId]; ok {
			uniquePriorities[int(channel.GetPriority())] = true
		} else {
			return nil, fmt.Errorf("数据库一致性错误，渠道# %d 不存在，请联系管理员修复", channelId)
		}
	}
	var sortedUniquePriorities []int
	for priority := range uniquePriorities {
		sortedUniquePriorities = append(sortedUniquePriorities, priority)
	}
	sort.Sort(sort.Reverse(sort.IntSlice(sortedUniquePriorities)))

	if retry >= len(uniquePriorities) {
		retry = len(uniquePriorities) - 1
	}
	targetPriorityIndex := retry
	targetPriority := int64(sortedUniquePriorities[targetPriorityIndex])

	targetChannels, err := getChannelsByPriority(channels, targetPriority)
	if err != nil {
		return nil, err
	}
	if len(targetChannels) == 0 {
		return nil, errors.New(fmt.Sprintf("no channel found, group: %s, model: %s, priority: %d", group, model, targetPriority))
	}
	targetChannels = preferNonCoolingChannels(targetChannels, channels, sortedUniquePriorities, targetPriorityIndex)
	if len(targetChannels) == 0 {
		return nil, nil
	}

	var sumWeight = 0
	for _, channel := range targetChannels {
		sumWeight += channel.GetWeight()
	}

	// smoothing factor and adjustment
	smoothingFactor := 1
	smoothingAdjustment := 0

	if sumWeight == 0 {
		// when all channels have weight 0, set sumWeight to the number of channels and set smoothing adjustment to 100
		// each channel's effective weight = 100
		sumWeight = len(targetChannels) * 100
		smoothingAdjustment = 100
	} else if sumWeight/len(targetChannels) < 10 {
		// when the average weight is less than 10, set smoothing factor to 100
		smoothingFactor = 100
	}

	weightedChannels := make([]weightedChannel, 0, len(targetChannels))
	totalWeight := 0
	for _, channel := range targetChannels {
		baseWeight := channel.GetWeight()*smoothingFactor + smoothingAdjustment
		effectiveWeight := adjustedChannelSelectionWeight(channel, baseWeight, logPerfHints, channelPerfHints)
		if effectiveWeight <= 0 {
			continue
		}
		totalWeight += effectiveWeight
		weightedChannels = append(weightedChannels, weightedChannel{
			channel: channel,
			weight:  effectiveWeight,
		})
	}
	if totalWeight <= 0 {
		return nil, errors.New("channel not found")
	}

	// Generate a random value in the range [0, totalWeight)
	randomWeight := rand.Intn(totalWeight)

	// Find a channel based on its weight
	for _, candidate := range weightedChannels {
		randomWeight -= candidate.weight
		if randomWeight < 0 {
			return candidate.channel, nil
		}
	}
	// return null if no channel is not found
	return nil, errors.New("channel not found")
}

type weightedChannel struct {
	channel *Channel
	weight  int
}

func adjustedChannelSelectionWeight(channel *Channel, baseWeight int, logPerfHints map[int]ChannelLogLatencyHint, channelPerfHints map[int]ChannelPerfRouteHint) int {
	if channel == nil || baseWeight <= 0 {
		return 0
	}
	percent := channelResponseTimeWeightPercent(channel.ResponseTime)
	runtimePercent := channelRuntimeSelectionWeightPercent(channel.Id)
	if runtimePercent < percent {
		percent = runtimePercent
	}
	if hint, ok := logPerfHints[channel.Id]; ok && hint.SelectionWeightPct > 0 && hint.SelectionWeightPct < percent {
		percent = hint.SelectionWeightPct
	}
	if hint, ok := channelPerfHints[channel.Id]; ok && hint.SelectionWeightPct > 0 && hint.SelectionWeightPct < percent {
		percent = hint.SelectionWeightPct
	}
	adjusted := baseWeight * percent / 100
	if adjusted <= 0 {
		return 1
	}
	return adjusted
}

func getChannelsByPriority(channelIDs []int, targetPriority int64) ([]*Channel, error) {
	targetChannels := make([]*Channel, 0)
	for _, channelId := range channelIDs {
		channel, ok := channelsIDM[channelId]
		if !ok {
			return nil, fmt.Errorf("数据库一致性错误，渠道# %d 不存在，请联系管理员修复", channelId)
		}
		if channel.GetPriority() == targetPriority {
			targetChannels = append(targetChannels, channel)
		}
	}
	return targetChannels, nil
}

func preferNonCoolingChannels(targetChannels []*Channel, allChannelIDs []int, sortedPriorities []int, targetPriorityIndex int) []*Channel {
	if len(targetChannels) == 0 {
		return targetChannels
	}
	if ready := filterCoolingChannels(targetChannels); len(ready) > 0 {
		return ready
	}

	for i := targetPriorityIndex + 1; i < len(sortedPriorities); i++ {
		lowerPriorityChannels, err := getChannelsByPriority(allChannelIDs, int64(sortedPriorities[i]))
		if err != nil {
			return targetChannels
		}
		if ready := filterCoolingChannels(lowerPriorityChannels); len(ready) > 0 {
			return ready
		}
	}
	return nil
}

func filterCoolingChannels(channels []*Channel) []*Channel {
	if len(channels) == 0 {
		return nil
	}
	ready := make([]*Channel, 0, len(channels))
	for _, channel := range channels {
		if channel == nil || IsChannelCoolingDown(channel.Id) {
			continue
		}
		ready = append(ready, channel)
	}
	return ready
}

func channelResponseTimeWeightPercent(responseTimeMs int) int {
	if responseTimeMs <= 0 || responseTimeMs <= channelLatencyNoPenaltyMs {
		return 100
	}
	if responseTimeMs <= channelLatencyModerateMs {
		return interpolatePercent(responseTimeMs, channelLatencyNoPenaltyMs, channelLatencyModerateMs, 100, 60)
	}
	if responseTimeMs <= channelLatencyHighMs {
		return interpolatePercent(responseTimeMs, channelLatencyModerateMs, channelLatencyHighMs, 60, 25)
	}
	return 15
}

func interpolatePercent(value int, start int, end int, startPercent int, endPercent int) int {
	if value <= start {
		return startPercent
	}
	if value >= end || end <= start {
		return endPercent
	}
	delta := startPercent - endPercent
	return startPercent - delta*(value-start)/(end-start)
}

func filterExcludedChannelIDs(channels []int, excludeIDs map[int]struct{}) []int {
	if len(channels) == 0 || len(excludeIDs) == 0 {
		return channels
	}
	filtered := make([]int, 0, len(channels))
	for _, channelID := range channels {
		if _, excluded := excludeIDs[channelID]; excluded {
			continue
		}
		filtered = append(filtered, channelID)
	}
	return filtered
}

func CacheGetChannel(id int) (*Channel, error) {
	if !common.MemoryCacheEnabled {
		return GetChannelById(id, true)
	}
	channelSyncLock.RLock()
	defer channelSyncLock.RUnlock()

	c, ok := channelsIDM[id]
	if !ok {
		return nil, fmt.Errorf("渠道# %d，已不存在", id)
	}
	return c, nil
}

func CacheGetChannelInfo(id int) (*ChannelInfo, error) {
	if !common.MemoryCacheEnabled {
		channel, err := GetChannelById(id, true)
		if err != nil {
			return nil, err
		}
		return &channel.ChannelInfo, nil
	}
	channelSyncLock.RLock()
	defer channelSyncLock.RUnlock()

	c, ok := channelsIDM[id]
	if !ok {
		return nil, fmt.Errorf("渠道# %d，已不存在", id)
	}
	return &c.ChannelInfo, nil
}

func CacheUpdateChannelStatus(id int, status int) {
	if !common.MemoryCacheEnabled {
		return
	}
	channelSyncLock.Lock()
	defer channelSyncLock.Unlock()
	if channel, ok := channelsIDM[id]; ok {
		channel.Status = status
	}
	if status != common.ChannelStatusEnabled {
		// delete the channel from group2model2channels
		for group, model2channels := range group2model2channels {
			for model, channels := range model2channels {
				for i, channelId := range channels {
					if channelId == id {
						// remove the channel from the slice
						group2model2channels[group][model] = append(channels[:i], channels[i+1:]...)
						break
					}
				}
			}
		}
	}
}

func CacheUpdateChannel(channel *Channel) {
	if !common.MemoryCacheEnabled {
		return
	}
	channelSyncLock.Lock()
	defer channelSyncLock.Unlock()
	if channel == nil {
		return
	}

	if channelsIDM == nil {
		channelsIDM = make(map[int]*Channel)
	}
	if oldChannel, ok := channelsIDM[channel.Id]; ok {
		logger.LogDebug(nil, "CacheUpdateChannel before: id=%d, name=%s, status=%d, polling_index=%d", channel.Id, channel.Name, channel.Status, oldChannel.ChannelInfo.MultiKeyPollingIndex)
	}
	channelsIDM[channel.Id] = channel
	logger.LogDebug(nil, "CacheUpdateChannel after: id=%d, name=%s, status=%d, polling_index=%d", channel.Id, channel.Name, channel.Status, channel.ChannelInfo.MultiKeyPollingIndex)
}
