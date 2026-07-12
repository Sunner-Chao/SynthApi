package constant

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSupportsUpstreamRequestGzip(t *testing.T) {
	t.Parallel()

	for _, channelType := range []int{ChannelTypeOpenAI, ChannelTypeAzure, ChannelTypeAnthropic, ChannelTypeXai} {
		require.True(t, SupportsUpstreamRequestGzip(channelType), "channel type %d", channelType)
		require.True(t, DefaultUpstreamRequestGzipEnabled(channelType), "channel type %d", channelType)
	}
	for _, channelType := range []int{ChannelTypeAws, ChannelTypeTencent, ChannelTypeJimeng, ChannelTypeCodex, ChannelTypeSora} {
		require.False(t, SupportsUpstreamRequestGzip(channelType), "channel type %d", channelType)
		require.False(t, DefaultUpstreamRequestGzipEnabled(channelType), "channel type %d", channelType)
	}
}
