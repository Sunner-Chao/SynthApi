package common

import (
	"bytes"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"math/rand"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/stretchr/testify/require"
	"golang.org/x/sync/semaphore"
)

func outboundBodyTestInfo(channelType int, enabled bool, minBytes int64) *RelayInfo {
	enabledValue := enabled
	return &RelayInfo{
		ChannelMeta: &ChannelMeta{
			ChannelType: channelType,
			ChannelSetting: dto.ChannelSettings{
				UpstreamRequestGzipEnabled:  &enabledValue,
				UpstreamRequestGzipMinBytes: minBytes,
			},
		},
	}
}

func TestNewOutboundJSONBodyCompressesEligibleOpenAIRequest(t *testing.T) {
	const targetSize = 128 * 1024
	payload := make([]byte, 0, targetSize)
	for len(payload) < targetSize {
		payload = append(payload, []byte(`{"message":"repeated context"}`)...)
	}
	payload = payload[:targetSize]
	info := outboundBodyTestInfo(constant.ChannelTypeOpenAI, true, 1024)

	body, size, closer, err := NewOutboundJSONBody(context.Background(), payload, info)
	require.NoError(t, err)
	require.NotNil(t, closer)
	t.Cleanup(func() { require.NoError(t, closer.Close()) })
	require.Equal(t, size, info.UpstreamRequestBodyCompressedSize)
	require.Equal(t, int64(len(payload)), info.UpstreamRequestBodyOriginalSize)
	require.Less(t, size, int64(len(payload)))
	require.Positive(t, info.UpstreamRequestCompressionDuration)
	require.GreaterOrEqual(t, info.UpstreamRequestCompressionQueueDuration, time.Duration(0))

	reader, err := gzip.NewReader(body)
	require.NoError(t, err)
	decoded, err := io.ReadAll(reader)
	require.NoError(t, err)
	require.NoError(t, reader.Close())
	require.Equal(t, payload, decoded)
}

func TestNewOutboundJSONBodyLeavesIneligibleRequestsPlain(t *testing.T) {
	tests := []struct {
		name        string
		channelType int
		enabled     bool
		minBytes    int64
	}{
		{name: "disabled", channelType: constant.ChannelTypeOpenAI, enabled: false, minBytes: 1},
		{name: "below threshold", channelType: constant.ChannelTypeOpenAI, enabled: true, minBytes: 4096},
		{name: "unsupported channel", channelType: constant.ChannelTypeAws, enabled: true, minBytes: 1},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			payload := []byte(`{"message":"plain"}`)
			info := outboundBodyTestInfo(test.channelType, test.enabled, test.minBytes)

			body, size, closer, err := NewOutboundJSONBody(context.Background(), payload, info)
			require.NoError(t, err)
			require.NotNil(t, closer)
			defer closer.Close()
			require.Equal(t, int64(len(payload)), size)
			require.Zero(t, info.UpstreamRequestBodyCompressedSize)
			plain, err := io.ReadAll(body)
			require.NoError(t, err)
			require.Equal(t, payload, plain)
		})
	}
}

