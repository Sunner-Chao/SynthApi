package controller

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestBuildModelIntelligencePayload(t *testing.T) {
	metrics := codexRadarMetrics{
		Mode:            "weighted_latest_3",
		SourceUpdatedAt: "2026-08-11T08:00:00Z",
		Runs24hTotal:    120,
		Runs48hTotal:    240,
		RunsTotal:       1000,
		Points: []codexRadarMetricPoint{
			{Model: "gpt-5.6-sol", Effort: "high", IQ: 101.25, WeightedPassed: 81, WeightedTotal: 112, RunsTotal: 300},
			{Model: "gpt-5.6-terra", Effort: "max", IQ: 104.5, WeightedPassed: 78, WeightedTotal: 112, RunsTotal: 280},
		},
	}
	ratings := codexRadarRatings{
		UpdatedAt: "2026-08-11T08:00:00Z",
		Models: []codexRadarRating{
			{Average: 8, Count: 20},
			{Average: 6, Count: 10},
		},
	}
	insights := codexRadarInsights{Recommendations: []codexRadarRecommendation{{
		Key:   "daily_development",
		Title: "日常开发",
		Items: []codexRadarInsightItem{{Model: "gpt-5.6-sol", Effort: "high", IQ: 101.25}},
	}}}

	payload := buildModelIntelligencePayload(metrics, ratings, insights, time.Unix(100, 0))
	require.Len(t, payload.Points, 2)
	require.Equal(t, "GPT-5.6 Terra max", payload.Rankings[0].Label)
	require.Equal(t, 3.7, payload.Community.OverallScore)
	require.Equal(t, 73.3, payload.Community.PositiveRate)
	require.Equal(t, 30, payload.Community.RatingCount)
	require.Equal(t, "GPT-5.6 Sol high", payload.Insights[0].ModelLabel)
}

func TestBuildModelIntelligencePayloadUsesPassedAndTotal(t *testing.T) {
	metrics := codexRadarMetrics{
		Mode: "equal_latest_3",
		Points: []codexRadarMetricPoint{{
			Model:  "gpt-5.6-sol",
			Effort: "high",
			IQ:     90,
			Passed: 90,
			Total:  100,
		}},
	}

	payload := buildModelIntelligencePayload(metrics, codexRadarRatings{}, codexRadarInsights{}, time.Unix(100, 0))
	require.Len(t, payload.Points, 1)
	require.Equal(t, 90.0, payload.Points[0].Passed)
	require.Equal(t, 100.0, payload.Points[0].Total)
}

func TestBuildModelIntelligencePayloadFromPublished(t *testing.T) {
	published := codexRadarPublishedSnapshot{
		Schema:          2,
		SourceUpdatedAt: "2026-08-12T00:00:00Z",
		Runs24hTotal:    120,
		Runs48hTotal:    240,
		RunsTotal:       1000,
		Points: []codexRadarPublishedPoint{
			{
				Model: "gpt-5.6-sol", Effort: "high", IQ: 101.25,
				Passed: 81, ValidTasks: 112, CacheHitRate: 0.97,
				Runs24h: 30, Runs48h: 60, RunsTotal: 300,
			},
		},
	}
	payload := buildModelIntelligencePayloadFromPublished(
		published,
		codexRadarRatings{},
		codexRadarInsights{},
		time.Unix(100, 0),
	)
	require.True(t, payload.Stale)
	require.Equal(t, "published_snapshot", payload.Mode)
	require.Equal(t, 120, payload.Runs24hTotal)
	require.Len(t, payload.Points, 1)
	require.Equal(t, 81.0, payload.Points[0].Passed)
	require.Equal(t, 112.0, payload.Points[0].Total)
	require.Equal(t, 97.0, payload.Points[0].CacheHitRate)
}

func TestModelIntelligenceSnapshotRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "radar", "snapshot.json")
	t.Setenv("MODEL_INTELLIGENCE_CACHE_FILE", path)
	payload := ModelIntelligencePayload{
		Source:      "CodexRadar",
		RefreshedAt: "2026-08-11T08:00:00Z",
		Points: []ModelIntelligencePoint{{
			Key: "gpt-5.6-sol-high",
			IQ:  101.25,
		}},
		Rankings: []ModelIntelligencePoint{{
			Key: "gpt-5.6-sol-high",
			IQ:  101.25,
		}},
	}

	require.NoError(t, writeModelIntelligenceSnapshot(payload))
	loaded, err := readModelIntelligenceSnapshot()
	require.NoError(t, err)
	require.True(t, loaded.Stale)
	require.Equal(t, payload.Points, loaded.Points)
	require.Equal(t, payload.Rankings, loaded.Rankings)
	info, err := os.Stat(path)
	require.NoError(t, err)
	require.Equal(t, os.FileMode(0644), info.Mode().Perm())
}

func TestModelIntelligenceSnapshotRejectsEmptyData(t *testing.T) {
	path := filepath.Join(t.TempDir(), "snapshot.json")
	t.Setenv("MODEL_INTELLIGENCE_CACHE_FILE", path)
	require.NoError(t, os.WriteFile(path, []byte(`{"source":"CodexRadar"}`), 0644))

	_, err := readModelIntelligenceSnapshot()
	require.ErrorContains(t, err, "no usable points")
}
