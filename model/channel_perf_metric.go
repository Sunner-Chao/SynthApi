package model

import (
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	channelPerfRouteHours       = 24
	channelPerfRouteTTL         = time.Minute
	channelPerfRouteMinRequests = 5
	channelPerfRouteFullTrust   = 20
)

// ChannelPerfMetric stores aggregated real relay performance per concrete
// channel. It is intentionally separate from PerfMetric, which backs public
// model/group performance charts.
type ChannelPerfMetric struct {
	Id             int    `json:"id" gorm:"primaryKey"`
	ModelName      string `json:"model_name" gorm:"size:128;uniqueIndex:idx_channel_perf_model_group_channel_bucket,priority:1"`
	Group          string `json:"group" gorm:"column:group;size:64;uniqueIndex:idx_channel_perf_model_group_channel_bucket,priority:2"`
	ChannelId      int    `json:"channel_id" gorm:"uniqueIndex:idx_channel_perf_model_group_channel_bucket,priority:3;index:idx_channel_perf_channel"`
	BucketTs       int64  `json:"bucket_ts" gorm:"uniqueIndex:idx_channel_perf_model_group_channel_bucket,priority:4;index:idx_channel_perf_bucket_ts"`
	RequestCount   int64  `json:"-" gorm:"default:0"`
	SuccessCount   int64  `json:"-" gorm:"default:0"`
	TotalLatencyMs int64  `json:"-" gorm:"default:0"`
	TtftSumMs      int64  `json:"-" gorm:"default:0"`
	TtftCount      int64  `json:"-" gorm:"default:0"`
	OutputTokens   int64  `json:"-" gorm:"default:0"`
	GenerationMs   int64  `json:"-" gorm:"default:0"`
}

func (ChannelPerfMetric) TableName() string {
	return "channel_perf_metrics"
}

type ChannelPerfRouteHint struct {
	ChannelId          int
	RequestCount       int64
	SuccessCount       int64
	AvgTtftMs          int64
	AvgLatencyMs       int64
	SuccessRate        float64
	SelectionWeightPct int
}

type channelPerfBucketKey struct {
	model     string
	group     string
	channelID int
	bucketTs  int64
}

type channelPerfCounters struct {
	requestCount   int64
	successCount   int64
	totalLatencyMs int64
	ttftSumMs      int64
	ttftCount      int64
	outputTokens   int64
	generationMs   int64
}

type atomicChannelPerfBucket struct {
	requestCount   atomic.Int64
	successCount   atomic.Int64
	totalLatencyMs atomic.Int64
	ttftSumMs      atomic.Int64
	ttftCount      atomic.Int64
	outputTokens   atomic.Int64
	generationMs   atomic.Int64
}

func (b *atomicChannelPerfBucket) add(success bool, ttftMs int64, latencyMs int64, hasTtft bool, outputTokens int64, generationMs int64) {
	b.requestCount.Add(1)
	if success {
		b.successCount.Add(1)
	}
	if latencyMs > 0 {
		b.totalLatencyMs.Add(latencyMs)
	}
	if hasTtft && ttftMs >= 0 {
		b.ttftSumMs.Add(ttftMs)
		b.ttftCount.Add(1)
	}
	if outputTokens > 0 && generationMs > 0 {
		b.outputTokens.Add(outputTokens)
		b.generationMs.Add(generationMs)
	}
}

func (b *atomicChannelPerfBucket) snapshot() channelPerfCounters {
	return channelPerfCounters{
		requestCount:   b.requestCount.Load(),
		successCount:   b.successCount.Load(),
		totalLatencyMs: b.totalLatencyMs.Load(),
		ttftSumMs:      b.ttftSumMs.Load(),
		ttftCount:      b.ttftCount.Load(),
		outputTokens:   b.outputTokens.Load(),
		generationMs:   b.generationMs.Load(),
	}
}

func (b *atomicChannelPerfBucket) drain() channelPerfCounters {
	return channelPerfCounters{
		requestCount:   b.requestCount.Swap(0),
		successCount:   b.successCount.Swap(0),
		totalLatencyMs: b.totalLatencyMs.Swap(0),
		ttftSumMs:      b.ttftSumMs.Swap(0),
		ttftCount:      b.ttftCount.Swap(0),
		outputTokens:   b.outputTokens.Swap(0),
		generationMs:   b.generationMs.Swap(0),
	}
}

