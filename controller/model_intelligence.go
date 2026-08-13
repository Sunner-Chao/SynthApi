package controller

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"

	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

const (
	codexRadarMetricsURL          = "https://codexradar.com/api/intelligence-efficiency-metrics"
	codexRadarPublishedURL        = "https://codexradar.com/data/intelligence-efficiency.json"
	codexRadarRatingsURL          = "https://codexradar.com/api/model-ratings?view=public"
	codexRadarInsightsURL         = "https://codexradar.com/api/radar-insights"
	modelIntelligenceTTL          = 60 * time.Second
	modelIntelligencePublishedTTL = 10 * time.Minute
	modelIntelligenceMax          = 512 << 10
	modelIntelligencePublishedMax = 2 << 20
	modelIntelligenceSnapshotName = "model-intelligence-cache.json"
)

type codexRadarMetricPoint struct {
	Model             string  `json:"model"`
	Effort            string  `json:"effort"`
	WeightedPassed    float64 `json:"weighted_passed"`
	WeightedTotal     float64 `json:"weighted_total"`
	IQ                float64 `json:"iq"`
	AveragePriceUSD   float64 `json:"average_price_usd"`
	AverageMinutes    float64 `json:"average_minutes"`
	CombinedCostIndex float64 `json:"combined_cost_index"`
	CacheHitRate      float64 `json:"cache_hit_rate"`
	Runs24h           int     `json:"runs_24h"`
	Runs48h           int     `json:"runs_48h"`
	RunsTotal         int     `json:"runs_total"`
	SourceUpdatedAt   string  `json:"source_updated_at"`
}

type codexRadarMetrics struct {
	Schema          int                     `json:"schema"`
	Mode            string                  `json:"mode"`
	SourceUpdatedAt string                  `json:"source_updated_at"`
	Runs24hTotal    int                     `json:"runs_24h_total"`
	Runs48hTotal    int                     `json:"runs_48h_total"`
	RunsTotal       int                     `json:"runs_total"`
	Points          []codexRadarMetricPoint `json:"points"`
}

type codexRadarPublishedPoint struct {
	Model             string  `json:"model"`
	Effort            string  `json:"effort"`
	IQ                float64 `json:"iq"`
	Passed            float64 `json:"passed"`
	ValidTasks        float64 `json:"valid_tasks"`
	AveragePriceUSD   float64 `json:"average_price_usd"`
	AverageMinutes    float64 `json:"average_minutes"`
	CombinedCostIndex float64 `json:"combined_cost_index"`
	CacheHitRate      float64 `json:"cache_hit_rate"`
	Runs24h           int     `json:"runs_24h"`
	Runs48h           int     `json:"runs_48h"`
	RunsTotal         int     `json:"runs_total"`
	LatestGradedAt    string  `json:"latest_graded_at"`
}

type codexRadarPublishedSnapshot struct {
	Schema          int                        `json:"schema"`
	Type            string                     `json:"type"`
	SourceUpdatedAt string                     `json:"source_updated_at"`
	Runs24hTotal    int                        `json:"runs_24h_total"`
	Runs48hTotal    int                        `json:"runs_48h_total"`
	RunsTotal       int                        `json:"runs_total"`
	Points          []codexRadarPublishedPoint `json:"points"`
}

type codexRadarRating struct {
	ID      string  `json:"id"`
	Label   string  `json:"label"`
	Group   string  `json:"group"`
	Average float64 `json:"average"`
	Count   int     `json:"count"`
}

type codexRadarRatings struct {
	OK             bool               `json:"ok"`
	UpdatedAt      string             `json:"updated_at"`
	RefreshSeconds int                `json:"refresh_seconds"`
	Models         []codexRadarRating `json:"models"`
	Window         string             `json:"window"`
	WindowHours    int                `json:"window_hours"`
}

