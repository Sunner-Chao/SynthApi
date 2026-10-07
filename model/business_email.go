package model

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"html"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// EmailNotificationEvent is the durable idempotency record for business mail.
// A successful event is never delivered twice, including on the second node.
type EmailNotificationEvent struct {
	Id        int    `json:"id"`
	EventKey  string `json:"event_key" gorm:"type:varchar(255);not null;uniqueIndex"`
	Status    string `json:"status" gorm:"type:varchar(20);not null;index"`
	LastError string `json:"-" gorm:"type:text"`
	SentAt    int64  `json:"sent_at" gorm:"default:0"`
	CreatedAt int64  `json:"created_at" gorm:"not null;index"`
	Subject   string `json:"-" gorm:"type:text"`
	Receiver  string `json:"-" gorm:"type:text"`
	Content   string `json:"-" gorm:"type:text"`
	Attempts  int    `json:"-" gorm:"not null;default:0"`
	NextAttempt int64 `json:"-" gorm:"not null;default:0;index"`
}

const (
	emailEventSending = "sending"
	emailEventSent    = "sent"
	emailEventFailed  = "failed"
)

// SMTP providers commonly reject a burst of parallel connections with 421.
// Keep business mail deliberately small and retry transient failures in-process.
var businessEmailSlots = make(chan struct{}, 2)
var businessEmailRetryDelays = []time.Duration{2 * time.Second, 10 * time.Second, 30 * time.Second}
var businessEmailRetryOnce sync.Once

func emailText(value string) string {
	return strings.ReplaceAll(html.EscapeString(strings.TrimSpace(value)), "\n", "<br>")
}

func adminEmailAddresses() []string {
	var users []User
	if err := DB.Select("id", "email").Where("status = ? AND role >= ? AND email <> ''", common.UserStatusEnabled, common.RoleAdminUser).Find(&users).Error; err != nil {
		common.SysError(fmt.Sprintf("business email admin lookup failed: %v", err))
		return nil
	}
	seen := map[string]bool{}
	addresses := make([]string, 0, len(users))
	for _, user := range users {
		address := strings.TrimSpace(user.Email)
		if address != "" && !seen[address] {
			seen[address] = true
			addresses = append(addresses, address)
		}
	}
	return addresses
}

// claimBusinessEmail reserves one event. Failed or stale sending events may be retried.
func claimBusinessEmail(eventKey, subject, receiver, content string) (*EmailNotificationEvent, bool) {
	if strings.TrimSpace(eventKey) == "" || strings.TrimSpace(receiver) == "" || strings.TrimSpace(common.SMTPServer) == "" {
		return nil, false
	}
	var event EmailNotificationEvent
	err := DB.Where("event_key = ?", eventKey).First(&event).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		common.SysError(fmt.Sprintf("business email event lookup failed: %v", err))
		return nil, false
	}
	now := common.GetTimestamp()
	if errors.Is(err, gorm.ErrRecordNotFound) {
		event = EmailNotificationEvent{EventKey: eventKey, Status: emailEventSending, CreatedAt: now, Subject: subject, Receiver: receiver, Content: content}
		if err := DB.Create(&event).Error; err != nil {
			// Another node owns the unique event. It will deliver it.
			return nil, false
		}
		return &event, true
	}
	if event.Status == emailEventSent {
		return nil, false
	}
	// A process can disappear after claiming an event. Allow another attempt
	// after ten minutes, while preventing concurrent duplicate deliveries.
	if event.Status == emailEventSending && now-event.CreatedAt < 600 {
		return nil, false
	}
	claim := DB.Model(&EmailNotificationEvent{}).Where("id = ? AND status <> ?", event.Id, emailEventSent).
		Where("status <> ? OR created_at < ?", emailEventSending, now-600).
		Updates(map[string]interface{}{"status": emailEventSending, "last_error": "", "created_at": now, "subject": subject, "receiver": receiver, "content": content, "next_attempt": 0})
	if claim.Error != nil || claim.RowsAffected != 1 {
		return nil, false
	}
	event.CreatedAt = now
	event.Subject, event.Receiver, event.Content = subject, receiver, content
	return &event, true
}

func markBusinessEmailFailed(event *EmailNotificationEvent, err error) {
	attempts := event.Attempts + 1
	nextAttempt := time.Now().Add(24 * time.Hour).Unix()
	// A mailbox rejected with 550 is a permanent recipient failure. Keep the
	// event for audit, but do not keep retrying it every day.
	if isPermanentBusinessEmailError(err) {
		attempts = 8
		nextAttempt = 0
	}
	updates := map[string]interface{}{"status": emailEventFailed, "last_error": err.Error(), "attempts": attempts, "next_attempt": nextAttempt}
	_ = DB.Model(&EmailNotificationEvent{}).Where("id = ?", event.Id).Updates(updates).Error
	common.SysError(fmt.Sprintf("business email failed event=%s attempt=%d: %v", event.EventKey, attempts, err))
}