func (b *atomicChannelPerfBucket) addCounters(c channelPerfCounters) {
	if c.requestCount != 0 {
		b.requestCount.Add(c.requestCount)
	}
	if c.successCount != 0 {
		b.successCount.Add(c.successCount)
	}
	if c.totalLatencyMs != 0 {
		b.totalLatencyMs.Add(c.totalLatencyMs)
	}
	if c.ttftSumMs != 0 {
		b.ttftSumMs.Add(c.ttftSumMs)
	}
	if c.ttftCount != 0 {
		b.ttftCount.Add(c.ttftCount)
	}
	if c.outputTokens != 0 {
		b.outputTokens.Add(c.outputTokens)
	}
	if c.generationMs != 0 {
		b.generationMs.Add(c.generationMs)
	}
}

type channelPerfRouteCacheEntry struct {
	expiresAt time.Time
	hints     map[int]ChannelPerfRouteHint
}

var (
	channelPerfHotBuckets sync.Map
	channelPerfRouteCache sync.Map
	channelPerfRouteLock  sync.Mutex
)

func RecordChannelPerfSample(modelName string, group string, channelID int, bucketTs int64, ttftMs int64, latencyMs int64, hasTtft bool, success bool, outputTokens int64, generationMs int64) {
	modelName = strings.TrimSpace(modelName)
	group = strings.TrimSpace(group)
	if modelName == "" || channelID <= 0 || bucketTs <= 0 {
		return
	}
	if group == "" {
		group = "default"
	}
	if latencyMs < 0 {
		latencyMs = 0
	}
	key := channelPerfBucketKey{
		model:     modelName,
		group:     group,
		channelID: channelID,
		bucketTs:  bucketTs,
	}
	actual, _ := channelPerfHotBuckets.LoadOrStore(key, &atomicChannelPerfBucket{})
	actual.(*atomicChannelPerfBucket).add(success, ttftMs, latencyMs, hasTtft, outputTokens, generationMs)
}

func FlushCompletedChannelPerfBuckets(currentBucket int64) {
	if currentBucket <= 0 {
		return
	}
	channelPerfHotBuckets.Range(func(key, value any) bool {
		k := key.(channelPerfBucketKey)
		if k.bucketTs >= currentBucket {
			return true
		}

		bucket := value.(*atomicChannelPerfBucket)
		drained := bucket.drain()
		if drained.requestCount == 0 {
			deleteOldEmptyChannelPerfBucket(k, key)
			return true
		}

		err := UpsertChannelPerfMetric(&ChannelPerfMetric{
			ModelName:      k.model,
			Group:          k.group,
			ChannelId:      k.channelID,
			BucketTs:       k.bucketTs,
			RequestCount:   drained.requestCount,
			SuccessCount:   drained.successCount,
			TotalLatencyMs: drained.totalLatencyMs,
			TtftSumMs:      drained.ttftSumMs,
			TtftCount:      drained.ttftCount,
			OutputTokens:   drained.outputTokens,
			GenerationMs:   drained.generationMs,
		})
		if err != nil {
			bucket.addCounters(drained)
			common.SysError(fmt.Sprintf("failed to flush channel perf bucket model=%s group=%s channel=%d bucket=%d: %s", k.model, k.group, k.channelID, k.bucketTs, err.Error()))
			return true
		}

		deleteOldEmptyChannelPerfBucket(k, key)
		return true
	})
}

func deleteOldEmptyChannelPerfBucket(k channelPerfBucketKey, rawKey any) {
	if k.bucketTs < time.Now().Add(-24*time.Hour).Unix() {
		channelPerfHotBuckets.Delete(rawKey)
	}
}

func UpsertChannelPerfMetric(metric *ChannelPerfMetric) error {
	if metric == nil || metric.RequestCount == 0 || metric.ChannelId <= 0 {
		return nil
	}
	return DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "model_name"},
			{Name: "group"},
			{Name: "channel_id"},
			{Name: "bucket_ts"},
		},
		DoUpdates: clause.Assignments(map[string]interface{}{
			"request_count":    gorm.Expr("channel_perf_metrics.request_count + ?", metric.RequestCount),
			"success_count":    gorm.Expr("channel_perf_metrics.success_count + ?", metric.SuccessCount),
			"total_latency_ms": gorm.Expr("channel_perf_metrics.total_latency_ms + ?", metric.TotalLatencyMs),
			"ttft_sum_ms":      gorm.Expr("channel_perf_metrics.ttft_sum_ms + ?", metric.TtftSumMs),
			"ttft_count":       gorm.Expr("channel_perf_metrics.ttft_count + ?", metric.TtftCount),
			"output_tokens":    gorm.Expr("channel_perf_metrics.output_tokens + ?", metric.OutputTokens),
			"generation_ms":    gorm.Expr("channel_perf_metrics.generation_ms + ?", metric.GenerationMs),
		}),
	}).Create(metric).Error
}

