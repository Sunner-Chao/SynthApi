package openai

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/gin-gonic/gin"
)

func TestAPIMartGPTImage25APIAndWorkbench(t *testing.T) {
	for _, path := range []string{"/v1/images/generations", "/pg/images/generations"} {
		for _, name := range []string{"gpt-image-2.5-ext", "gpt-image-2.5-flare", "gpt-image-2.5-sunburst"} {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{}`))
			c.Request.Header.Set("Content-Type", "application/json")
			info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeImagesGenerations, ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: "https://api.apimart.ai"}}
			r := dto.ImageRequest{Model: name, Prompt: "test", ResponseFormat: "url", N: common.GetPointer(uint(1)), Quality: "medium"}
			r.Resolution, _ = common.Marshal("2k")
			r.OutputFormat, _ = common.Marshal("url")
			out, err := (&Adaptor{}).ConvertImageRequest(c, info, r)
			if err != nil {
				t.Fatal(err)
			}
			got := out.(dto.ImageRequest)
			if got.Model != name || got.ResponseFormat != "" || string(got.OutputFormat) != `"png"` || got.GetResolution() != "2k" {
				t.Fatalf("incorrect conversion for %s %s", path, name)
			}
			if name == "gpt-image-2.5-ext" {
				if got.GetExtraString("version") != "flare" {
					t.Fatal("missing default Ext version")
				}
				r.Extra = map[string]json.RawMessage{"version": json.RawMessage(`"sunburst"`)}
				out, err = (&Adaptor{}).ConvertImageRequest(c, info, r)
				if err != nil {
					t.Fatal(err)
				}
				encoded, _ := common.Marshal(out)
				var payload map[string]any
				_ = common.Unmarshal(encoded, &payload)
				if payload["version"] != "sunburst" {
					t.Fatal("explicit Ext version was lost")
				}
			}
		}
	}
}

func TestAPIMartGPTImage25UploadsLocalReference(t *testing.T) {
	imageBytes := []byte("test image fixture")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/uploads/images" || r.Header.Get("Authorization") != "Bearer fixture-key" {
			t.Error("wrong upload request")
		}
		file, _, err := r.FormFile("file")
		if err != nil {
			t.Error(err)
			w.WriteHeader(400)
			return
		}
		defer file.Close()
		data, _ := io.ReadAll(file)
		if string(data) != string(imageBytes) {
			t.Error("reference corrupted")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"url":"https://upload.apimart.ai/f/image/test.png"}`)
	}))
	defer server.Close()
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/pg/images/generations", nil)
	info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: server.URL, ApiKey: "fixture-key"}}
	dataURL := "data:image/png;base64," + base64.StdEncoding.EncodeToString(imageBytes)
	r := dto.ImageRequest{Model: "gpt-image-2.5-sunburst", ImageURLs: []string{dataURL}, N: common.GetPointer(uint(1))}
	if err := prepareAPIMartGPTImage25(c, info, &r); err != nil {
		t.Fatal(err)
	}
	if r.ImageURLs[0] != "https://upload.apimart.ai/f/image/test.png" {
		t.Fatal("Data URL was not uploaded")
	}
	r.Model = "gpt-image-2.5-ext"
	r.ImageURLs = []string{dataURL}
	if err := prepareAPIMartGPTImage25(c, info, &r); err != nil || r.ImageURLs[0] != dataURL {
		t.Fatal("Ext must keep its supported Data URL")
	}
	r.N = common.GetPointer(uint(5))
	if err := prepareAPIMartGPTImage25(c, info, &r); err == nil {
		t.Fatal("accepted invalid batch size")
	}
}
