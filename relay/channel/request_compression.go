package channel

import (
	"fmt"
	"mime"
	"net/http"
	"strings"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
)

func isJSONMediaType(value string) bool {
	mediaType, _, err := mime.ParseMediaType(value)
	if err != nil {
		mediaType = strings.TrimSpace(strings.Split(value, ";")[0])
	}
	mediaType = strings.ToLower(mediaType)
	return mediaType == "application/json" || strings.HasSuffix(mediaType, "+json")
}

func applyPreparedUpstreamRequestCompression(req *http.Request, info *relaycommon.RelayInfo) error {
	if req == nil || info == nil || info.UpstreamRequestBodyCompressedSize <= 0 {
		return nil
	}
	contentType := strings.TrimSpace(req.Header.Get("Content-Type"))
	if contentType == "" {
		req.Header.Set("Content-Type", "application/json")
	} else if !isJSONMediaType(contentType) {
		return fmt.Errorf("prepared gzip body requires a JSON Content-Type")
	}
	if encoding := strings.TrimSpace(req.Header.Get("Content-Encoding")); encoding != "" {
		return fmt.Errorf("prepared gzip body cannot be combined with an existing Content-Encoding")
	}

	req.ContentLength = info.UpstreamRequestBodyCompressedSize
	req.TransferEncoding = nil
	req.GetBody = nil
	req.Header.Del("Content-Length")
	req.Header.Set("Content-Encoding", "gzip")
	return nil
}
