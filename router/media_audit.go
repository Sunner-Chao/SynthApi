package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-gonic/gin"
)

func registerMediaAuditRoutes(apiRouter *gin.RouterGroup) {
	mediaLogs := apiRouter.Group("/media-logs")
	mediaLogs.GET("/self/:kind", middleware.UserAuth(), controller.GetMediaAudit)
	mediaLogs.GET("/admin/:kind", middleware.AdminAuth(), controller.GetAllMediaAudit)
	mediaLogs.GET("/self/:kind/:task_id/content", middleware.UserAuth(), controller.MediaAuditContent)
	mediaLogs.GET("/admin/:kind/:task_id/content", middleware.AdminAuth(), controller.MediaAuditAdminContent)
	mediaLogs.HEAD("/self/:kind/:task_id/content", middleware.UserAuth(), controller.MediaAuditContent)
	mediaLogs.HEAD("/admin/:kind/:task_id/content", middleware.AdminAuth(), controller.MediaAuditAdminContent)
}