func isPermanentBusinessEmailError(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "550") || strings.Contains(message, "invalid user") || strings.Contains(message, "mailbox unavailable")
}

func sendBusinessEmailAttempt(subject, receiver, content string) error {
	businessEmailSlots <- struct{}{}
	defer func() { <-businessEmailSlots }()
	return common.SendEmail(subject, receiver, content)
}

func deliverBusinessEmail(event *EmailNotificationEvent, subject, receiver, content string, onSent func()) bool {
	for attempt := 0; attempt <= len(businessEmailRetryDelays); attempt++ {
		if attempt > 0 {
			time.Sleep(businessEmailRetryDelays[attempt-1])
		}
		if err := sendBusinessEmailAttempt(subject, receiver, content); err != nil {
			event.Attempts = attempt + 1
			if attempt == len(businessEmailRetryDelays) {
				markBusinessEmailFailed(event, err)
				return false
			}
			continue
		}
		_ = DB.Model(&EmailNotificationEvent{}).Where("id = ?", event.Id).Updates(map[string]interface{}{"status": emailEventSent, "sent_at": time.Now().Unix(), "last_error": "", "attempts": attempt, "next_attempt": 0}).Error
		if onSent != nil { onSent() }
		return true
	}
	return false
}

// StartBusinessEmailRetryTask recovers durable failures after a process restart
// or a temporary SMTP outage. The event body is stored with the idempotency
// record, so recovery never needs to reconstruct an announcement or ticket.
func StartBusinessEmailRetryTask() {
	businessEmailRetryOnce.Do(func() {
		go func() {
			ticker := time.NewTicker(60 * time.Second)
			defer ticker.Stop()
			for {
				retryBusinessEmailEvents()
				<-ticker.C
			}
		}()
	})
}

func retryBusinessEmailEvents() {
	if strings.TrimSpace(common.SMTPServer) == "" {
		return
	}
	now := time.Now().Unix()
	var events []EmailNotificationEvent
	if err := DB.Where("(((status = ? AND next_attempt <= ? AND attempts < ?) OR (status = ? AND created_at < ?)) AND receiver <> '')", emailEventFailed, now, 8, emailEventSending, now-600).Order("id").Limit(20).Find(&events).Error; err != nil {
		common.SysError(fmt.Sprintf("business email retry lookup failed: %v", err))
		return
	}
	for i := range events {
		claimed := DB.Model(&EmailNotificationEvent{}).
			Where("id = ? AND (status = ? OR (status = ? AND created_at < ?))", events[i].Id, emailEventFailed, emailEventSending, now-600).
			Updates(map[string]interface{}{"status": emailEventSending, "created_at": now})
		if claimed.Error != nil || claimed.RowsAffected != 1 {
			continue
		}
		event := events[i]
		go deliverBusinessEmail(&event, event.Subject, event.Receiver, event.Content, nil)
	}
}

func finishBusinessEmail(event *EmailNotificationEvent, subject, receiver, content string, onSent func()) {
	if event == nil {
		return
	}
	go deliverBusinessEmail(event, subject, receiver, content, onSent)
}

func sendBusinessEmail(eventKey, subject, receiver, content string) {
	event, ok := claimBusinessEmail(eventKey, subject, receiver, content)
	if !ok || strings.TrimSpace(receiver) == "" {
		return
	}
	finishBusinessEmail(event, subject, receiver, content, nil)
}

func sendBusinessEmailSync(eventKey, subject, receiver, content string) bool {
	event, ok := claimBusinessEmail(eventKey, subject, receiver, content)
	if !ok || strings.TrimSpace(receiver) == "" {
		return false
	}
	return deliverBusinessEmail(event, subject, receiver, content, nil)
}

func notifyAdmins(eventPrefix, subject, content string) {
	for _, address := range adminEmailAddresses() {
		sendBusinessEmail(eventPrefix+":"+strings.ToLower(address), subject, address, content)
	}
}

