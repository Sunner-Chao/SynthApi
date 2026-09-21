package middleware

import (
	"compress/gzip"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/constant"
	"github.com/andybalholm/brotli"
	"github.com/gin-gonic/gin"
)

type readCloser struct {
	io.Reader
	closeFn func() error
}

func (rc *readCloser) Close() error {
	if rc.closeFn != nil {
		return rc.closeFn()
	}
	return nil
}

func DecompressRequestMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Body == nil || c.Request.Method == http.MethodGet {
			c.Next()
			return
		}
		maxMB := constant.MaxRequestBodyMB
		if maxMB <= 0 {
			maxMB = 32
		}
		maxBytes := int64(maxMB) << 20

		origBody := c.Request.Body
		wrapMaxBytes := func(body io.ReadCloser) io.ReadCloser {
			return http.MaxBytesReader(c.Writer, body, maxBytes)
		}

		contentEncoding := strings.ToLower(strings.TrimSpace(c.GetHeader("Content-Encoding")))
		markDecompressed := func() {
			c.Request.ContentLength = -1
			c.Request.GetBody = nil
			c.Request.Header.Del("Content-Length")
			c.Request.Header.Del("Content-Encoding")
		}

		switch contentEncoding {
		case "gzip":
			gzipReader, err := gzip.NewReader(origBody)
			if err != nil {
				_ = origBody.Close()
				c.AbortWithStatus(http.StatusBadRequest)
				return
			}
			// Replace the request body with the decompressed data, and enforce a max size (post-decompression).
			c.Request.Body = wrapMaxBytes(&readCloser{
				Reader: gzipReader,
				closeFn: func() error {
					_ = gzipReader.Close()
					return origBody.Close()
				},
			})
			markDecompressed()
		case "br":
			reader := brotli.NewReader(origBody)
			c.Request.Body = wrapMaxBytes(&readCloser{
				Reader: reader,
				closeFn: func() error {
					return origBody.Close()
				},
			})
			markDecompressed()
		case "", "identity":
			// Even for uncompressed bodies, enforce a max size to avoid huge request allocations.
			c.Request.Body = wrapMaxBytes(origBody)
		default:
			_ = origBody.Close()
			c.AbortWithStatus(http.StatusUnsupportedMediaType)
			return
		}

		// Continue processing the request
		c.Next()
	}
}