func TestShouldGzipOutboundJSONHonorsDefaultsAndSafetySkips(t *testing.T) {
	trueValue := true
	falseValue := false
	tests := []struct {
		name string
		info *RelayInfo
		want bool
	}{
		{
			name: "supported channel inherits enabled default",
			info: &RelayInfo{ChannelMeta: &ChannelMeta{
				ChannelType:    constant.ChannelTypeAnthropic,
				ChannelSetting: dto.ChannelSettings{UpstreamRequestGzipMinBytes: 1},
			}},
			want: true,
		},
		{
			name: "explicit false overrides default",
			info: &RelayInfo{ChannelMeta: &ChannelMeta{
				ChannelType: constant.ChannelTypeOpenAI,
				ChannelSetting: dto.ChannelSettings{
					UpstreamRequestGzipEnabled:  &falseValue,
					UpstreamRequestGzipMinBytes: 1,
				},
			}},
		},
		{
			name: "unsupported channel stays disabled",
			info: &RelayInfo{ChannelMeta: &ChannelMeta{
				ChannelType: constant.ChannelTypeAws,
				ChannelSetting: dto.ChannelSettings{
					UpstreamRequestGzipEnabled:  &trueValue,
					UpstreamRequestGzipMinBytes: 1,
				},
			}},
		},
		{
			name: "imported account stays disabled",
			info: &RelayInfo{ChannelMeta: &ChannelMeta{
				ChannelType:          constant.ChannelTypeOpenAI,
				ChannelSetting:       dto.ChannelSettings{UpstreamRequestGzipMinBytes: 1},
				ChannelOtherSettings: dto.ChannelOtherSettings{ImportedAccountPlatform: "codex"},
			}},
		},
		{
			name: "pass through stays disabled",
			info: &RelayInfo{ChannelMeta: &ChannelMeta{
				ChannelType: constant.ChannelTypeOpenAI,
				ChannelSetting: dto.ChannelSettings{
					PassThroughBodyEnabled:      true,
					UpstreamRequestGzipMinBytes: 1,
				},
			}},
		},
		{
			name: "content encoding override stays disabled",
			info: &RelayInfo{ChannelMeta: &ChannelMeta{
				ChannelType:     constant.ChannelTypeOpenAI,
				ChannelSetting:  dto.ChannelSettings{UpstreamRequestGzipMinBytes: 1},
				HeadersOverride: map[string]interface{}{"content-encoding": "br"},
			}},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			require.Equal(t, test.want, shouldGzipOutboundJSON(test.info, 1024))
		})
	}
}

func TestNewOutboundJSONBodyHonorsCanceledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	info := outboundBodyTestInfo(constant.ChannelTypeOpenAI, true, 1)

	body, size, closer, err := NewOutboundJSONBody(ctx, []byte(`{"message":"cancel"}`), info)
	require.ErrorIs(t, err, context.Canceled)
	require.Nil(t, body)
	require.Zero(t, size)
	require.Nil(t, closer)
}

func TestSelectUpstreamGzipLevelUsesLevelFiveForMediumCompressibility(t *testing.T) {
	payload := mixedCompressibilityPayload(adaptiveGzipMinBytes)

	level, queueDuration, err := selectUpstreamGzipLevel(context.Background(), payload)
	require.NoError(t, err)
	require.Equal(t, gzipAdaptiveLevel, level)
	require.GreaterOrEqual(t, queueDuration, time.Duration(0))
}

func TestSelectUpstreamGzipLevelUsesBestSpeedOutsideAdaptiveRange(t *testing.T) {
	tests := []struct {
		name    string
		payload func() []byte
	}{
		{
			name: "below adaptive size",
			payload: func() []byte {
				return mixedCompressibilityPayload(adaptiveGzipMinBytes - 1)
			},
		},
		{
			name: "highly compressible",
			payload: func() []byte {
				return repeatedPayload(adaptiveGzipMinBytes)
			},
		},
		{
			name: "base64 like",
			payload: func() []byte {
				return base64LikePayload(adaptiveGzipMinBytes)
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			level, queueDuration, err := selectUpstreamGzipLevel(context.Background(), test.payload())
			require.NoError(t, err)
			require.Equal(t, gzip.BestSpeed, level)
			require.GreaterOrEqual(t, queueDuration, time.Duration(0))
		})
	}
}

func TestCreateGzipBodyStorageRoundTripsLevelsOneAndFive(t *testing.T) {
	payload := repeatedPayload(256 * 1024)

	for _, level := range []int{gzip.BestSpeed, gzipAdaptiveLevel} {
		t.Run(string(rune('0'+level)), func(t *testing.T) {
			storage, err := createGzipBodyStorage(context.Background(), bytes.NewReader(payload), int64(len(payload)), level)
			require.NoError(t, err)
			defer storage.Close()

			reader, err := gzip.NewReader(storage)
			require.NoError(t, err)
			decoded, err := io.ReadAll(reader)
			require.NoError(t, err)
			require.NoError(t, reader.Close())
			require.Equal(t, payload, decoded)
		})
	}
}

