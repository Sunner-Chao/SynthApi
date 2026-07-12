package model

import (
	"sync"
	"time"
)

const (
	channelRuntimePerfAlpha = 0.2
	channelRuntimePerfTTL   = 30 * time.Minute
)

type channelRuntimePerf struct {
	mu           sync.RWMutex
	requestCount int64
	successRate  float64
	avgTtftMs    float64
	avgLatencyMs float64
	updatedAt    time.Time
}

var channelRuntimePerfMap sync.Map

func RecordChannelRuntimeSample(channelID int, ttftMs int64, latencyMs int64, hasTtft bool, success bool) {
	if channelID <= 0 {
		return
	}
	actual, _ := channelRuntimePerfMap.LoadOrStore(channelID, &channelRuntimePerf{})
	perf := actual.(*channelRuntimePerf)

	perf.mu.Lock()
	defer perf.mu.Unlock()

	successValue := 0.0
	if success {
		successValue = 100
	}
	perf.requestCount++
	if perf.requestCount == 1 {
		perf.successRate = successValue
		perf.avgLatencyMs = float64(latencyMs)
		if hasTtft {
			perf.avgTtftMs = float64(ttftMs)
		}
	} else {
		perf.successRate = ewma(perf.successRate, successValue, channelRuntimePerfAlpha)
		if latencyMs > 0 {
			perf.avgLatencyMs = ewma(perf.avgLatencyMs, float64(latencyMs), channelRuntimePerfAlpha)
		}
		if hasTtft && ttftMs > 0 {
			if perf.avgTtftMs <= 0 {
				perf.avgTtftMs = float64(ttftMs)
			} else {
				perf.avgTtftMs = ewma(perf.avgTtftMs, float64(ttftMs), channelRuntimePerfAlpha)
			}
		}
	}
	perf.updatedAt = time.Now()
}

func channelRuntimeSelectionWeightPercent(channelID int) int {
	if channelID <= 0 {
		return 100
	}
	actual, ok := channelRuntimePerfMap.Load(channelID)
	if !ok {
		return 100
	}
	perf := actual.(*channelRuntimePerf)

	perf.mu.RLock()
	defer perf.mu.RUnlock()

	if perf.requestCount < 3 || time.Since(perf.updatedAt) > channelRuntimePerfTTL {
		return 100
	}

	percent := 100
	if perf.successRate < 95 {
		percent -= int((95 - perf.successRate) * 2)
	}
	latencyMs := int(perf.avgLatencyMs)
	if latencyMs > 0 {
		percent = percent * channelResponseTimeWeightPercent(latencyMs) / 100
	}
	ttftMs := int(perf.avgTtftMs)
	if ttftMs > channelLatencyNoPenaltyMs {
		percent = percent * channelResponseTimeWeightPercent(ttftMs) / 100
	}

	if percent < 10 {
		return 10
	}
	if percent > 100 {
		return 100
	}
	return percent
}

func ewma(previous float64, current float64, alpha float64) float64 {
	if previous <= 0 {
		return current
	}
	return previous*(1-alpha) + current*alpha
}
