package middleware

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/andybalholm/brotli"
	"github.com/gin-gonic/gin"
)

func TestDecompressRequestMiddlewareResetsEncodedLength(t *testing.T) {
	gin.SetMode(gin.TestMode)
	payload := bytes.Repeat([]byte(`{"input":"compressible"}`), 1024)

	tests := []struct {
		name     string
		encoding string
		encode   func(*testing.T, []byte) []byte
	}{
		{name: "gzip", encoding: " GZip ", encode: gzipTestBody},
		{name: "brotli", encoding: "br", encode: brotliTestBody},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			encoded := tt.encode(t, payload)
			router := gin.New()
			router.Use(DecompressRequestMiddleware())
			router.POST("/", func(c *gin.Context) {
				if c.Request.ContentLength != -1 {
					t.Errorf("ContentLength = %d, want -1", c.Request.ContentLength)
				}
				if got := c.Request.Header.Get("Content-Length"); got != "" {
					t.Errorf("Content-Length header = %q, want empty", got)
				}
				if got := c.Request.Header.Get("Content-Encoding"); got != "" {
					t.Errorf("Content-Encoding header = %q, want empty", got)
				}
				if c.Request.GetBody != nil {
					t.Error("GetBody still returns the original compressed body")
				}
				body, err := io.ReadAll(c.Request.Body)
				if err != nil {
					t.Fatalf("read decompressed body: %v", err)
				}
				if !bytes.Equal(body, payload) {
					t.Error("decompressed body differs from source")
				}
				c.Status(http.StatusNoContent)
			})

			req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(encoded))
			req.Header.Set("Content-Encoding", tt.encoding)
			req.Header.Set("Content-Length", strconv.Itoa(len(encoded)))
			req.GetBody = func() (io.ReadCloser, error) {
				return io.NopCloser(bytes.NewReader(encoded)), nil
			}
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, req)
			if recorder.Code != http.StatusNoContent {
				t.Fatalf("status = %d, want %d", recorder.Code, http.StatusNoContent)
			}
		})
	}
}

func TestDecompressRequestMiddlewareRejectsUnsupportedEncoding(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(DecompressRequestMiddleware())
	router.POST("/", func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader([]byte("payload")))
	req.Header.Set("Content-Encoding", "gzip, br")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnsupportedMediaType)
	}
}

func gzipTestBody(t *testing.T, payload []byte) []byte {
	t.Helper()
	var encoded bytes.Buffer
	writer := gzip.NewWriter(&encoded)
	if _, err := writer.Write(payload); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return encoded.Bytes()
}

func brotliTestBody(t *testing.T, payload []byte) []byte {
	t.Helper()
	var encoded bytes.Buffer
	writer := brotli.NewWriter(&encoded)
	if _, err := writer.Write(payload); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return encoded.Bytes()
}
