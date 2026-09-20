package service

import (
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"sync"
	"unicode"

	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/setting"
	"golang.org/x/text/unicode/norm"
)

const (
	sensitiveHitKeyword = "keyword"
	sensitiveHitRegex   = "regex"
	sensitiveHitIntent  = "intent"
)

type SensitiveRiskHit struct {
	Type    string
	Name    string
	Matched string
	Score   int
}

type SensitiveRiskScanResult struct {
	Blocked bool
	Score   int
	Hits    []SensitiveRiskHit
	Words   []string
}

type sensitiveIntentRule struct {
	Name   string
	Groups [][]string
	Score  int
}

type sensitiveRegexRule struct {
	Name    string
	Pattern string
	Regex   *regexp.Regexp
	Score   int
}

var compiledSensitiveRegexRules sync.Map

func CheckSensitiveMessages(messages []dto.Message) ([]string, error) {
	if len(messages) == 0 {
		return nil, nil
	}

	for _, message := range messages {
		arrayContent := message.ParseContent()
		for _, m := range arrayContent {
			if m.Type == "image_url" {
				// TODO: check image url
				continue
			}
			// 检查 text 是否为空
			if m.Text == "" {
				continue
			}
			if ok, words := SensitiveWordContains(m.Text); ok {
				return words, errors.New("sensitive words detected")
			}
		}
	}
	return nil, nil
}

func CheckSensitiveText(text string) (bool, []string) {
	result := ScanSensitiveRiskText(text)
	return result.Blocked, result.Words
}

// SensitiveWordContains 是否包含敏感词，返回是否包含敏感词和敏感词列表
func SensitiveWordContains(text string) (bool, []string) {
	result := ScanSensitiveRiskText(text)
	return result.Blocked, result.Words
}

func ScanSensitiveRiskText(text string) SensitiveRiskScanResult {
	if len(text) == 0 {
		return SensitiveRiskScanResult{}
	}

	normalizedText := normalizeSensitiveText(text, false)
	compactText := normalizeSensitiveText(text, true)
	hits := make([]SensitiveRiskHit, 0)
	seen := make(map[string]struct{})

	if len(setting.SensitiveWords) > 0 {
		if ok, words := AcSearch(normalizedText, normalizedSensitiveDict(setting.SensitiveWords), false); ok {
			for _, word := range words {
				addSensitiveHit(&hits, seen, SensitiveRiskHit{
					Type:    sensitiveHitKeyword,
					Name:    "blocked_keyword",
					Matched: word,
					Score:   100,
				})
			}
		}
		if compactText != normalizedText {
			if ok, words := AcSearch(compactText, compactSensitiveDict(setting.SensitiveWords), false); ok {
				for _, word := range words {
					addSensitiveHit(&hits, seen, SensitiveRiskHit{
						Type:    sensitiveHitKeyword,
						Name:    "blocked_keyword_obfuscated",
						Matched: word,
						Score:   100,
					})
				}
			}
		}
	}

	if setting.SensitiveRiskScanEnabled {
		for _, hit := range scanSensitiveRegexRules(text, normalizedText) {
			addSensitiveHit(&hits, seen, hit)
		}
		for _, hit := range scanSensitiveIntentRules(normalizedText, compactText) {
			addSensitiveHit(&hits, seen, hit)
		}
		applySensitiveAllowRules(&hits, normalizedText, compactText)
	}

	sort.SliceStable(hits, func(i, j int) bool {
		if hits[i].Score == hits[j].Score {
			return hits[i].Name < hits[j].Name
		}
		return hits[i].Score > hits[j].Score
	})

	score := 0
	words := make([]string, 0, len(hits))
	for _, hit := range hits {
		if hit.Type != "allow" && hit.Score > score {
			score = hit.Score
		}
		words = append(words, formatSensitiveHit(hit))
	}

	threshold := setting.SensitiveRiskThreshold
	if threshold <= 0 {
		threshold = 100
	}
	return SensitiveRiskScanResult{
		Blocked: score >= threshold,
		Score:   score,
		Hits:    hits,
		Words:   RemoveDuplicate(words),
	}
}

// SensitiveWordReplace 敏感词替换，返回是否包含敏感词和替换后的文本
func SensitiveWordReplace(text string, returnImmediately bool) (bool, []string, string) {
	if len(setting.SensitiveWords) == 0 {
		return false, nil, text
	}
	checkText := strings.ToLower(text)
	m := getOrBuildAC(setting.SensitiveWords)
	hits := m.MultiPatternSearch([]rune(checkText), returnImmediately)
	if len(hits) > 0 {
		words := make([]string, 0, len(hits))
		var builder strings.Builder
		builder.Grow(len(text))
		lastPos := 0

		for _, hit := range hits {
			pos := hit.Pos
			word := string(hit.Word)
			builder.WriteString(text[lastPos:pos])
			builder.WriteString("**###**")
			lastPos = pos + len(word)
			words = append(words, word)
		}
		builder.WriteString(text[lastPos:])
		return true, words, builder.String()
	}
	return false, nil, text
}

