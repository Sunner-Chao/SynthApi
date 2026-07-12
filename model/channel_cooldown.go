package model

import (
	"strings"
	"sync"
	"time"
)

type channelCooldown struct {
	until  time.Time
	reason string
}

var channelCooldowns sync.Map

func MarkChannelCooldown(channelID int, duration time.Duration, reason string) {
	if channelID <= 0 || duration <= 0 {
		return
	}
	reason = strings.TrimSpace(reason)
	until := time.Now().Add(duration)
	if actual, ok := channelCooldowns.Load(channelID); ok {
		current := actual.(channelCooldown)
		if current.until.After(until) {
			return
		}
	}
	channelCooldowns.Store(channelID, channelCooldown{
		until:  until,
		reason: reason,
	})
}

func ChannelCooldownRemaining(channelID int) time.Duration {
	if channelID <= 0 {
		return 0
	}
	actual, ok := channelCooldowns.Load(channelID)
	if !ok {
		return 0
	}
	cooldown := actual.(channelCooldown)
	remaining := time.Until(cooldown.until)
	if remaining <= 0 {
		channelCooldowns.Delete(channelID)
		return 0
	}
	return remaining
}

func IsChannelCoolingDown(channelID int) bool {
	return ChannelCooldownRemaining(channelID) > 0
}
