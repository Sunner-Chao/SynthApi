package router

import (
	"testing"

	"github.com/gin-gonic/gin"
)

func TestCCSwitchReadOnlyRoutes(t *testing.T) {
	gin.SetMode(gin.ReleaseMode)
	engine := gin.New()
	SetApiRouter(engine)
	SetRelayRouter(engine)

	routes := make(map[string]bool)
	for _, route := range engine.Routes() {
		routes[route.Method+" "+route.Path] = true
	}

	for _, route := range []string{
		"GET /api/usage/ccswitch",
		"GET /api/usage/ccswitch/",
		"GET /v1/api/usage/ccswitch",
		"GET /v1/api/usage/ccswitch/",
		"GET /user/balance",
		"GET /v1/user/balance",
		"GET /v1/usage",
		"GET /v1/sub2api/billing",
		"GET /v1/sub2api/billing/",
	} {
		if !routes[route] {
			t.Errorf("missing CC Switch route %s", route)
		}
	}
}
