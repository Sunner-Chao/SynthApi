package service

import (
	"context"
	"encoding/xml"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
)

const playgroundWebSearchMaxResults = 5

type playgroundSearchRSS struct {
	Channel struct {
		Items []playgroundSearchItem `xml:"item"`
	} `xml:"channel"`
}

type playgroundSearchItem struct {
	Title       string `xml:"title"`
	Link        string `xml:"link"`
	Description string `xml:"description"`
	PubDate     string `xml:"pubDate"`
}

func EnrichPlaygroundRequestWithWebSearch(ctx context.Context, req *dto.GeneralOpenAIRequest) (bool, error) {
	if req == nil || req.WebSearchOptions == nil {
		return false, nil
	}

	query := latestUserSearchQuery(req.Messages)
	if query == "" {
		return false, nil
	}

	results, err := searchBingRSS(ctx, query)
	if err != nil || len(results) == 0 {
		return false, err
	}

	req.Messages = append([]dto.Message{{
		Role:    req.GetSystemRoleName(),
		Content: buildPlaygroundSearchContext(query, results),
	}}, req.Messages...)

	return true, nil
}

func latestUserSearchQuery(messages []dto.Message) string {
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Role != "user" {
			continue
		}
		query := strings.TrimSpace(messages[i].StringContent())
		query = strings.Join(strings.Fields(query), " ")
		if len([]rune(query)) > 240 {
			query = string([]rune(query)[:240])
		}
		return query
	}
	return ""
}

func searchBingRSS(ctx context.Context, query string) ([]playgroundSearchItem, error) {
	searchURL := "https://www.bing.com/search?format=rss&q=" + url.QueryEscape(query)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, searchURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; SynthAPI-WebSearch/1.0)")
	req.Header.Set("Accept", "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8")

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("web search failed with status %d", resp.StatusCode)
	}

	var rss playgroundSearchRSS
	if err := xml.NewDecoder(resp.Body).Decode(&rss); err != nil {
		return nil, err
	}

	items := make([]playgroundSearchItem, 0, playgroundWebSearchMaxResults)
	for _, item := range rss.Channel.Items {
		item.Title = strings.TrimSpace(item.Title)
		item.Link = strings.TrimSpace(item.Link)
		item.Description = strings.TrimSpace(item.Description)
		item.PubDate = strings.TrimSpace(item.PubDate)
		if item.Title == "" || item.Link == "" {
			continue
		}
		items = append(items, item)
		if len(items) >= playgroundWebSearchMaxResults {
			break
		}
	}

	return items, nil
}

func buildPlaygroundSearchContext(query string, results []playgroundSearchItem) string {
	var b strings.Builder
	b.WriteString("你可以使用以下实时联网搜索结果回答用户问题。请优先依据这些结果，保留来源链接；如果搜索结果不足以支持结论，请明确说明不确定。\n")
	b.WriteString("搜索关键词：")
	b.WriteString(query)
	b.WriteString("\n搜索结果：\n")
	for i, item := range results {
		b.WriteString(fmt.Sprintf("%d. %s\n", i+1, item.Title))
		b.WriteString("   URL: ")
		b.WriteString(item.Link)
		b.WriteString("\n")
		if item.PubDate != "" {
			b.WriteString("   时间: ")
			b.WriteString(item.PubDate)
			b.WriteString("\n")
		}
		if item.Description != "" {
			b.WriteString("   摘要: ")
			b.WriteString(item.Description)
			b.WriteString("\n")
		}
	}

	data, err := common.Marshal(map[string]any{
		"source":  "bing_rss",
		"query":   query,
		"results": results,
	})
	if err == nil {
		b.WriteString("\n结构化搜索数据：")
		b.WriteString(string(data))
	}
	return b.String()
}
