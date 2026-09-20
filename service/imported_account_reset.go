package service

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/model"
)

const (
	importedAccountResetCountKey = "reset_count"
	importedAccountLastResetKey  = "last_reset_at"
)

// ImportedAccountResetState is local monitor metadata. The upstream provider
// controls its own quota windows and does not expose a force-reset API.
type ImportedAccountResetState struct {
	Count       int64 `json:"reset_count"`
	LastResetAt int64 `json:"last_reset_at,omitempty"`
}

func importedAccountInt64(value any) int64 {
	switch typed := value.(type) {
	case int:
		return int64(typed)
	case int64:
		return typed
	case int32:
		return int64(typed)
	case uint:
		return int64(typed)
	case uint64:
		return int64(typed)
	case float64:
		return int64(typed)
	case string:
		parsed, err := strconv.ParseInt(strings.TrimSpace(typed), 10, 64)
		if err == nil {
			return parsed
		}
	}
	return 0
}

// GetImportedAccountResetState reads the local reset counter without exposing
// channel credentials.
func GetImportedAccountResetState(channel *model.Channel) ImportedAccountResetState {
	if channel == nil || !IsImportedAccountChannel(channel) {
		return ImportedAccountResetState{}
	}
	monitor := channel.GetOtherSettings().ImportedAccountMonitor
	if len(monitor) == 0 {
		return ImportedAccountResetState{}
	}
	count := importedAccountInt64(monitor[importedAccountResetCountKey])
	if count < 0 {
		count = 0
	}
	lastResetAt := importedAccountInt64(monitor[importedAccountLastResetKey])
	if lastResetAt < 0 {
		lastResetAt = 0
	}
	return ImportedAccountResetState{Count: count, LastResetAt: lastResetAt}
}

// ResetImportedAccountMonitor clears only local health/quota display state and
// increments its audit counter. It never changes used_quota or upstream data.
func ResetImportedAccountMonitor(channelID int) (*model.Channel, ImportedAccountResetState, error) {
	channel, err := model.GetChannelById(channelID, true)
	if err != nil {
		return nil, ImportedAccountResetState{}, err
	}
	if channel == nil {
		return nil, ImportedAccountResetState{}, fmt.Errorf("channel not found")
	}
	if !IsImportedAccountChannel(channel) {
		return nil, ImportedAccountResetState{}, fmt.Errorf("channel is not an imported account channel")
	}

	settings := channel.GetOtherSettings()
	monitor := settings.ImportedAccountMonitor
	if monitor == nil {
		monitor = make(map[string]any)
	}
	state := GetImportedAccountResetState(channel)
	state.Count++
	state.LastResetAt = time.Now().Unix()

	monitor[importedAccountResetCountKey] = state.Count
	monitor[importedAccountLastResetKey] = state.LastResetAt
	monitor["checked_at"] = 0
	monitor["quota_status"] = "pending"
	monitor["quota_message"] = ""
	monitor["channel_status"] = "pending"
	monitor["channel_message"] = ""
	monitor["response_time"] = 0
	settings.ImportedAccountMonitor = monitor
	channel.SetOtherSettings(settings)

	if err := model.DB.Model(&model.Channel{}).
		Where("id = ?", channelID).
		Update("settings", channel.OtherSettings).Error; err != nil {
		return nil, ImportedAccountResetState{}, err
	}
	model.CacheUpdateChannel(channel)
	return channel, state, nil
}
