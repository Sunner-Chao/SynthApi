package router

import (
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"

	"github.com/gin-gonic/gin"
)

type ExposureMode string

const (
	ExposureModeAdmin  ExposureMode = "admin"
	ExposureModePublic ExposureMode = "public"
)

type RouterOptions struct {
	Exposure ExposureMode
}

func SetRouter(router *gin.Engine, assets ThemeAssets) {
	SetRouterWithOptions(router, assets, RouterOptions{Exposure: ExposureModeAdmin})
}

func SetRouterWithOptions(router *gin.Engine, assets ThemeAssets, options RouterOptions) {
	if options.Exposure == "" {
		options.Exposure = ExposureModeAdmin
	}
	if options.Exposure == ExposureModePublic {
		router.Use(publicExposureGuard())
	}
	SetApiRouter(router)
	SetDashboardRouter(router)
	SetRelayRouter(router)
	SetVideoRouter(router)
	frontendBaseUrl := os.Getenv("FRONTEND_BASE_URL")
	if common.IsMasterNode && frontendBaseUrl != "" {
		frontendBaseUrl = ""
		common.SysLog("FRONTEND_BASE_URL is ignored on master node")
	}
	if frontendBaseUrl == "" {
		SetWebRouter(router, assets)
	} else {
		frontendBaseUrl = strings.TrimSuffix(frontendBaseUrl, "/")
		router.NoRoute(func(c *gin.Context) {
			c.Set(middleware.RouteTagKey, "web")
			c.Redirect(http.StatusMovedPermanently, fmt.Sprintf("%s%s", frontendBaseUrl, c.Request.RequestURI))
		})
	}
}

func publicExposureGuard() gin.HandlerFunc {
	return func(c *gin.Context) {
		if isBlockedOnPublicPort(c.Request.URL.Path) {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}
		c.Next()
	}
}

func isBlockedOnPublicPort(path string) bool {
	path = strings.TrimSuffix(path, "/")
	if path == "" {
		path = "/"
	}

	switch path {
	case "/dashboard", "/dashboard/overview", "/dashboard/models":
		return false
	}

	for _, prefix := range []string{
		"/system-settings",
		"/console/setting",
		"/users",
		"/console/user",
		"/channels",
		"/console/channel",
		"/models",
		"/console/models",
		"/redemption-codes",
		"/console/redemption",
		"/console/dashboard",
		"/deployments",
		"/console/deployment",
	} {
		if path == prefix || strings.HasPrefix(path, prefix+"/") {
			return true
		}
	}

	for _, prefix := range []string{
		"/api/option",
		"/api/channel",
		"/api/redemption",
		"/api/group",
		"/api/topup_group",
		"/api/prefill_group",
		"/api/vendors",
		"/api/models",
		"/api/deployments",
		"/api/custom-oauth-provider",
		"/api/performance",
		"/api/ratio_sync",
		"/api/subscription/admin",
	} {
		if path == prefix || strings.HasPrefix(path, prefix+"/") {
			return true
		}
	}

	switch path {
	case "/api/status/test",
		"/api/user",
		"/api/user/topup",
		"/api/user/topup/complete",
		"/api/user/search",
		"/api/log",
		"/api/log/stat",
		"/api/log/search",
		"/api/log/channel_affinity_usage_cache",
		"/api/data",
		"/api/data/users",
		"/api/mj",
		"/api/task":
		return true
	default:
		return false
	}
}
