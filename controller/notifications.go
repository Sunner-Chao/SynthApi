package controller

import (
	"github.com/QuantumNous/new-api/common"

	"github.com/gin-gonic/gin"
)

// Business notification endpoints are intentionally lightweight. The current
// site stores announcement state in the client and may still send requests
// from older bundles; keeping these routes explicit prevents /user/:id from
// trying to parse "notifications" as an integer.
func GetUserNotifications(c *gin.Context) {
	common.ApiSuccess(c, gin.H{
		"items":  []any{},
		"unread": false,
	})
}

func MarkUserNotificationsRead(c *gin.Context) {
	common.ApiSuccess(c, gin.H{"updated": 0})
}

func GetUserNotificationPreferences(c *gin.Context) {
	common.ApiSuccess(c, gin.H{
		"email_enabled":           true,
		"referral_footer_enabled": true,
		"marketing_enabled":       false,
	})
}

func UpdateUserNotificationPreferences(c *gin.Context) {
	GetUserNotificationPreferences(c)
}
