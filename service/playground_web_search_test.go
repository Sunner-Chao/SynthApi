package service

import (
	"context"
	"testing"

	"github.com/QuantumNous/new-api/dto"
)

func TestEnrichPlaygroundRequestWithWebSearch(t *testing.T) {
	req := &dto.GeneralOpenAIRequest{
		Model: "gpt-5.5",
		Messages: []dto.Message{{
			Role:    "user",
			Content: "SynthAPI test query",
		}},
		WebSearchOptions: &dto.WebSearchOptions{SearchContextSize: "medium"},
	}

	enriched, err := EnrichPlaygroundRequestWithWebSearch(context.Background(), req)
	if err != nil {
		t.Skipf("web search provider unavailable: %v", err)
	}
	if !enriched {
		t.Skip("web search provider returned no results")
	}
	if len(req.Messages) < 2 {
		t.Fatalf("expected injected search context, got %d messages", len(req.Messages))
	}
	if req.Messages[0].Role != "developer" {
		t.Fatalf("expected developer search context for gpt-5 model, got %q", req.Messages[0].Role)
	}
	if req.Messages[0].StringContent() == "" {
		t.Fatal("expected non-empty search context")
	}
}