type codexRadarInsightItem struct {
	Model                  string  `json:"model"`
	Effort                 string  `json:"effort"`
	IQ                     float64 `json:"iq"`
	AverageCostUSD         float64 `json:"average_cost_usd"`
	AverageDurationMinutes float64 `json:"average_duration_minutes"`
}

type codexRadarRecommendation struct {
	Key   string                  `json:"key"`
	Title string                  `json:"title"`
	Items []codexRadarInsightItem `json:"items"`
}

type codexRadarInsights struct {
	GeneratedAt     string                     `json:"generated_at"`
	SourceUpdatedAt string                     `json:"source_updated_at"`
	Recommendations []codexRadarRecommendation `json:"recommendations"`
}

type ModelIntelligencePoint struct {
	Key               string  `json:"key"`
	Label             string  `json:"label"`
	Model             string  `json:"model"`
	Effort            string  `json:"effort"`
	IQ                float64 `json:"iq"`
	Passed            float64 `json:"passed"`
	Total             float64 `json:"total"`
	AveragePriceUSD   float64 `json:"average_price_usd"`
	AverageMinutes    float64 `json:"average_minutes"`
	CombinedCostIndex float64 `json:"combined_cost_index"`
	CacheHitRate      float64 `json:"cache_hit_rate"`
	Runs24h           int     `json:"runs_24h"`
	Runs48h           int     `json:"runs_48h"`
	RunsTotal         int     `json:"runs_total"`
	SourceUpdatedAt   string  `json:"source_updated_at"`
}

type ModelIntelligenceCommunity struct {
	OverallScore   float64 `json:"overall_score"`
	PositiveRate   float64 `json:"positive_rate"`
	RecommendIndex float64 `json:"recommend_index"`
	DiscussionHeat float64 `json:"discussion_heat"`
	TrustIndex     float64 `json:"trust_index"`
	RatingCount    int     `json:"rating_count"`
	UpdatedAt      string  `json:"updated_at"`
}

type ModelIntelligenceInsight struct {
	Key                    string  `json:"key"`
	Title                  string  `json:"title"`
	Model                  string  `json:"model"`
	ModelLabel             string  `json:"model_label"`
	Effort                 string  `json:"effort"`
	IQ                     float64 `json:"iq"`
	AverageCostUSD         float64 `json:"average_cost_usd"`
	AverageDurationMinutes float64 `json:"average_duration_minutes"`
}

type ModelIntelligencePayload struct {
	Source          string                     `json:"source"`
	SourceURL       string                     `json:"source_url"`
	Mode            string                     `json:"mode"`
	RefreshedAt     string                     `json:"refreshed_at"`
	SourceUpdatedAt string                     `json:"source_updated_at"`
	CacheSeconds    int                        `json:"cache_seconds"`
	Stale           bool                       `json:"stale"`
	Runs24hTotal    int                        `json:"runs_24h_total"`
	Runs48hTotal    int                        `json:"runs_48h_total"`
	RunsTotal       int                        `json:"runs_total"`
	Points          []ModelIntelligencePoint   `json:"points"`
	Rankings        []ModelIntelligencePoint   `json:"rankings"`
	Community       ModelIntelligenceCommunity `json:"community"`
	Insights        []ModelIntelligenceInsight `json:"insights"`
}

var modelIntelligenceHTTPClient = &http.Client{
	Timeout: 10 * time.Second,
	Transport: &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   4 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          12,
		MaxIdleConnsPerHost:   4,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   5 * time.Second,
		ExpectContinueTimeout: time.Second,
	},
}

var modelIntelligenceCache struct {
	sync.Mutex
	payload            *ModelIntelligencePayload
	fetchedAt          time.Time
	publishedFetchedAt time.Time
}

func modelIntelligenceSnapshotPath() string {
	if configured := strings.TrimSpace(os.Getenv("MODEL_INTELLIGENCE_CACHE_FILE")); configured != "" {
		return configured
	}
	return filepath.Join("data", modelIntelligenceSnapshotName)
}