// NotifyPublishedAnnouncements sends only announcements that were newly added
// in an admin save. The event key includes the announcement identity and the
// recipient, so both retries and a second production node remain idempotent.
func NotifyPublishedAnnouncements(previousJSON, nextJSON string) {
	if strings.TrimSpace(common.SMTPServer) == "" {
		return
	}
	var previous, next []map[string]interface{}
	if err := common.Unmarshal([]byte(previousJSON), &previous); err != nil {
		previous = nil
	}
	if err := common.Unmarshal([]byte(nextJSON), &next); err != nil {
		return
	}
	known := make(map[string]struct{}, len(previous))
	for _, item := range previous {
		known[announcementIdentity(item)] = struct{}{}
	}
	newItems := make([]map[string]interface{}, 0)
	for _, item := range next {
		identity := announcementIdentity(item)
		if _, exists := known[identity]; exists {
			continue
		}
		newItems = append(newItems, item)
	}
	if len(newItems) == 0 {
		return
	}
	var users []User
	if err := DB.Select("id", "email").Where("status = ? AND email <> ''", common.UserStatusEnabled).Find(&users).Error; err != nil {
		common.SysError(fmt.Sprintf("announcement email user lookup failed: %v", err))
		return
	}
	for _, item := range newItems {
		content := announcementEmailContent(item)
		subject := announcementEmailSubject(item)
		identity := announcementIdentity(item)
		for _, user := range users {
			sendBusinessEmail("announcement:"+identity+":"+fmt.Sprint(user.Id), subject, user.Email, content)
		}
	}
}

