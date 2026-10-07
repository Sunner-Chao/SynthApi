package controller

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
)

var supportHTTPClient = &http.Client{Timeout: 115 * time.Second}
var supportTicketID = regexp.MustCompile(`^[a-f0-9-]{36}$`)
var supportConversationID = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,100}$`)
var supportKnowledgeID = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,100}$`)
var supportWebUserID = regexp.MustCompile(`^web:([1-9][0-9]{0,12})$`)

func SupportAgentChat(c *gin.Context)          { supportAgentProxy(c, "/v1/chat", false) }
func SupportAgentHistory(c *gin.Context)       { supportAgentProxy(c, "/v1/history", false) }
func SupportAgentConversations(c *gin.Context) { supportAgentProxy(c, "/v1/conversations", false) }
func SupportAgentRuns(c *gin.Context)          { supportAgentProxy(c, "/v1/runs", false) }
func SupportAgentActionReceipt(c *gin.Context) { supportAgentProxy(c, "/v1/actions/receipt", false) }
func SupportAgentRun(c *gin.Context) {
	id := c.Param("id")
	if !supportTicketID.MatchString(id) {
		c.JSON(400, gin.H{"success": false, "message": "Invalid run"})
		return
	}
	path := "/v1/runs/" + id
	if c.Request.Method == http.MethodPost {
		path += "/cancel"
	}
	supportAgentProxy(c, path, false)
}
func SupportAgentConversationRename(c *gin.Context) {
	id := c.Param("conversation")
	if !supportConversationID.MatchString(id) {
		c.JSON(400, gin.H{"success": false, "message": "Invalid conversation"})
		return
	}
	supportAgentProxy(c, "/v1/conversations/"+id, false)
}
func SupportAgentConversationArchive(c *gin.Context) {
	id := c.Param("conversation")
	if !supportConversationID.MatchString(id) {
		c.JSON(400, gin.H{"success": false, "message": "Invalid conversation"})
		return
	}
	supportAgentProxy(c, "/v1/conversations/"+id+"/archive", false)
}
func SupportAgentConversationDelete(c *gin.Context) {
	id := c.Param("conversation")
	if !supportConversationID.MatchString(id) {
		c.JSON(400, gin.H{"success": false, "message": "Invalid conversation"})
		return
	}
	supportAgentProxy(c, "/v1/conversations/"+id, false)
}
func SupportAgentFeedback(c *gin.Context)      { supportAgentProxy(c, "/v1/feedback", false) }
func SupportAgentTicketRequest(c *gin.Context) {
	supportAgentProxyWithData(c, "/v1/tickets", false, func(data interface{}) interface{} {
		if root, ok := data.(map[string]interface{}); ok {
			if ticket, ok := root["ticket"].(map[string]interface{}); ok {
				if ticketID := strings.TrimSpace(fmt.Sprint(ticket["id"])); ticketID != "" {
					model.NotifySupportHandoff(ticketID, c.GetInt("id"), "用户请求人工客服处理")
				}
			}
		}
		return data
	})
}
func SupportAgentTicketNote(c *gin.Context)    { supportAgentTicket(c, "note") }
func SupportAgentTicketClose(c *gin.Context)   { supportAgentTicket(c, "close") }

// Customer-side ticket actions; the support service checks that the ticket belongs to the caller.
func supportAgentTicket(c *gin.Context, action string) {
	id := c.Param("id")
	if !supportTicketID.MatchString(id) {
		c.JSON(400, gin.H{"success": false, "message": "Invalid ticket"})
		return
	}
	supportAgentProxy(c, "/v1/tickets/"+id+"/"+action, false)
}

func SupportAgentHealth(c *gin.Context) { supportAgentProxy(c, "/health", false) }
func SupportAgentPause(c *gin.Context)  { supportAgentProxy(c, "/v1/pause", false) }
func SupportAgentVerify(c *gin.Context) { supportAgentProxy(c, "/v1/desktop/verify", true) }
func SupportAgentVision(c *gin.Context) { supportAgentProxy(c, "/v1/desktop/vision", true) }
func SupportAgentHandoffs(c *gin.Context) {
	supportAgentProxyWithData(c, "/v1/handoffs", false, enrichSupportHandoffUsers)
}
func SupportAgentKnowledge(c *gin.Context) { supportAgentProxy(c, "/v1/knowledge", false) }
func SupportAgentKnowledgeDocument(c *gin.Context) {
	id := c.Param("doc_id")
	if !supportKnowledgeID.MatchString(id) {
		c.JSON(400, gin.H{"success": false, "message": "Invalid document"})
		return
	}
	supportAgentProxy(c, "/v1/knowledge/"+id, false)
}