func normalizedSensitiveDict(dict []string) []string {
	result := make([]string, 0, len(dict))
	for _, word := range dict {
		word = normalizeSensitiveText(word, false)
		if word != "" {
			result = append(result, word)
		}
	}
	return result
}

func compactSensitiveDict(dict []string) []string {
	result := make([]string, 0, len(dict))
	for _, word := range dict {
		word = normalizeSensitiveText(word, true)
		if word != "" {
			result = append(result, word)
		}
	}
	return result
}

func normalizeSensitiveText(text string, compact bool) string {
	text = strings.ToLower(norm.NFKC.String(text))
	var builder strings.Builder
	builder.Grow(len(text))
	for _, r := range text {
		switch {
		case unicode.IsLetter(r), unicode.IsDigit(r), isCJKRune(r):
			builder.WriteRune(r)
		case compact:
			continue
		default:
			builder.WriteRune(' ')
		}
	}
	return strings.Join(strings.Fields(builder.String()), " ")
}

func isCJKRune(r rune) bool {
	return (r >= 0x4E00 && r <= 0x9FFF) ||
		(r >= 0x3400 && r <= 0x4DBF) ||
		(r >= 0x20000 && r <= 0x2A6DF) ||
		(r >= 0x2A700 && r <= 0x2B73F) ||
		(r >= 0x2B740 && r <= 0x2B81F) ||
		(r >= 0x2B820 && r <= 0x2CEAF)
}

func scanSensitiveIntentRules(normalizedText string, compactText string) []SensitiveRiskHit {
	rules := parseSensitiveIntentRules(setting.SensitiveIntentRules)
	if len(rules) == 0 {
		return nil
	}
	hits := make([]SensitiveRiskHit, 0)
	for _, rule := range rules {
		matchedTerms := make([]string, 0, len(rule.Groups))
		matched := true
		for _, group := range rule.Groups {
			term := firstMatchedSensitiveTerm(normalizedText, compactText, group)
			if term == "" {
				matched = false
				break
			}
			matchedTerms = append(matchedTerms, term)
		}
		if matched {
			score := rule.Score
			if score <= 0 {
				score = 100
			}
			hits = append(hits, SensitiveRiskHit{
				Type:    sensitiveHitIntent,
				Name:    rule.Name,
				Matched: strings.Join(matchedTerms, " + "),
				Score:   score,
			})
		}
	}
	return hits
}

func applySensitiveAllowRules(hits *[]SensitiveRiskHit, normalizedText string, compactText string) {
	if len(*hits) == 0 || strings.TrimSpace(setting.SensitiveRiskAllowRules) == "" {
		return
	}
	allowHits := scanSensitiveAllowRules(normalizedText, compactText)
	if len(allowHits) == 0 {
		return
	}
	reduction := 0
	for _, hit := range allowHits {
		reduction += hit.Score
	}
	if reduction <= 0 {
		return
	}
	for i := range *hits {
		if isHardSensitiveHit((*hits)[i]) {
			continue
		}
		(*hits)[i].Score -= reduction
		if (*hits)[i].Score < 0 {
			(*hits)[i].Score = 0
		}
	}
	*hits = append(*hits, allowHits...)
}

func scanSensitiveAllowRules(normalizedText string, compactText string) []SensitiveRiskHit {
	rules := parseSensitiveIntentRules(setting.SensitiveRiskAllowRules)
	if len(rules) == 0 {
		return nil
	}
	hits := make([]SensitiveRiskHit, 0)
	for _, rule := range rules {
		matchedTerms := make([]string, 0, len(rule.Groups))
		matched := true
		for _, group := range rule.Groups {
			term := firstMatchedSensitiveTerm(normalizedText, compactText, group)
			if term == "" {
				matched = false
				break
			}
			matchedTerms = append(matchedTerms, term)
		}
		if matched {
			score := rule.Score
			if score <= 0 {
				score = 40
			}
			hits = append(hits, SensitiveRiskHit{
				Type:    "allow",
				Name:    rule.Name,
				Matched: strings.Join(matchedTerms, " + "),
				Score:   score,
			})
		}
	}
	return hits
}

func isHardSensitiveHit(hit SensitiveRiskHit) bool {
	if hit.Type == sensitiveHitRegex {
		return true
	}
	hardNames := []string{
		"凭证窃取",
		"恶意代码",
		"诈骗",
		"赌博",
		"毒品",
		"色情",
		"未成年",
		"黑灰产",
		"洗钱",
		"隐私侵犯",
		"开盒",
		"武器",
		"自残",
		"极端暴力",
		"恐怖",
	}
	for _, name := range hardNames {
		if strings.Contains(hit.Name, name) {
			return true
		}
	}
	return hit.Score >= 140
}

