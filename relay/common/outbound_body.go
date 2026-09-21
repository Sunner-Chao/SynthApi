package common

import (
	"bytes"
	"compress/gzip"
	"context"
	"io"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"golang.org/x/sync/semaphore"
)

const (
	maxAutoUpstreamGzipCapacity = int64(8)
	adaptiveGzipMinBytes        = 5 * 1024 * 1024
	gzipSampleBytes             = 64 * 1024
	gzipAdaptiveLevel           = 5
	minimumGzipSavingsBytes     = 64 * 1024
)

var (
	maxConcurrentUpstreamGzip  = upstreamGzipConcurrencyCapacity(runtime.GOMAXPROCS(0))
	maxConcurrentLevelFiveGzip = upstreamGzipLevelFiveConcurrencyCapacity(maxConcurrentUpstreamGzip)
	upstreamGzipCapacity       = semaphore.NewWeighted(maxConcurrentUpstreamGzip)
	upstreamGzipLevelFiveLimit = semaphore.NewWeighted(maxConcurrentLevelFiveGzip)
	gzipLevelOneWriters        = newGzipWriterPool(gzip.BestSpeed)
	gzipLevelFiveWriters       = newGzipWriterPool(gzipAdaptiveLevel)
)

func upstreamGzipConcurrencyCapacity(gomaxprocs int) int64 {
	if gomaxprocs < 1 {
		return 1
	}
	if int64(gomaxprocs) > maxAutoUpstreamGzipCapacity {
		return maxAutoUpstreamGzipCapacity
	}
	return int64(gomaxprocs)
}

func upstreamGzipLevelFiveConcurrencyCapacity(totalCapacity int64) int64 {
	capacity := totalCapacity / 2
	if capacity < 1 {
		return 1
	}
	return capacity
}

func newGzipWriterPool(level int) *sync.Pool {
	return &sync.Pool{
		New: func() any {
			writer, err := gzip.NewWriterLevel(io.Discard, level)
			if err != nil {
				panic(err)
			}
			return writer
		},
	}
}

func gzipWriterPool(level int) *sync.Pool {
	if level == gzipAdaptiveLevel {
		return gzipLevelFiveWriters
	}
	return gzipLevelOneWriters
}

type contextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r *contextReader) Read(p []byte) (int, error) {
	select {
	case <-r.ctx.Done():
		return 0, r.ctx.Err()
	default:
		return r.reader.Read(p)
	}
}

func gzipBodySizeLimit(sourceSize int64) int64 {
	// DEFLATE expansion is much smaller than this bound. The margin prevents a
	// malformed or unexpectedly expanding stream from consuming unbounded space.
	return sourceSize + sourceSize/100 + 64*1024
}

func writeGzipStream(ctx context.Context, dst io.Writer, source io.Reader, level int) error {
	pool := gzipWriterPool(level)
	writer := pool.Get().(*gzip.Writer)
	writer.Reset(dst)
	reusable := false
	defer func() {
		writer.Reset(io.Discard)
		if reusable {
			pool.Put(writer)
		}
	}()

	if _, err := io.Copy(writer, &contextReader{ctx: ctx, reader: source}); err != nil {
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}

	reusable = true
	return nil
}

func createGzipBodyStorage(ctx context.Context, source io.Reader, sourceSize int64, level int) (common.BodyStorage, error) {
	pipeReader, pipeWriter := io.Pipe()
	compressResult := make(chan error, 1)

	go func() {
		err := writeGzipStream(ctx, pipeWriter, source, level)
		_ = pipeWriter.CloseWithError(err)
		compressResult <- err
	}()

	storage, storageErr := common.CreateBodyStorageFromReader(
		pipeReader,
		sourceSize,
		gzipBodySizeLimit(sourceSize),
	)
	if storageErr != nil {
		_ = pipeReader.CloseWithError(storageErr)
	} else {
		_ = pipeReader.Close()
	}
	compressErr := <-compressResult

	if storageErr != nil {
		return nil, storageErr
	}
	if compressErr != nil {
		_ = storage.Close()
		return nil, compressErr
	}
	return storage, nil
}

func acquireGzipCapacity(ctx context.Context, capacity *semaphore.Weighted, weight int64) (time.Duration, error) {
	startedAt := time.Now()
	err := capacity.Acquire(ctx, weight)
	return time.Since(startedAt), err
}

func acquireGzipCompressionCapacity(
	ctx context.Context,
	level int,
	totalCapacity *semaphore.Weighted,
	levelFiveCapacity *semaphore.Weighted,
) (time.Duration, error) {
	var queueDuration time.Duration
	if level == gzipAdaptiveLevel {
		wait, err := acquireGzipCapacity(ctx, levelFiveCapacity, 1)
		queueDuration += wait
		if err != nil {
			return queueDuration, err
		}
	}

	wait, err := acquireGzipCapacity(ctx, totalCapacity, 1)
	queueDuration += wait
	if err != nil && level == gzipAdaptiveLevel {
		levelFiveCapacity.Release(1)
	}
	return queueDuration, err
}

func releaseGzipCompressionCapacity(
	level int,
	totalCapacity *semaphore.Weighted,
	levelFiveCapacity *semaphore.Weighted,
) {
	totalCapacity.Release(1)
	if level == gzipAdaptiveLevel {
		levelFiveCapacity.Release(1)
	}
}