func GetChannelPerfMetrics(modelName string, group string, startTs int64, endTs int64) ([]ChannelPerfMetric, error) {
	var metrics []ChannelPerfMetric
	modelName = strings.TrimSpace(modelName)
	group = strings.TrimSpace(group)
	if modelName == "" || group == "" || startTs <= 0 || endTs <= 0 {
		return metrics, nil
	}
	err := DB.Model(&ChannelPerfMetric{}).
		Where("model_name = ? AND "+commonGroupCol+" = ? AND bucket_ts >= ? AND bucket_ts <= ? AND channel_id > 0", modelName, group, startTs, endTs).
		Order("bucket_ts ASC").
		Find(&metrics).Error
	return metrics, err
}

func DeleteChannelPerfMetricsBefore(cutoffTs int64) error {
	if cutoffTs <= 0 {
		return nil
	}
	return DB.Where("bucket_ts < ?", cutoffTs).Delete(&ChannelPerfMetric{}).Error
}

func channelPerfSelectionHints(modelName string, group string) map[int]ChannelPerfRouteHint {
	modelName = strings.TrimSpace(modelName)
	group = strings.TrimSpace(group)
	if modelName == "" || group == "" || DB == nil {
		return nil
	}

	cacheKey := modelName + "\x00" + group
	now := time.Now()
	if cached, ok := channelPerfRouteCache.Load(cacheKey); ok {
		entry := cached.(channelPerfRouteCacheEntry)
		if now.Before(entry.expiresAt) {
			return copyChannelPerfRouteHints(entry.hints)
		}
	}

	channelPerfRouteLock.Lock()
	defer channelPerfRouteLock.Unlock()

	if cached, ok := channelPerfRouteCache.Load(cacheKey); ok {
		entry := cached.(channelPerfRouteCacheEntry)
		if now.Before(entry.expiresAt) {
			return copyChannelPerfRouteHints(entry.hints)
		}
	}

	startTs := now.Add(-channelPerfRouteHours * time.Hour).Unix()
	endTs := now.Unix()
	rows, err := GetChannelPerfMetrics(modelName, group, startTs, endTs)
	if err != nil {
		channelPerfRouteCache.Store(cacheKey, channelPerfRouteCacheEntry{
			expiresAt: now.Add(30 * time.Second),
			hints:     nil,
		})
		return nil
	}

	totals := make(map[int]channelPerfCounters)
	for _, row := range rows {
		mergeChannelPerfCounters(totals, row.ChannelId, channelPerfCounters{
			requestCount:   row.RequestCount,
			successCount:   row.SuccessCount,
			totalLatencyMs: row.TotalLatencyMs,
			ttftSumMs:      row.TtftSumMs,
			ttftCount:      row.TtftCount,
			outputTokens:   row.OutputTokens,
			generationMs:   row.GenerationMs,
		})
	}

	channelPerfHotBuckets.Range(func(key, value any) bool {
		k := key.(channelPerfBucketKey)
		if k.model != modelName || k.group != group || k.bucketTs < startTs || k.bucketTs > endTs {
			return true
		}
		mergeChannelPerfCounters(totals, k.channelID, value.(*atomicChannelPerfBucket).snapshot())
		return true
	})

	hints := buildChannelPerfRouteHints(totals)
	channelPerfRouteCache.Store(cacheKey, channelPerfRouteCacheEntry{
		expiresAt: now.Add(channelPerfRouteTTL),
		hints:     hints,
	})
	return copyChannelPerfRouteHints(hints)
}

