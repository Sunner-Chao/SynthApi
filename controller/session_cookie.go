package controller

import (
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// A browser can send both a legacy host-only session cookie and the current
// domain-wide cookie. Request.Cookie selects the first one, so saving only the
// domain-wide cookie can leave the next request authenticated by the old cookie.
// Expire the old scopes BEFORE saving the replacement session. Keep the shared
// scope intact so users can still navigate between the site and its console.
func clearLegacySessionCookies(c *gin.Context) {
	domain := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(os.Getenv("SESSION_COOKIE_DOMAIN")), "."))
	if domain == "" {
		return
	}
	host := strings.ToLower(c.Request.Host)
	if hostname, _, err := net.SplitHostPort(host); err == nil {
		host = hostname
	}
	if host != domain && !strings.HasSuffix(host, "."+domain) {
		return
	}
	scopes := []string{""} // Host-only cookie, including at the apex domain.
	if host != domain {
		// Some older deployments explicitly used Domain=admin.synthapi.asia.
		scopes = append(scopes, host)
	}
	for _, scope := range scopes {
		http.SetCookie(c.Writer, &http.Cookie{
			Name:     "session",
			Path:     "/",
			Domain:   scope,
			MaxAge:   -1,
			Expires:  time.Unix(1, 0),
			HttpOnly: true,
			Secure:   c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https",
			SameSite: http.SameSiteStrictMode,
		})
	}
}