func announcementIdentity(item map[string]interface{}) string {
	if id := strings.TrimSpace(fmt.Sprint(item["id"])); id != "" && id != "<nil>" {
		return id
	}
	data, _ := common.Marshal(struct {
		Content     interface{} `json:"content"`
		PublishDate interface{} `json:"publishDate"`
	}{item["content"], item["publishDate"]})
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func announcementEmailSubject(item map[string]interface{}) string {
	if title := strings.TrimSpace(fmt.Sprint(item["title"])); title != "" && title != "<nil>" {
		return "站点新公告：" + title
	}
	return "SynthAPI 有一条新公告"
}

func announcementEmailContent(item map[string]interface{}) string {
	content := emailText(fmt.Sprint(item["content"]))
	extra := strings.TrimSpace(fmt.Sprint(item["extra"]))
	if extra == "" || extra == "<nil>" {
		return fmt.Sprintf("<p>您好：</p><p>SynthAPI 刚发布了一条新的站点公告：</p><p>%s</p><p>您可以登录站点查看完整内容。</p>", content)
	}
	return fmt.Sprintf("<p>您好：</p><p>SynthAPI 刚发布了一条新的站点公告：</p><p>%s</p><p>%s</p><p>您可以登录站点查看完整内容。</p>", content, emailText(extra))
}

// NotifyInviteRegistration emails enabled administrators after an invited account is created.
func NotifyInviteRegistration(userID, inviterID int) {
	if userID <= 0 || inviterID <= 0 {
		return
	}
	var invitee, inviter User
	if DB.Select("id", "username", "email", "created_at").First(&invitee, userID).Error != nil || DB.Select("id", "username").First(&inviter, inviterID).Error != nil {
		return
	}
	content := fmt.Sprintf("<p>有一位新朋友通过邀请链接加入了 %s。</p><p>受邀用户：%s（ID %d）<br>邀请人：%s（ID %d）<br>注册时间：%s</p><p>可以在管理端用户与邀请返利页面继续查看。</p>", emailText(common.SystemName), emailText(invitee.Username), invitee.Id, emailText(inviter.Username), inviter.Id, time.Unix(invitee.CreatedAt, 0).Format("2006-01-02 15:04"))
	notifyAdmins(fmt.Sprintf("invite-registration:%d", invitee.Id), "有新用户通过邀请加入", content)
}

// NotifyInviteePayment informs the inviter after the first eligible payment.
func NotifyInviteePayment(tradeNo string) {
	var topUp TopUp
	if DB.Where("trade_no = ?", tradeNo).First(&topUp).Error != nil {
		return
	}
	var invitee, inviter User
	if DB.Select("id", "username", "inviter_id", "invite_reward_claimed").First(&invitee, topUp.UserId).Error != nil || invitee.InviterId <= 0 || !invitee.InviteRewardClaimed {
		return
	}
	if DB.Select("id", "username", "email").First(&inviter, invitee.InviterId).Error != nil || strings.TrimSpace(inviter.Email) == "" {
		return
	}
	content := fmt.Sprintf("<p>你好，%s：</p><p>你邀请的用户 %s 已完成一笔有效充值，邀请奖励已按站点规则结算。</p><p>充值金额：¥%.2f<br>本次交易号：%s</p><p>感谢你把 %s 推荐给朋友，奖励明细可以在邀请返利页面查看。</p>", emailText(inviter.Username), emailText(invitee.Username), topUp.Money, emailText(tradeNo), emailText(common.SystemName))
	sendBusinessEmail("invitee-payment:"+tradeNo+":"+fmt.Sprint(inviter.Id), "你的邀请奖励有新进展", inviter.Email, content)
}

func NotifyRechargeBenefitReview(claim *RechargeBenefitClaim) {
	if claim == nil {
		return
	}
	var user User
	if DB.Select("id", "username", "email").First(&user, claim.UserId).Error != nil || strings.TrimSpace(user.Email) == "" {
		return
	}
	result := "未通过"
	if claim.Status == RechargeBenefitStatusGranted {
		result = "已通过，奖励额度已发放"
	}
	content := fmt.Sprintf("<p>你好，%s：</p><p>你的千元充能申请已有审核结果：<strong>%s</strong>。</p><p>申请金额：¥%d<br>奖励额度：%d<br>管理员备注：%s</p><p>如有疑问，可以直接联系站点技术支持。</p>", emailText(user.Username), result, claim.ThresholdCNY, claim.RewardQuota, emailText(claim.AdminRemark))
	sendBusinessEmail(fmt.Sprintf("recharge-benefit-review:%d", claim.Id), "千元充能申请审核结果", user.Email, content)
}

// NotifySupportHandoff sends an admin-queue heads-up after a ticket is created.
func NotifySupportHandoff(ticketID string, userID int, question string) {
	if strings.TrimSpace(ticketID) == "" || userID <= 0 {
		return
	}
	var user User
	if DB.Select("id", "username", "email").First(&user, userID).Error != nil {
		return
	}
	content := fmt.Sprintf("<p>站点助手收到一条新的人工工单。</p><p>工单编号：%s<br>用户：%s（ID %d）<br>问题摘要：%s</p><p>请及时打开管理端的人工队列处理。</p>", emailText(ticketID), emailText(user.Username), user.Id, emailText(question))
	notifyAdmins("support-handoff:"+ticketID, "有新的人工工单待处理", content)
}

// SendInactiveUserReminder sends the friendly seven-day reminder synchronously so
// the last-sent timestamp only advances after SMTP has accepted the message.
func SendInactiveUserReminder(user *User, now int64) bool {
	if user == nil || strings.TrimSpace(user.Email) == "" || user.Id <= 0 || user.MarketingEmailOptOut {
		return false
	}
	name := user.DisplayName
	if strings.TrimSpace(name) == "" {
		name = user.Username
	}
	baseURL := "https://synthapi.asia"
	unsubscribe := fmt.Sprintf("%s/api/email/unsubscribe?id=%d&sig=%s", baseURL, user.Id, inactiveReminderSignature(user.Id))
	content := fmt.Sprintf("<p>朋友，您好：</p><p>有一阵子没在 %s 见到您了，我们还挺想念的。</p><p>如果您最近正好有编程、写作或整理资料的任务，欢迎回来用一个真实的小任务试试看：响应是否顺手、模型是否合适，亲自体验最可靠。</p><p>站点也准备了邀请返利、千元充能和使用教程。有问题可以通过网站售后渠道联系我们，我们会认真跟进。</p><p><a href=\"%s\">回到 %s 看看</a></p><p>不急着做决定，什么时候方便，回来坐坐就好。</p><p>%s 团队</p><hr><p style=\"color:#777;font-size:12px\">如果您不想再收到这类回访邮件，可以<a href=\"%s\">点此退订</a>。</p>", emailText(common.SystemName), baseURL, emailText(common.SystemName), emailText(common.SystemName), unsubscribe)
	return sendBusinessEmailSync(fmt.Sprintf("inactive-reminder:%d:%d", user.Id, user.LastLoginAt), "邀请您回来看看", user.Email, content)
}

func inactiveReminderSignature(userID int) string {
	mac := hmac.New(sha256.New, []byte(common.CryptoSecret))
	_, _ = mac.Write([]byte(fmt.Sprintf("inactive-reminder-unsubscribe:%d", userID)))
	return hex.EncodeToString(mac.Sum(nil))
}

func UnsubscribeInactiveReminders(userID int, signature string) error {
	if userID <= 0 || !hmac.Equal([]byte(strings.ToLower(signature)), []byte(inactiveReminderSignature(userID))) {
		return errors.New("invalid unsubscribe link")
	}
	return DB.Model(&User{}).Where("id = ?", userID).Update("marketing_email_opt_out", true).Error
}
