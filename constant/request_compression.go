package constant

// SupportsUpstreamRequestGzip reports whether a channel type can safely send
// a gateway-generated JSON body through the shared HTTP request path. Upstream
// acceptance is still controlled by the channel setting; signed, SDK-driven,
// multipart, task and WebSocket transports must remain absent from this list.
func SupportsUpstreamRequestGzip(channelType int) bool {
	switch channelType {
	case ChannelTypeOpenAI,
		ChannelTypeAzure,
		ChannelTypeOpenAIMax,
		ChannelTypeOhMyGPT,
		ChannelTypeCustom,
		ChannelTypeAILS,
		ChannelTypeAIProxy,
		ChannelTypeAPI2GPT,
		ChannelTypeAIGC2D,
		ChannelTypeAnthropic,
		ChannelType360,
		ChannelTypeOpenRouter,
		ChannelTypeFastGPT,
		ChannelTypeLingYiWanWu,
		ChannelTypeXinference,
		ChannelTypeXai:
		return true
	default:
		return false
	}
}

// DefaultUpstreamRequestGzipEnabled is intentionally separate from structural
// support so a future adapter can opt in without silently changing legacy
// channels. Current supported JSON HTTP adapters default to lossless gzip;
// existing channels are materialized to explicit true/false during rollout.
func DefaultUpstreamRequestGzipEnabled(channelType int) bool {
	return SupportsUpstreamRequestGzip(channelType)
}
