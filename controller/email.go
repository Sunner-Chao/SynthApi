package controller

import (
	"fmt"
	"html"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// EmailUnsubscribe handles the signed, one-click opt-out link included in
// inactive-user reminders. It intentionally reveals no account information.
func EmailUnsubscribe(c *gin.Context) {
	userID, err := strconv.Atoi(strings.TrimSpace(c.Query("id")))
	signature := strings.TrimSpace(c.Query("sig"))
	if err != nil || userID <= 0 || signature == "" || model.UnsubscribeInactiveReminders(userID, signature) != nil {
		c.Data(http.StatusBadRequest, "text/html; charset=utf-8", []byte("<!doctype html><meta charset=\"utf-8\"><title>退订失败</title><p>这个退订链接已经失效，请从最新邮件中重新打开。</p>"))
		return
	}
	c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(fmt.Sprintf("<!doctype html><meta charset=\"utf-8\"><title>已退订</title><p>已为您停止发送这类回访邮件。您仍可随时登录 %s 使用站点服务。</p>", html.EscapeString("SynthAPI"))))
}