func firstMatchedSensitiveTerm(normalizedText string, compactText string, terms []string) string {
	for _, term := range terms {
		term = normalizeSensitiveText(term, false)
		if term == "" {
			continue
		}
		compactTerm := normalizeSensitiveText(term, true)
		if compactTerm != "" && strings.Contains(compactText, compactTerm) {
			return term
		}
		if strings.Contains(normalizedText, term) {
			return term
		}
	}
	return ""
}

func parseSensitiveIntentRules(raw string) []sensitiveIntentRule {
	lines := strings.Split(raw, "\n")
	rules := make([]sensitiveIntentRule, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		name, expr, ok := strings.Cut(line, ":")
		if !ok {
			name, expr, ok = strings.Cut(line, "：")
		}
		if !ok {
			continue
		}
		name = strings.TrimSpace(name)
		score := 100
		if before, after, ok := strings.Cut(name, "@"); ok {
			name = strings.TrimSpace(before)
			if parsed, err := parsePositiveInt(strings.TrimSpace(after)); err == nil && parsed > 0 {
				score = parsed
			}
		}
		if name == "" {
			continue
		}
		groupParts := strings.Split(expr, "+")
		groups := make([][]string, 0, len(groupParts))
		for _, part := range groupParts {
			part = strings.TrimSpace(part)
			if part == "" {
				continue
			}
			terms := splitSensitiveRuleTerms(part)
			if len(terms) > 0 {
				groups = append(groups, terms)
			}
		}
		if len(groups) >= 2 {
			rules = append(rules, sensitiveIntentRule{
				Name:   name,
				Groups: groups,
				Score:  score,
			})
		}
	}
	return rules
}

func splitSensitiveRuleTerms(raw string) []string {
	parts := strings.FieldsFunc(raw, func(r rune) bool {
		return r == '|' || r == ',' || r == '，'
	})
	terms := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			terms = append(terms, part)
		}
	}
	return terms
}

func scanSensitiveRegexRules(originalText string, normalizedText string) []SensitiveRiskHit {
	rules := parseSensitiveRegexRules(setting.SensitiveRegexRules)
	if len(rules) == 0 {
		return nil
	}
	hits := make([]SensitiveRiskHit, 0)
	for _, rule := range rules {
		match := rule.Regex.FindString(originalText)
		if match == "" {
			match = rule.Regex.FindString(normalizedText)
		}
		if match == "" {
			continue
		}
		score := rule.Score
		if score <= 0 {
			score = 100
		}
		hits = append(hits, SensitiveRiskHit{
			Type:    sensitiveHitRegex,
			Name:    rule.Name,
			Matched: truncateSensitiveMatch(match),
			Score:   score,
		})
	}
	return hits
}

func parseSensitiveRegexRules(raw string) []sensitiveRegexRule {
	key := raw
	if cached, ok := compiledSensitiveRegexRules.Load(key); ok {
		if rules, ok := cached.([]sensitiveRegexRule); ok {
			return rules
		}
	}
	lines := strings.Split(raw, "\n")
	rules := make([]sensitiveRegexRule, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		name, pattern, ok := strings.Cut(line, ":")
		if !ok {
			name, pattern, ok = strings.Cut(line, "：")
		}
		if !ok {
			continue
		}
		name = strings.TrimSpace(name)
		score := 100
		if before, after, ok := strings.Cut(name, "@"); ok {
			name = strings.TrimSpace(before)
			if parsed, err := parsePositiveInt(strings.TrimSpace(after)); err == nil && parsed > 0 {
				score = parsed
			}
		}
		if name == "" {
			continue
		}
		pattern = strings.TrimSpace(pattern)
		if pattern == "" {
			continue
		}
		compiled, err := regexp.Compile(pattern)
		if err != nil {
			continue
		}
		rules = append(rules, sensitiveRegexRule{
			Name:    name,
			Pattern: pattern,
			Regex:   compiled,
			Score:   score,
		})
	}
	compiledSensitiveRegexRules.Store(key, rules)
	return rules
}

func addSensitiveHit(hits *[]SensitiveRiskHit, seen map[string]struct{}, hit SensitiveRiskHit) {
	if hit.Matched == "" {
		return
	}
	key := hit.Type + "\x00" + hit.Name + "\x00" + hit.Matched
	if _, ok := seen[key]; ok {
		return
	}
	seen[key] = struct{}{}
	*hits = append(*hits, hit)
}

func formatSensitiveHit(hit SensitiveRiskHit) string {
	switch hit.Type {
	case sensitiveHitKeyword:
		return hit.Matched
	default:
		return fmt.Sprintf("%s:%s[%s]", hit.Type, hit.Name, hit.Matched)
	}
}

func truncateSensitiveMatch(value string) string {
	runes := []rune(strings.TrimSpace(value))
	if len(runes) <= 80 {
		return string(runes)
	}
	return string(runes[:80]) + "..."
}

func parsePositiveInt(value string) (int, error) {
	var result int
	for _, r := range value {
		if r < '0' || r > '9' {
			return 0, errors.New("invalid integer")
		}
		result = result*10 + int(r-'0')
	}
	return result, nil
}