func readModelIntelligenceSnapshot() (ModelIntelligencePayload, error) {
	data, err := os.ReadFile(modelIntelligenceSnapshotPath())
	if err != nil {
		return ModelIntelligencePayload{}, err
	}
	var payload ModelIntelligencePayload
	if err := json.Unmarshal(data, &payload); err != nil {
		return ModelIntelligencePayload{}, err
	}
	if len(payload.Points) == 0 || len(payload.Rankings) == 0 {
		return ModelIntelligencePayload{}, fmt.Errorf("model intelligence snapshot has no usable points")
	}
	payload.Stale = true
	return payload, nil
}

func writeModelIntelligenceSnapshot(payload ModelIntelligencePayload) error {
	path := modelIntelligenceSnapshotPath()
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	temporary, err := os.CreateTemp(dir, ".model-intelligence-*.tmp")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0644); err != nil {
		temporary.Close()
		return err
	}
	if _, err := temporary.Write(data); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	return os.Rename(temporaryPath, path)
}

func fetchCodexRadarJSON(ctx context.Context, target string, dest any) error {
	return fetchCodexRadarJSONWithLimit(ctx, target, dest, modelIntelligenceMax)
}

func fetchCodexRadarJSONWithLimit(ctx context.Context, target string, dest any, maxBytes int64) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "SynthAPI-Model-Intelligence/1.0")

	resp, err := modelIntelligenceHTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("codexradar returned status %d", resp.StatusCode)
	}
	return common.DecodeJson(io.LimitReader(resp.Body, maxBytes), dest)
}

func modelIntelligenceLabel(model string, effort string) string {
	var modelLabel string
	switch model {
	case "gpt-5.6-sol":
		modelLabel = "GPT-5.6 Sol"
	case "gpt-5.6-terra":
		modelLabel = "GPT-5.6 Terra"
	case "gpt-5.6-luna":
		modelLabel = "GPT-5.6 Luna"
	case "gpt-5.5":
		modelLabel = "GPT-5.5"
	case "deepseek-v4-flash":
		modelLabel = "DeepSeek V4 Flash"
	default:
		modelLabel = strings.TrimSpace(model)
	}
	if effort == "" {
		return modelLabel
	}
	return modelLabel + " " + effort
}

func roundTo(value float64, places int) float64 {
	power := math.Pow10(places)
	return math.Round(value*power) / power
}

