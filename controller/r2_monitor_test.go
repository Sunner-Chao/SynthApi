package controller

import (
 "net/http/httptest"
 "os"
 "path/filepath"
 "testing"
 "github.com/gin-gonic/gin"
)

func TestR2SnapshotAvailability(t *testing.T) {
 for _, tc := range []struct { name, body string; want int }{
  {"valid", `{"objects":[],"tokens":{"total_tokens":104000000000}}`, 200},
  {"invalid", `{`, 503},
  {"missing", "", 503},
 } {
  t.Run(tc.name, func(t *testing.T) {
   path := filepath.Join(t.TempDir(), "snapshot.json")
   if tc.body != "" { if err := os.WriteFile(path, []byte(tc.body), 0600); err != nil { t.Fatal(err) } }
   rec := httptest.NewRecorder()
   c, _ := gin.CreateTestContext(rec)
   getR2MonitorSnapshot(c, path)
   if rec.Code != tc.want { t.Fatalf("status %d, want %d", rec.Code, tc.want) }
   if rec.Header().Get("Cache-Control") != "no-store" { t.Fatal("missing no-store") }
  })
 }
}
