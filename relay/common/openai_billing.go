package common

import (
	"regexp"
	"strings"
)

// Verified against sub2api and its LiteLLM catalog on 2026-09-22. These
// multipliers adjust the site's configured base prices; they are not prices.
const OpenAILongContextThreshold = 272000

var openAIDatedModel = regexp.MustCompile(`-(?:\d{4}-\d{2}-\d{2}|\d{8})$`)

func (info *RelayInfo) openAIBillingModel() string {
	name := info.OriginModelName
	if info.ChannelMeta != nil && info.UpstreamModelName != "" {
		name = info.UpstreamModelName
	}
	name = strings.ToLower(strings.TrimSpace(name))
	name = strings.TrimSuffix(name, "-openai-compact")
	return openAIDatedModel.ReplaceAllString(name, "")
}

func (info *RelayInfo) SetOpenAIBillingContext(inputTokens int) {
	if info == nil {
		return
	}
	info.BillingContextTokens = inputTokens
	info.BillingLongContext = false
	if !info.PriceData.UsePrice && info.TieredBillingSnapshot == nil && inputTokens > OpenAILongContextThreshold {
		switch info.openAIBillingModel() {
		case "gpt-6-astra", "gpt-6", "gpt-5.6", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.6-cyber", "gpt-5.5", "gpt-5.5-pro", "gpt-5.4", "gpt-5.4-pro":
			info.BillingLongContext = true
		}
	}
	info.refreshOpenAIBillingRates()
}

func (info *RelayInfo) refreshOpenAIBillingRates() {
	input, output, cache := 1.0, 1.0, 1.0
	reasons := make([]string, 0, 2)
	// Explicit expressions are complete billing contracts. Never add hidden
	// multipliers on top of them, or on fixed-price/image requests.
	if !info.PriceData.UsePrice && info.TieredBillingSnapshot == nil {
		name := info.openAIBillingModel()
		if strings.HasPrefix(name, "gpt-") && !strings.HasPrefix(name, "gpt-image-") {
			switch info.BillingServiceTier {
			case "priority", "ultrafast":
				switch name {
				case "gpt-5.5":
					input, output, cache = 2.5, 2.5, 2.5
				case "gpt-5.4", "gpt-5.6", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-6", "gpt-6-astra":
					input, output, cache = 2, 2, 2
				}
				if input > 1 {
					reasons = append(reasons, "openai_fast_mode")
				}
			case "flex":
				input, output, cache = 0.5, 0.5, 0.5
				reasons = append(reasons, "openai_flex_mode")
			}
		}
		if info.BillingLongContext {
			input, output, cache = input*2, output*1.5, cache*2
			reasons = append(reasons, "openai_long_context")
		}
	}
	info.BillingInputMultiplier, info.BillingOutputMultiplier, info.BillingCacheMultiplier = input, output, cache
	info.PriceData.BillingMultiplier = input
	info.PriceData.BillingInputMultiplier, info.PriceData.BillingOutputMultiplier, info.PriceData.BillingCacheMultiplier = input, output, cache
	info.PriceData.BillingMultiplierReason = strings.Join(reasons, "+")
}