func selectUpstreamGzipLevel(ctx context.Context, data []byte) (int, time.Duration, error) {
	if len(data) < adaptiveGzipMinBytes {
		return gzip.BestSpeed, 0, nil
	}
	queueDuration, err := acquireGzipCapacity(ctx, upstreamGzipCapacity, 1)
	if err != nil {
		return 0, queueDuration, err
	}
	defer upstreamGzipCapacity.Release(1)

	middleStart := len(data)/2 - gzipSampleBytes/2
	sample := io.MultiReader(
		bytes.NewReader(data[:gzipSampleBytes]),
		bytes.NewReader(data[middleStart:middleStart+gzipSampleBytes]),
		bytes.NewReader(data[len(data)-gzipSampleBytes:]),
	)
	var compressed bytes.Buffer
	if err := writeGzipStream(ctx, &compressed, sample, gzip.BestSpeed); err != nil {
		return 0, queueDuration, err
	}

	originalSampleSize := 3 * gzipSampleBytes
	compressedPercent := compressed.Len() * 100
	if compressedPercent >= originalSampleSize*20 && compressedPercent <= originalSampleSize*55 {
		return gzipAdaptiveLevel, queueDuration, nil
	}
	return gzip.BestSpeed, queueDuration, nil
}

func minimumGzipSavings(size int64) int64 {
	onePercent := size / 100
	if size%100 != 0 {
		onePercent++
	}
	if onePercent > minimumGzipSavingsBytes {
		return onePercent
	}
	return minimumGzipSavingsBytes
}

func gzipBenefitSufficient(originalSize int64, compressedSize int64) bool {
	return originalSize-compressedSize >= minimumGzipSavings(originalSize)
}

func gzipActiveDuration(totalDuration time.Duration, queueDuration time.Duration) time.Duration {
	if totalDuration <= queueDuration {
		return 0
	}
	return totalDuration - queueDuration
}

func shouldGzipOutboundJSON(info *RelayInfo, size int64) bool {
	if info == nil || info.ChannelMeta == nil || !constant.SupportsUpstreamRequestGzip(info.ChannelType) {
		return false
	}
	if info.IsImportedAccountChannel() || info.ChannelSetting.PassThroughBodyEnabled {
		return false
	}
	for name := range info.HeadersOverride {
		if strings.EqualFold(strings.TrimSpace(name), "Content-Encoding") {
			return false
		}
	}
	if !info.ChannelSetting.EffectiveUpstreamRequestGzipEnabled(
		constant.DefaultUpstreamRequestGzipEnabled(info.ChannelType),
	) {
		return false
	}
	return size >= info.ChannelSetting.EffectiveUpstreamRequestGzipMinBytes()
}

// NewOutboundJSONBody wraps an already-marshaled upstream request in a
// BodyStorage. Eligible JSON HTTP channels are gzip-compressed before the storage
// is created, so large requests do not retain a second uncompressed outbound
// spool. Otherwise, the configured disk-cache threshold is applied normally.
//
// In memory mode the underlying memoryStorage reuses the same backing array,
// so this is equivalent to bytes.NewReader(data) in terms of memory usage.
//
// The caller MUST invoke closer.Close() once the upstream call has finished
// (typically via defer) to release the disk file / memory accounting.
//
// The returned reader is wrapped with common.ReaderOnly to prevent the HTTP
// transport from prematurely closing the underlying BodyStorage. The returned
// size is meant to be propagated to http.Request.ContentLength because the
// type-erased io.Reader prevents net/http from auto-detecting it.
func NewOutboundJSONBody(ctx context.Context, data []byte, info *RelayInfo) (body io.Reader, size int64, closer io.Closer, err error) {
	if info != nil {
		info.UpstreamRequestBodyOriginalSize = 0
		info.UpstreamRequestBodyCompressedSize = 0
		info.UpstreamRequestCompressionDuration = 0
		info.UpstreamRequestCompressionQueueDuration = 0
		info.UpstreamRequestCompressionLevel = 0
	}

	originalSize := int64(len(data))
	if shouldGzipOutboundJSON(info, originalSize) {
		if ctx == nil {
			ctx = context.Background()
		}
		if err := ctx.Err(); err != nil {
			return nil, 0, nil, err
		}

		startedAt := time.Now()
		level, queueDuration, err := selectUpstreamGzipLevel(ctx, data)
		if err != nil {
			return nil, 0, nil, err
		}
		capacityWait, err := acquireGzipCompressionCapacity(
			ctx,
			level,
			upstreamGzipCapacity,
			upstreamGzipLevelFiveLimit,
		)
		queueDuration += capacityWait
		if err != nil {
			return nil, 0, nil, err
		}
		storage, err := func() (common.BodyStorage, error) {
			defer releaseGzipCompressionCapacity(level, upstreamGzipCapacity, upstreamGzipLevelFiveLimit)
			return createGzipBodyStorage(ctx, bytes.NewReader(data), originalSize, level)
		}()
		if err != nil {
			return nil, 0, nil, err
		}
		if !gzipBenefitSufficient(originalSize, storage.Size()) {
			if err := storage.Close(); err != nil {
				return nil, 0, nil, err
			}
			storage, err = common.CreateBodyStorage(data)
			if err != nil {
				return nil, 0, nil, err
			}
			return common.ReaderOnly(storage), storage.Size(), storage, nil
		}
		info.UpstreamRequestBodyOriginalSize = originalSize
		info.UpstreamRequestBodyCompressedSize = storage.Size()
		info.UpstreamRequestCompressionDuration = gzipActiveDuration(time.Since(startedAt), queueDuration)
		info.UpstreamRequestCompressionQueueDuration = queueDuration
		info.UpstreamRequestCompressionLevel = level
		return common.ReaderOnly(storage), storage.Size(), storage, nil
	}

	storage, err := common.CreateBodyStorage(data)
	if err != nil {
		return nil, 0, nil, err
	}
	return common.ReaderOnly(storage), storage.Size(), storage, nil
}
