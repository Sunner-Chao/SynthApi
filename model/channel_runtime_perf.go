package model

import (
	"sort"
	"sync"
	"time"
)

const (
	channelRuntimePerfAlpha         = 0.2
	channelRuntimePerfTTL           = 30 * time.Minute
	channelRuntimeTTFTWindow        = 32
	channelRuntimeTTFTP90MinSamples = 8
)

type channelRuntimePerf struct {
	mu           sync.RWMutex
	requestCount int64
	successRate  float64
	avgTtftMs    float64
	avgLatencyMs float64
	ttftSamples  [channelRuntimeTTFTWindow]int64
	ttftCount    int
	ttftNext     int
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
	if hasTtft && ttftMs > 0 {
		perf.ttftSamples[perf.ttftNext] = ttftMs
		perf.ttftNext = (perf.ttftNext + 1) % channelRuntimeTTFTWindow
		if perf.ttftCount < channelRuntimeTTFTWindow {
			perf.ttftCount++
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
	if p90TtftMs := perf.ttftP90Locked(); p90TtftMs > channelLatencyNoPenaltyMs {
		percent = percent * channelResponseTimeWeightPercent(p90TtftMs) / 100
	}

	if percent < 10 {
		return 10
	}
	if percent > 100 {
		return 100
	}
	return percent
}

func (p *channelRuntimePerf) ttftP90Locked() int {
	if p == nil || p.ttftCount < channelRuntimeTTFTP90MinSamples {
		return 0
	}
	samples := make([]int64, p.ttftCount)
	copy(samples, p.ttftSamples[:p.ttftCount])
	sort.Slice(samples, func(i, j int) bool { return samples[i] < samples[j] })
	index := (len(samples)*90 + 99) / 100
	if index <= 0 {
		index = 1
	}
	return int(samples[index-1])
}

func ewma(previous float64, current float64, alpha float64) float64 {
	if previous <= 0 {
		return current
	}
	return previous*(1-alpha) + current*alpha
}