func buildModelIntelligencePayload(
	metrics codexRadarMetrics,
	ratings codexRadarRatings,
	insights codexRadarInsights,
	now time.Time,
) ModelIntelligencePayload {
	points := make([]ModelIntelligencePoint, 0, len(metrics.Points))
	for _, point := range metrics.Points {
		if point.IQ <= 0 || point.WeightedTotal <= 0 {
			continue
		}
		points = append(points, ModelIntelligencePoint{
			Key:               point.Model + "-" + point.Effort,
			Label:             modelIntelligenceLabel(point.Model, point.Effort),
			Model:             point.Model,
			Effort:            point.Effort,
			IQ:                roundTo(point.IQ, 2),
			Passed:            roundTo(point.WeightedPassed, 1),
			Total:             roundTo(point.WeightedTotal, 1),
			AveragePriceUSD:   roundTo(point.AveragePriceUSD, 4),
			AverageMinutes:    roundTo(point.AverageMinutes, 2),
			CombinedCostIndex: roundTo(point.CombinedCostIndex, 3),
			CacheHitRate:      roundTo(point.CacheHitRate*100, 1),
			Runs24h:           point.Runs24h,
			Runs48h:           point.Runs48h,
			RunsTotal:         point.RunsTotal,
			SourceUpdatedAt:   point.SourceUpdatedAt,
		})
	}

	rankings := append([]ModelIntelligencePoint(nil), points...)
	sort.SliceStable(rankings, func(i, j int) bool {
		if rankings[i].IQ == rankings[j].IQ {
			return rankings[i].RunsTotal > rankings[j].RunsTotal
		}
		return rankings[i].IQ > rankings[j].IQ
	})
	if len(rankings) > 6 {
		rankings = rankings[:6]
	}

	community := ModelIntelligenceCommunity{UpdatedAt: ratings.UpdatedAt}
	weightedRating := 0.0
	topRating := 0.0
	for _, rating := range ratings.Models {
		if rating.Count <= 0 || rating.Average <= 0 {
			continue
		}
		community.RatingCount += rating.Count
		weightedRating += rating.Average * float64(rating.Count)
		if rating.Average > topRating {
			topRating = rating.Average
		}
	}
	if community.RatingCount > 0 {
		average := weightedRating / float64(community.RatingCount)
		community.OverallScore = roundTo(average/2, 1)
		community.PositiveRate = roundTo(average*10, 1)
		community.RecommendIndex = roundTo(topRating/2, 1)
		community.DiscussionHeat = roundTo(math.Min(99.9, 40+math.Log10(float64(community.RatingCount)+1)*20), 1)
		community.TrustIndex = roundTo(math.Min(5, 3+math.Log10(float64(community.RatingCount)+1)*0.7), 1)
	}

	resultInsights := make([]ModelIntelligenceInsight, 0, len(insights.Recommendations))
	for _, recommendation := range insights.Recommendations {
		if len(recommendation.Items) == 0 {
			continue
		}
		item := recommendation.Items[0]
		resultInsights = append(resultInsights, ModelIntelligenceInsight{
			Key:                    recommendation.Key,
			Title:                  recommendation.Title,
			Model:                  item.Model,
			ModelLabel:             modelIntelligenceLabel(item.Model, item.Effort),
			Effort:                 item.Effort,
			IQ:                     roundTo(item.IQ, 2),
			AverageCostUSD:         roundTo(item.AverageCostUSD, 4),
			AverageDurationMinutes: roundTo(item.AverageDurationMinutes, 2),
		})
	}

	return ModelIntelligencePayload{
		Source:          "CodexRadar",
		SourceURL:       "https://codexradar.com",
		Mode:            metrics.Mode,
		RefreshedAt:     now.UTC().Format(time.RFC3339),
		SourceUpdatedAt: metrics.SourceUpdatedAt,
		CacheSeconds:    int(modelIntelligenceTTL / time.Second),
		Runs24hTotal:    metrics.Runs24hTotal,
		Runs48hTotal:    metrics.Runs48hTotal,
		RunsTotal:       metrics.RunsTotal,
		Points:          points,
		Rankings:        rankings,
		Community:       community,
		Insights:        resultInsights,
	}
}

func buildModelIntelligencePayloadFromPublished(
	published codexRadarPublishedSnapshot,
	ratings codexRadarRatings,
	insights codexRadarInsights,
	now time.Time,
) ModelIntelligencePayload {
	metrics := codexRadarMetrics{
		Schema:          published.Schema,
		Mode:            "published_snapshot",
		SourceUpdatedAt: published.SourceUpdatedAt,
		Runs24hTotal:    published.Runs24hTotal,
		Runs48hTotal:    published.Runs48hTotal,
		RunsTotal:       published.RunsTotal,
		Points:          make([]codexRadarMetricPoint, 0, len(published.Points)),
	}
	for _, point := range published.Points {
		metrics.Points = append(metrics.Points, codexRadarMetricPoint{
			Model:             point.Model,
			Effort:            point.Effort,
			WeightedPassed:    point.Passed,
			WeightedTotal:     point.ValidTasks,
			IQ:                point.IQ,
			AveragePriceUSD:   point.AveragePriceUSD,
			AverageMinutes:    point.AverageMinutes,
			CombinedCostIndex: point.CombinedCostIndex,
			CacheHitRate:      point.CacheHitRate,
			Runs24h:           point.Runs24h,
			Runs48h:           point.Runs48h,
			RunsTotal:         point.RunsTotal,
			SourceUpdatedAt:   point.LatestGradedAt,
		})
	}
	payload := buildModelIntelligencePayload(metrics, ratings, insights, now)
	payload.Stale = true
	return payload
}

