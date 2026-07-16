package service

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

const channelSelectionRequestExcludedKey = "channel_selection_request_excluded_ids"
const channelCapacityRequestExcludedKey = "channel_capacity_request_excluded_ids"

var ErrAllChannelsAtCapacity = errors.New("all eligible channels are at concurrency capacity")

func ModelRequestBodySize(c *gin.Context) int64 {
	if c == nil || c.Request == nil {
		return 0
	}
	if value, exists := c.Get(common.KeyBodyStorage); exists {
		if storage, ok := value.(common.BodyStorage); ok && storage != nil {
			return storage.Size()
		}
	}
	if c.Request.ContentLength > 0 {
		return c.Request.ContentLength
	}
	return 0
}

func IsLargeModelRequest(c *gin.Context) bool {
	thresholdMB := common.ModelRequestLargeBodyThresholdMB
	return thresholdMB > 0 && ModelRequestBodySize(c) > int64(thresholdMB)<<20
}

func CheckChannelRequestCapacity(c *gin.Context, channel *model.Channel) ChannelCapacitySnapshot {
	if channel == nil {
		return ChannelCapacitySnapshot{Allowed: false, LimitedBy: "channel"}
	}
	settings := channel.GetSetting()
	return CheckChannelActiveCapacity(
		channel.Id,
		c.GetInt("id"),
		settings.EffectiveMaxConcurrency(common.ModelRequestDefaultChannelMaxConcurrency),
		settings.EffectiveMaxConcurrencyPerUser(common.ModelRequestDefaultChannelMaxConcurrencyPerUser),
	)
}

func MarkChannelSelectionExcluded(c *gin.Context, channelID int) {
	if c == nil || channelID <= 0 {
		return
	}
	excluded := requestChannelSelectionExcludedIDs(c)
	if excluded == nil {
		excluded = make(map[int]struct{})
		c.Set(channelSelectionRequestExcludedKey, excluded)
	}
	excluded[channelID] = struct{}{}
}

func MarkChannelCapacityExcluded(c *gin.Context, channelID int) {
	MarkChannelSelectionExcluded(c, channelID)
	if c == nil || channelID <= 0 {
		return
	}
	excluded := requestChannelCapacityExcludedIDs(c)
	if excluded == nil {
		excluded = make(map[int]struct{})
		c.Set(channelCapacityRequestExcludedKey, excluded)
	}
	excluded[channelID] = struct{}{}
}

func HasChannelCapacityExclusions(c *gin.Context) bool {
	return len(requestChannelCapacityExcludedIDs(c)) > 0
}

func IsChannelSelectionExcluded(c *gin.Context, channelID int) bool {
	if channelID <= 0 {
		return false
	}
	_, excluded := requestChannelSelectionExcludedIDs(c)[channelID]
	return excluded
}

func requestChannelSelectionExcludedIDs(c *gin.Context) map[int]struct{} {
	if c == nil {
		return nil
	}
	value, exists := c.Get(channelSelectionRequestExcludedKey)
	if !exists {
		return nil
	}
	excluded, _ := value.(map[int]struct{})
	return excluded
}

func requestChannelCapacityExcludedIDs(c *gin.Context) map[int]struct{} {
	if c == nil {
		return nil
	}
	value, exists := c.Get(channelCapacityRequestExcludedKey)
	if !exists {
		return nil
	}
	excluded, _ := value.(map[int]struct{})
	return excluded
}

func selectRequestChannel(c *gin.Context, group string, modelName string, retry int) (*model.Channel, error) {
	if IsLargeModelRequest(c) {
		channel, err := selectRequestChannelWithPreference(c, group, modelName, retry, true)
		if err == nil && channel != nil {
			return channel, nil
		}
	}
	return selectRequestChannelWithPreference(c, group, modelName, retry, false)
}

func selectRequestChannelWithPreference(c *gin.Context, group string, modelName string, retry int, requireLargeEligible bool) (*model.Channel, error) {
	excluded := channelSelectionExcludedIDs(c)
	for checked := 0; checked < 100; checked++ {
		channel, err := model.GetRandomSatisfiedChannelExcluding(group, modelName, retry, excluded)
		if err != nil {
			return channel, err
		}
		if channel == nil {
			if !requireLargeEligible && HasChannelCapacityExclusions(c) {
				return nil, ErrAllChannelsAtCapacity
			}
			return nil, nil
		}
		if requireLargeEligible && !channel.GetSetting().LargeRequestEligible {
			if excluded == nil {
				excluded = make(map[int]struct{})
			}
			excluded[channel.Id] = struct{}{}
			continue
		}
		capacity := CheckChannelRequestCapacity(c, channel)
		if capacity.Allowed {
			return channel, nil
		}
		MarkChannelCapacityExcluded(c, channel.Id)
		if excluded == nil {
			excluded = make(map[int]struct{})
		}
		excluded[channel.Id] = struct{}{}
	}
	if !requireLargeEligible && HasChannelCapacityExclusions(c) {
		return nil, ErrAllChannelsAtCapacity
	}
	return nil, nil
}