func TestNewOutboundJSONBodyFallsBackWhenCompressionBenefitIsInsufficient(t *testing.T) {
	payload := make([]byte, 256*1024)
	_, err := rand.New(rand.NewSource(1)).Read(payload)
	require.NoError(t, err)
	info := outboundBodyTestInfo(constant.ChannelTypeOpenAI, true, 1)

	body, size, closer, err := NewOutboundJSONBody(context.Background(), payload, info)
	require.NoError(t, err)
	require.NotNil(t, closer)
	defer closer.Close()
	require.Equal(t, int64(len(payload)), size)
	require.Zero(t, info.UpstreamRequestBodyOriginalSize)
	require.Zero(t, info.UpstreamRequestBodyCompressedSize)
	require.Zero(t, info.UpstreamRequestCompressionDuration)
	require.Zero(t, info.UpstreamRequestCompressionQueueDuration)

	plain, err := io.ReadAll(body)
	require.NoError(t, err)
	require.Equal(t, payload, plain)
}

func TestMinimumGzipSavingsBoundary(t *testing.T) {
	const smallOriginal = int64(1024 * 1024)
	require.Equal(t, int64(minimumGzipSavingsBytes), minimumGzipSavings(smallOriginal))
	require.True(t, gzipBenefitSufficient(smallOriginal, smallOriginal-minimumGzipSavingsBytes))
	require.False(t, gzipBenefitSufficient(smallOriginal, smallOriginal-minimumGzipSavingsBytes+1))

	const largeOriginal = int64(10*1024*1024 + 1)
	expectedOnePercent := (largeOriginal + 99) / 100
	require.Equal(t, expectedOnePercent, minimumGzipSavings(largeOriginal))
	require.True(t, gzipBenefitSufficient(largeOriginal, largeOriginal-expectedOnePercent))
	require.False(t, gzipBenefitSufficient(largeOriginal, largeOriginal-expectedOnePercent+1))
}

func TestGzipActiveDurationExcludesQueueTime(t *testing.T) {
	require.Equal(t, 17*time.Millisecond, gzipActiveDuration(20*time.Millisecond, 3*time.Millisecond))
	require.Zero(t, gzipActiveDuration(3*time.Millisecond, 3*time.Millisecond))
	require.Zero(t, gzipActiveDuration(2*time.Millisecond, 3*time.Millisecond))
}

func TestAcquireGzipCapacityHonorsCancellationAndRelease(t *testing.T) {
	capacity := semaphore.NewWeighted(2)
	_, err := acquireGzipCapacity(context.Background(), capacity, 2)
	require.NoError(t, err)

	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan error, 1)
	go func() {
		_, err := acquireGzipCapacity(ctx, capacity, 1)
		result <- err
	}()
	cancel()

	select {
	case err := <-result:
		require.ErrorIs(t, err, context.Canceled)
	case <-time.After(time.Second):
		t.Fatal("weighted gzip acquisition did not observe cancellation")
	}

	capacity.Release(2)
	_, err = acquireGzipCapacity(context.Background(), capacity, 2)
	require.NoError(t, err)
	capacity.Release(2)
}

func TestUpstreamGzipConcurrencyCapacityTracksAvailableCPU(t *testing.T) {
	tests := []struct {
		gomaxprocs int
		want       int64
	}{
		{gomaxprocs: 0, want: 1},
		{gomaxprocs: 1, want: 1},
		{gomaxprocs: 2, want: 2},
		{gomaxprocs: 4, want: 4},
		{gomaxprocs: 16, want: maxAutoUpstreamGzipCapacity},
	}

	for _, test := range tests {
		t.Run(fmt.Sprintf("gomaxprocs_%d", test.gomaxprocs), func(t *testing.T) {
			require.Equal(t, test.want, upstreamGzipConcurrencyCapacity(test.gomaxprocs))
		})
	}

	require.Equal(t, int64(1), upstreamGzipLevelFiveConcurrencyCapacity(1))
	require.Equal(t, int64(1), upstreamGzipLevelFiveConcurrencyCapacity(2))
	require.Equal(t, int64(1), upstreamGzipLevelFiveConcurrencyCapacity(3))
	require.Equal(t, int64(2), upstreamGzipLevelFiveConcurrencyCapacity(4))
	require.Equal(t, int64(4), upstreamGzipLevelFiveConcurrencyCapacity(8))
}

