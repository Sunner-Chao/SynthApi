package model

import (
	"fmt"
	"strings"
	"sync"
	"time"
)

const (
	channelLogPerfHours       = 24
	channelLogPerfTTL         = 5 * time.Minute
	channelLogPerfMinRequests = 5
	channelLogPerfFullTrust   = 20
)

type ChannelLogLatencyHint struct {
	ChannelId          int     `gorm:"column:channel_id"`
	RequestCount       int64   `gorm:"column:request_count"`
	AvgUseTimeSeconds  float64 `gorm:"column:avg_use_time_seconds"`
	AvgUseTimeMs       int64   `gorm:"-"`
	SelectionWeightPct int     `gorm:"-"`
}

type channelLogPerfCacheEntry struct {
	expiresAt time.Time
	hints     map[int]ChannelLogLatencyHint
}

var (
	channelLogPerfCache sync.Map
	channelLogPerfLock  sync.Mutex
)

func channelLogSelectionHints(modelName string, group string) map[int]ChannelLogLatencyHint {
	modelName = strings.TrimSpace(modelName)
	group = strings.TrimSpace(group)
	if modelName == "" || group == "" || LOG_DB == nil {
		return nil
	}

	cacheKey := modelName + "\x00" + group
	now := time.Now()
	if cached, ok := channelLogPerfCache.Load(cacheKey); ok {
		entry := cached.(channelLogPerfCacheEntry)
		if now.Before(entry.expiresAt) {
			return copyChannelLogLatencyHints(entry.hints)
		}
	}

	channelLogPerfLock.Lock()
	defer channelLogPerfLock.Unlock()

	if cached, ok := channelLogPerfCache.Load(cacheKey); ok {
		entry := cached.(channelLogPerfCacheEntry)
		if now.Before(entry.expiresAt) {
			return copyChannelLogLatencyHints(entry.hints)
		}
	}

	rows, err := GetChannelLogLatencyHints(modelName, group, now.Add(-channelLogPerfHours*time.Hour).Unix(), channelLogPerfMinRequests)
	if err != nil {
		channelLogPerfCache.Store(cacheKey, channelLogPerfCacheEntry{
			expiresAt: now.Add(time.Minute),
			hints:     nil,
		})
		return nil
	}
	hints := buildChannelLogSelectionHints(rows)
	channelLogPerfCache.Store(cacheKey, channelLogPerfCacheEntry{
		expiresAt: now.Add(channelLogPerfTTL),
		hints:     hints,
	})
	return copyChannelLogLatencyHints(hints)
}

func GetChannelLogLatencyHints(modelName string, group string, startTs int64, minRequests int) ([]ChannelLogLatencyHint, error) {
	modelName = strings.TrimSpace(modelName)
	group = strings.TrimSpace(group)
	if modelName == "" || group == "" || startTs <= 0 || LOG_DB == nil {
		return nil, nil
	}
	if minRequests <= 0 {
		minRequests = channelLogPerfMinRequests
	}
	var rows []ChannelLogLatencyHint
	query := LOG_DB.Model(&Log{}).
		Select("channel_id, COUNT(*) AS request_count, AVG(use_time) AS avg_use_time_seconds").
		Where(fmt.Sprintf("type = ? AND model_name = ? AND %s = ? AND created_at >= ? AND channel_id > 0 AND use_time > 0", logGroupCol),
			LogTypeConsume, modelName, group, startTs).
		Group("channel_id").
		Having("COUNT(*) >= ?", minRequests)
	if err := query.Scan(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func buildChannelLogSelectionHints(rows []ChannelLogLatencyHint) map[int]ChannelLogLatencyHint {
	if len(rows) == 0 {
		return nil
	}
	bestMs := int64(0)
	hints := make(map[int]ChannelLogLatencyHint, len(rows))
	for _, row := range rows {
		if row.ChannelId <= 0 || row.RequestCount < channelLogPerfMinRequests || row.AvgUseTimeSeconds <= 0 {
			continue
		}
		row.AvgUseTimeMs = int64(row.AvgUseTimeSeconds * 1000)
		if row.AvgUseTimeMs <= 0 {
			continue
		}
		if bestMs == 0 || row.AvgUseTimeMs < bestMs {
			bestMs = row.AvgUseTimeMs
		}
		hints[row.ChannelId] = row
	}
	if bestMs <= 0 || len(hints) == 0 {
		return nil
	}
	for channelID, hint := range hints {
		hint.SelectionWeightPct = channelLogPerfWeightPercent(hint.AvgUseTimeMs, bestMs, hint.RequestCount)
		hints[channelID] = hint
	}
	return hints
}

func channelLogPerfWeightPercent(avgMs int64, bestMs int64, requestCount int64) int {
	if avgMs <= 0 || bestMs <= 0 || requestCount < channelLogPerfMinRequests {
		return 100
	}
	ratio := float64(avgMs) / float64(bestMs)
	rawPercent := 100
	switch {
	case ratio <= 1.25:
		rawPercent = 100
	case ratio <= 1.75:
		rawPercent = 80
	case ratio <= 2.5:
		rawPercent = 55
	case ratio <= 3.5:
		rawPercent = 35
	default:
		rawPercent = 20
	}
	if requestCount >= channelLogPerfFullTrust {
		return rawPercent
	}
	confidence := float64(requestCount-channelLogPerfMinRequests+1) / float64(channelLogPerfFullTrust-channelLogPerfMinRequests+1)
	if confidence < 0 {
		confidence = 0
	}
	if confidence > 1 {
		confidence = 1
	}
	adjusted := 100 - int(float64(100-rawPercent)*confidence)
	if adjusted < 20 {
		return 20
	}
	if adjusted > 100 {
		return 100
	}
	return adjusted
}

func copyChannelLogLatencyHints(source map[int]ChannelLogLatencyHint) map[int]ChannelLogLatencyHint {
	if len(source) == 0 {
		return nil
	}
	copied := make(map[int]ChannelLogLatencyHint, len(source))
	for key, value := range source {
		copied[key] = value
	}
	return copied
}
