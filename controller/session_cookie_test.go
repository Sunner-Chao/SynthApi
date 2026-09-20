package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestLoginClearsLegacyCookieScopesBeforeSavingSession(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.Exec("CREATE TABLE users (id INTEGER PRIMARY KEY, last_login_at BIGINT)").Error)
	previousDB := model.DB
	model.DB = db
	t.Cleanup(func() {
		model.DB = previousDB
		sqlDB, _ := db.DB()
		_ = sqlDB.Close()
	})
	for _, tc := range []struct {
		name, host, domain string
		expiredScopes      []string
	}{
		{"apex", "synthapi.asia", ".synthapi.asia", []string{""}},
		{"admin", "admin.synthapi.asia", ".synthapi.asia", []string{"", "admin.synthapi.asia"}},
		{"host-only deployment", "localhost:3000", "", nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("SESSION_COOKIE_DOMAIN", tc.domain)
			store := cookie.NewStore([]byte("session-regression-test-secret"))
			store.Options(sessions.Options{Path: "/", Domain: tc.domain, MaxAge: 2592000, HttpOnly: true})
			router := gin.New()
			router.Use(sessions.Sessions("session", store))
			router.POST("/login", func(c *gin.Context) {
				setupLogin(&model.User{Id: 42, Username: "test-user", Role: 1, Status: 1, Group: "default"}, c)
			})
			router.GET("/self", func(c *gin.Context) {
				require.Equal(t, 42, sessions.Default(c).Get("id"))
				c.Status(http.StatusOK)
			})
			request := httptest.NewRequest(http.MethodPost, "https://"+tc.host+"/login", nil)
			request.Header.Set("Cookie", "session=stale-host-cookie; session=stale-shared-cookie")
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			require.Equal(t, http.StatusOK, response.Code)
			cookies := response.Result().Cookies()
			require.Len(t, cookies, len(tc.expiredScopes)+1)
			for index, scope := range tc.expiredScopes {
				require.Equal(t, scope, cookies[index].Domain)
				require.Equal(t, "session", cookies[index].Name)
				require.Equal(t, "/", cookies[index].Path)
				require.Equal(t, -1, cookies[index].MaxAge)
			}
			current := cookies[len(cookies)-1]
			require.Positive(t, current.MaxAge)
			followup := httptest.NewRequest(http.MethodGet, "https://"+tc.host+"/self", nil)
			followup.AddCookie(current)
			router.ServeHTTP(httptest.NewRecorder(), followup)
		})
	}
}

func TestLogoutClearsLegacyAndSharedSessions(t *testing.T) {
	t.Setenv("SESSION_COOKIE_DOMAIN", ".synthapi.asia")
	store := cookie.NewStore([]byte("session-regression-test-secret"))
	store.Options(sessions.Options{Path: "/", Domain: ".synthapi.asia", MaxAge: 2592000})
	seed, err := store.New(httptest.NewRequest(http.MethodGet, "https://admin.synthapi.asia/", nil), "session")
	require.NoError(t, err)
	seed.Values["id"] = 42
	seedResponse := httptest.NewRecorder()
	require.NoError(t, store.Save(nil, seedResponse, seed))
	router := gin.New()
	router.Use(sessions.Sessions("session", store))
	router.GET("/logout", Logout)
	request := httptest.NewRequest(http.MethodGet, "https://admin.synthapi.asia/logout", nil)
	request.AddCookie(seedResponse.Result().Cookies()[0])
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	cookies := response.Result().Cookies()
	require.Len(t, cookies, 3)
	require.Equal(t, -1, cookies[0].MaxAge)
	require.Equal(t, -1, cookies[1].MaxAge)
	followup := httptest.NewRequest(http.MethodGet, "https://admin.synthapi.asia/", nil)
	followup.AddCookie(cookies[2])
	cleared, err := store.New(followup, "session")
	require.NoError(t, err)
	require.NotContains(t, cleared.Values, "id")
}
