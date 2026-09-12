package router

import (
 "net/http/httptest"
 "testing"
 "github.com/QuantumNous/new-api/middleware"
 "github.com/gin-contrib/sessions"
 "github.com/gin-contrib/sessions/cookie"
 "github.com/gin-gonic/gin"
)

func TestR2MonitorAdminGate(t *testing.T) {
 for _, role := range []int{0, 1, 10, 100} {
  r := gin.New()
  r.Use(sessions.Sessions("session", cookie.NewStore([]byte("r2-monitor-test-secret"))))
  r.Use(func(c *gin.Context) {
   if role > 0 {
    s := sessions.Default(c)
    s.Set("username", "monitor-test")
    s.Set("role", role)
    s.Set("id", 1)
    s.Set("status", 1)
   }
   c.Next()
  })
  reached := false
  r.GET("/api/admin/r2-monitor", middleware.AdminAuth(), func(c *gin.Context) { reached = true; c.Status(200) })
  rec := httptest.NewRecorder()
  r.ServeHTTP(rec, httptest.NewRequest("GET", "/api/admin/r2-monitor", nil))
  if reached != (role >= 10) { t.Fatalf("role %d: reached=%v", role, reached) }
 }
}
