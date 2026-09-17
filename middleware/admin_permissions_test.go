package middleware

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestAdministratorSessionPermissions(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, role := range []int{0, 1, 10, 100, 99} {
		for _, verified := range []bool{false, true} {
			t.Run(strconv.Itoa(role)+"/verified="+strconv.FormatBool(verified), func(t *testing.T) {
				store := cookie.NewStore([]byte("admin-permissions-test-secret"))
				router := gin.New()
				router.Use(sessions.Sessions("session", store))
				// A signed legacy role-10 session must gain the same permissions without
				// requiring a new login or rewriting the stored role to 100.
				seed := httptest.NewRecorder()
				session, err := store.New(httptest.NewRequest("GET", "/", nil), "session")
				require.NoError(t, err)
				session.Values["id"] = 42
				session.Values["username"] = "test-admin"
				session.Values["role"] = role
				session.Values["status"] = common.UserStatusEnabled
				if verified {
					session.Values[SecureVerificationSessionKey] = time.Now().Unix()
				}
				require.NoError(t, store.Save(nil, seed, session))
				handled := false
				endpoint := func(c *gin.Context) { handled = true; c.Status(http.StatusNoContent) }
				router.GET("/admin", AdminAuth(), endpoint)
				router.GET("/settings", RootAuth(), endpoint)
				router.POST("/channel-key", AdminAuth(), RootAuth(), SecureVerificationRequired(), endpoint)
				for _, path := range []string{"/admin", "/settings", "/channel-key"} {
					for _, header := range []string{"", "42", "43"} {
						handled = false
						method := "GET"
						if path == "/channel-key" {
							method = "POST"
						}
						req := httptest.NewRequest(method, path, nil)
						req.AddCookie(seed.Result().Cookies()[0])
						if header != "" {
							req.Header.Set("New-Api-User", header)
						}
						result := httptest.NewRecorder()
						router.ServeHTTP(result, req)
						allowed := (role == 10 || role == 100) && header != "43" && (path != "/channel-key" || verified)
						require.Equal(t, allowed, handled, "role=%d path=%s header=%s", role, path, header)
						if allowed {
							require.Equal(t, http.StatusNoContent, result.Code)
						}
						if (role == 10 || role == 100) && header != "43" && path == "/channel-key" && !verified {
							require.Equal(t, http.StatusForbidden, result.Code)
							require.Contains(t, result.Body.String(), "VERIFICATION_REQUIRED")
						}
					}
				}
				handled = false
				router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/settings", nil))
				require.False(t, handled, "anonymous access must remain blocked")
			})
		}
	}
}

func TestCredentialReadsHaveIndependentUserBudgets(t *testing.T) {
	oldRedis, oldEnabled, oldNum, oldDuration := common.RedisEnabled, common.CriticalRateLimitEnable, common.CriticalRateLimitNum, common.CriticalRateLimitDuration
	common.RedisEnabled = false
	common.CriticalRateLimitEnable = true
	common.CriticalRateLimitNum = 1
	common.CriticalRateLimitDuration = 1200
	t.Cleanup(func() {
		common.RedisEnabled, common.CriticalRateLimitEnable, common.CriticalRateLimitNum, common.CriticalRateLimitDuration = oldRedis, oldEnabled, oldNum, oldDuration
	})
	router := gin.New()
	router.Use(func(c *gin.Context) { id, _ := strconv.Atoi(c.GetHeader("Test-User")); c.Set("id", id) })
	success := func(c *gin.Context) { c.Status(http.StatusNoContent) }
	router.POST("/login", CriticalRateLimit(), success)
	router.POST("/key", CredentialReadRateLimit(), success)
	router.POST("/batch", CredentialReadRateLimit(), success)
	for _, tc := range []struct {
		path, id string
		status   int
	}{
		{"/login", "", 204}, {"/login", "", 429},
		{"/key", "981017", 204}, {"/batch", "981017", 429},
		{"/key", "981018", 204}, {"/key", "", 401},
	} {
		request := httptest.NewRequest("POST", tc.path, nil)
		request.RemoteAddr = "192.0.2.217:1000"
		request.Header.Set("Test-User", tc.id)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		require.Equal(t, tc.status, response.Code, "%+v", tc)
		if tc.path == "/batch" {
			require.Equal(t, "1200", response.Header().Get("Retry-After"))
			require.Contains(t, response.Body.String(), "RATE_LIMITED")
		}
	}
}