// Support console: a ticket's conversation, unresolved questions grouped by topic, headline
// counts and the console settings. Administrators only (router), except reading the settings,
// which every signed-in user needs for the service hours and suggested questions.
func SupportAgentHandoffContext(c *gin.Context) {
	id := c.Param("id")
	if !supportTicketID.MatchString(id) {
		c.JSON(400, gin.H{"success": false, "message": "Invalid ticket"})
		return
	}
	supportAgentProxy(c, "/v1/handoffs/"+id+"/context", false)
}
func SupportAgentUnresolved(c *gin.Context) {
	days, err := strconv.Atoi(c.DefaultQuery("days", "7"))
	if err != nil || days < 1 || days > 90 {
		c.JSON(400, gin.H{"success": false, "message": "Invalid period"})
		return
	}
	supportAgentProxy(c, "/v1/admin/unresolved?days="+strconv.Itoa(days), false)
}
func SupportAgentOverview(c *gin.Context)     { supportAgentProxy(c, "/v1/admin/overview", false) }
func SupportAgentSettings(c *gin.Context)     { supportAgentProxy(c, "/v1/settings", false) }
func SupportAgentSaveSettings(c *gin.Context) { supportAgentProxy(c, "/v1/admin/settings", false) }

func SupportAgentResolve(c *gin.Context) {
	id := c.Param("id")
	if !supportTicketID.MatchString(id) {
		c.JSON(400, gin.H{"success": false, "message": "Invalid ticket"})
		return
	}
	supportAgentProxy(c, "/v1/handoffs/"+id+"/resolve", false)
}
func SupportAgentReply(c *gin.Context) {
	id := c.Param("id")
	if !supportTicketID.MatchString(id) {
		c.JSON(400, gin.H{"success": false, "message": "Invalid ticket"})
		return
	}
	var body struct {
		ReplyID string `json:"reply_id"`
		Message string `json:"message"`
		Draft   *bool  `json:"draft,omitempty"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || !supportTicketID.MatchString(body.ReplyID) {
		c.JSON(400, gin.H{"success": false, "message": "Invalid reply"})
		return
	}
	body.Message = strings.TrimSpace(body.Message)
	if body.Message == "" || len([]rune(body.Message)) > 4000 {
		c.JSON(400, gin.H{"success": false, "message": "Reply must contain 1 to 4000 characters"})
		return
	}
	encoded, err := common.Marshal(body)
	if err != nil {
		c.JSON(400, gin.H{"success": false, "message": "Invalid reply"})
		return
	}
	c.Request.Body = io.NopCloser(bytes.NewReader(encoded))
	supportAgentProxyWithData(c, "/v1/handoffs/"+id+"/reply", false, sendSupportReplyEmail)
}
func SupportAgentNextNotification(c *gin.Context) {
	supportAgentProxy(c, "/v1/desktop/notifications/next", true)
}

func SupportAgentObserve(c *gin.Context)     { supportAgentProxy(c, "/v1/desktop/observe", true) }
func SupportAgentAcknowledge(c *gin.Context) { supportAgentProxy(c, "/v1/desktop/ack", true) }

func supportAgentProxy(c *gin.Context, path string, device bool) {
	supportAgentProxyWithData(c, path, device, nil)
}

func supportAgentProxyWithData(c *gin.Context, path string, device bool, transform func(interface{}) interface{}) {
	base := strings.TrimRight(os.Getenv("SUPPORT_AGENT_URL"), "/")
	secret := os.Getenv("SUPPORT_AGENT_SECRET")
	if base == "" || secret == "" {
		c.JSON(503, gin.H{"success": false, "message": "智能客服尚未就绪，请稍后重试"})
		return
	}
	maxSize := int64(128 * 1024)
	if device {
		maxSize = 8 * 1024 * 1024
	}
	body, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, maxSize))
	if err != nil {
		c.JSON(413, gin.H{"success": false, "message": "请求内容过大"})
		return
	}
	target := base + path
	if path == "/v1/history" || path == "/v1/conversations" {
		allowed := []string{"conversation", "before"}
		if path == "/v1/conversations" {
			allowed = []string{"include_archived", "offset", "q"}
		}
		query := url.Values{}
		for _, key := range allowed {
			value := c.Query(key)
			if len(value) > 400 {
				c.JSON(400, gin.H{"success": false, "message": "Invalid query"})
				return
			}
			if value != "" {
				query.Set(key, value)
			}
		}
		if encoded := query.Encode(); encoded != "" {
			target += "?" + encoded
		}
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 115*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, c.Request.Method, target, bytes.NewReader(body))
	if err != nil {
		c.JSON(503, gin.H{"success": false, "message": "智能客服服务配置异常"})
		return
	}
	req.Header.Set("Content-Type", "application/json")
	if device {
		req.Header.Set("Authorization", c.GetHeader("Authorization"))
	} else {
		req.Header.Set("Authorization", "Bearer "+secret)
		req.Header.Set("X-Support-User", strconv.Itoa(c.GetInt("id")))
		role := "user"
		if c.GetInt("role") >= common.RoleAdminUser {
			role = "admin"
		}
		req.Header.Set("X-Support-Role", role)
	}
	resp, err := supportHTTPClient.Do(req)
	if err != nil {
		c.JSON(503, gin.H{"success": false, "message": "智能客服暂时无法连接，请稍后重试"})
		return
	}
	defer resp.Body.Close()
	response, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024+1))
	if err != nil || len(response) > 2*1024*1024 {
		c.JSON(502, gin.H{"success": false, "message": "智能客服响应异常"})
		return
	}
	c.Header("Cache-Control", "no-store")
	if resp.StatusCode >= 400 {
		message := "智能客服请求失败，请稍后重试"
		switch resp.StatusCode {
		case 401:
			message = "客服设备凭据无效"
		case 403:
			message = "无权访问此客服资源"
		case 429:
			message = "提问过于频繁，请稍后重试"
		case 409:
			message = "当前对话仍在处理中，请稍后重试"
		case 404:
			message = "对话或任务不存在"
		case 400, 422:
			message = "请检查输入内容和资料格式"
		}
		c.JSON(resp.StatusCode, gin.H{"success": false, "message": message})
		return
	}
	var data interface{}
	if common.Unmarshal(response, &data) != nil {
		c.JSON(502, gin.H{"success": false, "message": "智能客服响应格式异常"})
		return
	}
	if transform != nil {
		data = transform(data)
	}
	c.JSON(200, gin.H{"success": true, "data": data})
}

func enrichSupportHandoffUsers(data interface{}) interface{} {
	return enrichSupportHandoffUsersWith(data, model.GetUserById)
}

func enrichSupportHandoffUsersWith(data interface{}, lookup func(int, bool) (*model.User, error)) interface{} {
	root, ok := data.(map[string]interface{})
	if !ok {
		return data
	}
	items, ok := root["items"].([]interface{})
	if !ok {
		return data
	}
	// One lookup per account, however many of its tickets are listed.
	users := map[int]*model.User{}
	for _, raw := range items {
		item, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		match := supportWebUserID.FindStringSubmatch(fmt.Sprint(item["principal"]))
		if len(match) != 2 {
			continue
		}
		userID, err := strconv.Atoi(match[1])
		if err != nil {
			continue
		}
		user, seen := users[userID]
		if !seen {
			if user, err = lookup(userID, false); err != nil {
				user = nil
			}
			users[userID] = user
		}
		if user == nil {
			continue
		}
		name := strings.TrimSpace(user.DisplayName)
		if name == "" {
			name = user.Username
		}
		// Balance and account age help staff judge billing questions at a glance.
		item["requester"] = map[string]interface{}{"id": user.Id, "username": name, "email": user.Email,
			"quota": user.Quota, "created_at": user.CreatedAt}
	}
	return root
}

// Support replies are already stored in the user's conversation, so the email is only a heads-up:
// it goes out through the site's SMTP settings in the background and a failure never loses the reply.
func sendSupportReplyEmail(data interface{}) interface{} {
	return queueSupportReplyEmail(data, model.GetUserById, func(receiver, subject, content string) error {
		if common.SMTPServer == "" {
			return errSupportMailUnavailable
		}
		go func() {
			if err := common.SendEmail(subject, receiver, content); err != nil {
				common.SysError("support reply email failed: " + err.Error())
			}
		}()
		return nil
	})
}

var errSupportMailUnavailable = errors.New("smtp is not configured")

func queueSupportReplyEmail(
	data interface{},
	lookup func(int, bool) (*model.User, error),
	send func(receiver, subject, content string) error,
) interface{} {
	result, ok := data.(map[string]interface{})
	if !ok {
		return data
	}
	result["email_sent"] = false
	principal, _ := result["principal"].(string)
	match := supportWebUserID.FindStringSubmatch(principal)
	if len(match) != 2 {
		result["email_status"] = "not_applicable"
		return result
	}
	userID, err := strconv.Atoi(match[1])
	if err != nil {
		result["email_status"] = "failed"
		return result
	}
	user, err := lookup(userID, false)
	if err != nil {
		result["email_status"] = "failed"
		return result
	}
	if strings.TrimSpace(user.Email) == "" {
		result["email_status"] = "no_email"
		return result
	}
	name := strings.TrimSpace(user.DisplayName)
	if name == "" {
		name = user.Username
	}
	question, _ := result["question"].(string)
	message, _ := result["message"].(string)
	conversation, _ := result["conversation"].(string)
	content := fmt.Sprintf(
		"<p>你好，%s：</p><p>你在站点助手中的问题：<br>%s</p><p>客服回复：<br>%s</p><p><a href=\"%s\">打开站点助手查看这段对话</a></p>",
		supportMailText(name), supportMailText(question), supportMailText(message), supportReplyLink(conversation),
	)
	if err := send(user.Email, "站点助手有新回复", content); err != nil {
		if errors.Is(err, errSupportMailUnavailable) {
			result["email_status"] = "not_configured"
		} else {
			result["email_status"] = "failed"
		}
		return result
	}
	result["email_status"] = "queued"
	return result
}

func supportMailText(value string) string {
	return strings.ReplaceAll(html.EscapeString(value), "\n", "<br>")
}

// supportReplyLink opens the assistant on the conversation that holds the reply.
func supportReplyLink(conversation string) string {
	base := strings.TrimRight(system_setting.ServerAddress, "/")
	if !supportConversationID.MatchString(conversation) {
		return base + "/"
	}
	return base + "/?assistant=" + url.QueryEscape(conversation)
}