func buildChannelPerfRouteHints(totals map[int]channelPerfCounters) map[int]ChannelPerfRouteHint {
	if len(totals) == 0 {
		return nil
	}

	bestLatencyMs := int64(0)
	bestTtftMs := int64(0)
	for _, total := range totals {
		if total.requestCount < channelPerfRouteMinRequests {
			continue
		}
		latencyMs := channelPerfAvg(total.totalLatencyMs, total.requestCount)
		if latencyMs > 0 && (bestLatencyMs == 0 || latencyMs < bestLatencyMs) {
			bestLatencyMs = latencyMs
		}
		ttftMs := channelPerfAvg(total.ttftSumMs, total.ttftCount)
		if total.ttftCount >= channelPerfRouteMinRequests && ttftMs > 0 && (bestTtftMs == 0 || ttftMs < bestTtftMs) {
			bestTtftMs = ttftMs
		}
	}

	hints := make(map[int]ChannelPerfRouteHint, len(totals))
	for channelID, total := range totals {
		if channelID <= 0 || total.requestCount < channelPerfRouteMinRequests {
			continue
		}
		avgLatencyMs := channelPerfAvg(total.totalLatencyMs, total.requestCount)
		avgTtftMs := channelPerfAvg(total.ttftSumMs, total.ttftCount)
		successRate := channelPerfSuccessRate(total)
		rawPercent := channelPerfSuccessWeightPercent(successRate)
		if bestLatencyMs > 0 && avgLatencyMs > 0 {
			rawPercent = channelPerfMinInt(rawPercent, channelPerfRelativeLatencyWeightPercent(avgLatencyMs, bestLatencyMs))
		}
		if bestTtftMs > 0 && avgTtftMs > 0 && total.ttftCount >= channelPerfRouteMinRequests {
			rawPercent = channelPerfMinInt(rawPercent, channelPerfRelativeLatencyWeightPercent(avgTtftMs, bestTtftMs))
		}
		hints[channelID] = ChannelPerfRouteHint{
			ChannelId:          channelID,
			RequestCount:       total.requestCount,
			SuccessCount:       total.successCount,
			AvgTtftMs:          avgTtftMs,
			AvgLatencyMs:       avgLatencyMs,
			SuccessRate:        successRate,
			SelectionWeightPct: channelPerfConfidenceAdjustedPercent(rawPercent, total.requestCount),
		}
	}
	if len(hints) == 0 {
		return nil
	}
	return hints
}

func mergeChannelPerfCounters(totals map[int]channelPerfCounters, channelID int, value channelPerfCounters) {
	if channelID <= 0 || value.requestCount == 0 {
		return
	}
	current := totals[channelID]
	current.requestCount += value.requestCount
	current.successCount += value.successCount
	current.totalLatencyMs += value.totalLatencyMs
	current.ttftSumMs += value.ttftSumMs
	current.ttftCount += value.ttftCount
	current.outputTokens += value.outputTokens
	current.generationMs += value.generationMs
	totals[channelID] = current
}

func channelPerfAvg(sum int64, count int64) int64 {
	if count <= 0 {
		return 0
	}
	return sum / count
}

func channelPerfSuccessRate(value channelPerfCounters) float64 {
	if value.requestCount <= 0 {
		return 0
	}
	return float64(value.successCount) / float64(value.requestCount) * 100
}

func channelPerfSuccessWeightPercent(successRate float64) int {
	switch {
	case successRate >= 99:
		return 100
	case successRate >= 97:
		return 85
	case successRate >= 95:
		return 70
	case successRate >= 90:
		return 45
	default:
		return 20
	}
}

func channelPerfRelativeLatencyWeightPercent(avgMs int64, bestMs int64) int {
	if avgMs <= 0 || bestMs <= 0 {
		return 100
	}
	ratio := float64(avgMs) / float64(bestMs)
	switch {
	case ratio <= 1.25:
		return 100
	case ratio <= 1.75:
		return 85
	case ratio <= 2.5:
		return 65
	case ratio <= 3.5:
		return 45
	default:
		return 25
	}
}

func channelPerfConfidenceAdjustedPercent(rawPercent int, requestCount int64) int {
	if rawPercent <= 0 || requestCount < channelPerfRouteMinRequests {
		return 100
	}
	if rawPercent > 100 {
		rawPercent = 100
	}
	confidence := float64(requestCount-channelPerfRouteMinRequests+1) / float64(channelPerfRouteFullTrust-channelPerfRouteMinRequests+1)
	if confidence < 0 {
		confidence = 0
	}
	if confidence > 1 {
		confidence = 1
	}
	adjusted := 100 - int(float64(100-rawPercent)*confidence)
	if adjusted < 15 {
		return 15
	}
	if adjusted > 100 {
		return 100
	}
	return adjusted
}

func channelPerfMinInt(a int, b int) int {
	if a < b {
		return a
	}
	return b
}

func copyChannelPerfRouteHints(source map[int]ChannelPerfRouteHint) map[int]ChannelPerfRouteHint {
	if len(source) == 0 {
		return nil
	}
	copied := make(map[int]ChannelPerfRouteHint, len(source))
	for key, value := range source {
		copied[key] = value
	}
	return copied
}