func TestGzipCompressionCapacityAllowsWorkConservingMixedLoad(t *testing.T) {
	totalCapacity := semaphore.NewWeighted(4)
	levelFiveCapacity := semaphore.NewWeighted(2)

	for range 2 {
		_, err := acquireGzipCompressionCapacity(context.Background(), gzipAdaptiveLevel, totalCapacity, levelFiveCapacity)
		require.NoError(t, err)
	}

	blockedLevelFiveCtx, cancelBlockedLevelFive := context.WithCancel(context.Background())
	blockedLevelFive := make(chan error, 1)
	go func() {
		_, err := acquireGzipCompressionCapacity(blockedLevelFiveCtx, gzipAdaptiveLevel, totalCapacity, levelFiveCapacity)
		blockedLevelFive <- err
	}()
	cancelBlockedLevelFive()
	require.ErrorIs(t, <-blockedLevelFive, context.Canceled)

	for range 2 {
		_, err := acquireGzipCompressionCapacity(context.Background(), gzip.BestSpeed, totalCapacity, levelFiveCapacity)
		require.NoError(t, err)
	}

	blockedLevelOneCtx, cancelBlockedLevelOne := context.WithCancel(context.Background())
	blockedLevelOne := make(chan error, 1)
	go func() {
		_, err := acquireGzipCompressionCapacity(blockedLevelOneCtx, gzip.BestSpeed, totalCapacity, levelFiveCapacity)
		blockedLevelOne <- err
	}()
	cancelBlockedLevelOne()
	require.ErrorIs(t, <-blockedLevelOne, context.Canceled)

	for range 2 {
		releaseGzipCompressionCapacity(gzip.BestSpeed, totalCapacity, levelFiveCapacity)
		releaseGzipCompressionCapacity(gzipAdaptiveLevel, totalCapacity, levelFiveCapacity)
	}
}

func BenchmarkGzipLevelOneConcurrency(b *testing.B) {
	payload := mixedCompressibilityPayload(8 * 1024 * 1024)
	ctx := context.Background()

	for _, capacity := range []int64{2, 3, 4} {
		b.Run(fmt.Sprintf("capacity_%d", capacity), func(b *testing.B) {
			limiter := semaphore.NewWeighted(capacity)
			b.SetBytes(int64(len(payload)))
			b.ReportAllocs()
			b.RunParallel(func(pb *testing.PB) {
				var compressed bytes.Buffer
				for pb.Next() {
					if err := limiter.Acquire(ctx, 1); err != nil {
						b.Fatal(err)
					}
					compressed.Reset()
					err := writeGzipStream(ctx, &compressed, bytes.NewReader(payload), gzip.BestSpeed)
					limiter.Release(1)
					if err != nil {
						b.Fatal(err)
					}
				}
			})
		})
	}
}

func repeatedPayload(size int) []byte {
	pattern := []byte(`{"message":"repeated context for gzip","value":12345}`)
	payload := bytes.Repeat(pattern, size/len(pattern)+1)
	return payload[:size]
}

func mixedCompressibilityPayload(size int) []byte {
	payload := bytes.Repeat([]byte("abcdefgh"), size/8+1)[:size]
	random := rand.New(rand.NewSource(1))
	const blockSize = 64 * 1024
	const randomBytesPerBlock = 24 * 1024
	for start := 0; start < len(payload); start += blockSize {
		end := start + randomBytesPerBlock
		if end > len(payload) {
			end = len(payload)
		}
		_, _ = random.Read(payload[start:end])
	}
	return payload
}

func base64LikePayload(size int) []byte {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
	payload := make([]byte, size)
	_, _ = rand.New(rand.NewSource(2)).Read(payload)
	for i := range payload {
		payload[i] = alphabet[int(payload[i])&63]
	}
	return payload
}