func loadModelIntelligence(ctx context.Context) (ModelIntelligencePayload, error) {
	modelIntelligenceCache.Lock()
	defer modelIntelligenceCache.Unlock()

	now := time.Now()
	if modelIntelligenceCache.payload != nil && now.Sub(modelIntelligenceCache.fetchedAt) < modelIntelligenceTTL {
		return *modelIntelligenceCache.payload, nil
	}

	var metrics codexRadarMetrics
	var ratings codexRadarRatings
	var insights codexRadarInsights
	var metricsErr error
	var ratingsErr error
	var insightsErr error

	group, groupCtx := errgroup.WithContext(ctx)
	group.Go(func() error {
		metricsErr = fetchCodexRadarJSON(groupCtx, codexRadarMetricsURL, &metrics)
		return nil
	})
	group.Go(func() error {
		ratingsErr = fetchCodexRadarJSON(groupCtx, codexRadarRatingsURL, &ratings)
		return nil
	})
	group.Go(func() error {
		insightsErr = fetchCodexRadarJSON(groupCtx, codexRadarInsightsURL, &insights)
		return nil
	})
	_ = group.Wait()

	if metricsErr != nil {
		if modelIntelligenceCache.payload != nil &&
			modelIntelligenceCache.payload.Mode == "published_snapshot" &&
			!modelIntelligenceCache.publishedFetchedAt.IsZero() &&
			now.Sub(modelIntelligenceCache.publishedFetchedAt) < modelIntelligencePublishedTTL {
			stale := *modelIntelligenceCache.payload
			stale.Stale = true
			modelIntelligenceCache.fetchedAt = now
			return stale, nil
		}
		var published codexRadarPublishedSnapshot
		publishedErr := fetchCodexRadarJSONWithLimit(
			ctx,
			codexRadarPublishedURL,
			&published,
			modelIntelligencePublishedMax,
		)
		if publishedErr == nil {
			payload := buildModelIntelligencePayloadFromPublished(published, ratings, insights, now)
			if len(payload.Points) > 0 {
				modelIntelligenceCache.payload = &payload
				modelIntelligenceCache.fetchedAt = now
				modelIntelligenceCache.publishedFetchedAt = now
				if err := writeModelIntelligenceSnapshot(payload); err != nil {
					common.SysError(fmt.Sprintf("failed to persist published model intelligence snapshot: %v", err))
				}
				return payload, nil
			}
		}
		if modelIntelligenceCache.payload != nil {
			stale := *modelIntelligenceCache.payload
			stale.Stale = true
			modelIntelligenceCache.fetchedAt = now
			return stale, nil
		}
		if snapshot, snapshotErr := readModelIntelligenceSnapshot(); snapshotErr == nil {
			modelIntelligenceCache.payload = &snapshot
			modelIntelligenceCache.fetchedAt = now
			return snapshot, nil
		}
		return ModelIntelligencePayload{}, metricsErr
	}
	if ratingsErr != nil {
		ratings = codexRadarRatings{}
	}
	if insightsErr != nil {
		insights = codexRadarInsights{}
	}

	payload := buildModelIntelligencePayload(metrics, ratings, insights, now)
	modelIntelligenceCache.payload = &payload
	modelIntelligenceCache.fetchedAt = now
	if err := writeModelIntelligenceSnapshot(payload); err != nil {
		common.SysError(fmt.Sprintf("failed to persist model intelligence snapshot: %v", err))
	}
	return payload, nil
}

func GetModelIntelligence(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 12*time.Second)
	defer cancel()

	payload, err := loadModelIntelligence(ctx)
	if err != nil {
		common.ApiErrorMsg(c, "模型智力数据暂时不可用")
		return
	}
	c.Header("Cache-Control", "private, max-age=30")
	common.ApiSuccess(c, payload)
}
