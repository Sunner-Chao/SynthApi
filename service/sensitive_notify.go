package service

import (
	"fmt"
	"html"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/bytedance/gopkg/util/gopool"
)

type SensitiveRiskEvent struct {
	UserId      int
	UserEmail   string
	UserSetting dto.UserSetting
	UserGroup   string
	TokenGroup  string
	UsingGroup  string
	ModelName   string
	RequestId   string
	RequestPath string
	ClientIP    string
	RiskScore   int
	Words       []string
	Prompt      string
}

func NotifySensitiveRisk(event SensitiveRiskEvent) {
	if !setting.SensitiveNotifyAdminEmailEnabled && !setting.SensitiveNotifyUserEmailEnabled {
		return
	}

	event.Words = uniqueNonEmpty(event.Words)
	gopool.Go(func() {
		if setting.SensitiveNotifyAdminEmailEnabled {
			notifySensitiveRiskAdminEmail(event)
		}
		if setting.SensitiveNotifyUserEmailEnabled {
			notifySensitiveRiskUserEmail(event)
		}
	})
}

func NewSensitiveRiskEvent(info *relaycommon.RelayInfo, clientIP string, words []string, prompt string) SensitiveRiskEvent {
	return NewSensitiveRiskEventWithScore(info, clientIP, 0, words, prompt)
}

func NewSensitiveRiskEventWithScore(info *relaycommon.RelayInfo, clientIP string, riskScore int, words []string, prompt string) SensitiveRiskEvent {
	if info == nil {
		return SensitiveRiskEvent{
			ClientIP:  clientIP,
			RiskScore: riskScore,
			Words:     words,
			Prompt:    prompt,
		}
	}
	return SensitiveRiskEvent{
		UserId:      info.UserId,
		UserEmail:   info.UserEmail,
		UserSetting: info.UserSetting,
		UserGroup:   info.UserGroup,
		TokenGroup:  info.TokenGroup,
		UsingGroup:  info.UsingGroup,
		ModelName:   info.OriginModelName,
		RequestId:   info.RequestId,
		RequestPath: info.RequestURLPath,
		ClientIP:    clientIP,
		RiskScore:   riskScore,
		Words:       words,
		Prompt:      prompt,
	}
}

func notifySensitiveRiskAdminEmail(event SensitiveRiskEvent) {
	rootUser := model.GetRootUser()
	if rootUser == nil || rootUser.Id <= 0 {
		common.SysLog("sensitive risk admin email skipped: root user not found")
		return
	}

	rootSetting := rootUser.GetSetting()
	rootSetting.NotifyType = dto.NotifyTypeEmail
	subject := fmt.Sprintf("敏感风控邮件提醒：用户 #%d 请求已拦截", event.UserId)
	content := sensitiveRiskAdminContent(event)
	if err := NotifyUser(rootUser.Id, rootUser.Email, rootSetting, dto.NewNotify(dto.NotifyTypeSensitiveRisk, subject, content, nil)); err != nil {
		common.SysError(fmt.Sprintf("failed to send sensitive risk admin email to root user %d: %s", rootUser.Id, err.Error()))
	}
}

func notifySensitiveRiskUserEmail(event SensitiveRiskEvent) {
	if event.UserId <= 0 {
		return
	}
	userEmail := strings.TrimSpace(event.UserEmail)
	notifyEmail := strings.TrimSpace(event.UserSetting.NotificationEmail)
	if userEmail == "" && notifyEmail == "" {
		common.SysLog(fmt.Sprintf("sensitive risk notify skipped: user %d has no email", event.UserId))
		return
	}

	userSetting := event.UserSetting
	userSetting.NotifyType = dto.NotifyTypeEmail
	subject := "请求已被安全策略拦截"
	content := sensitiveRiskUserContent(event)
	if err := NotifyUser(event.UserId, userEmail, userSetting, dto.NewNotify(dto.NotifyTypeSensitiveRisk, subject, content, nil)); err != nil {
		common.SysError(fmt.Sprintf("failed to send sensitive risk notify to user %d: %s", event.UserId, err.Error()))
	}
}

func sensitiveRiskAdminContent(event SensitiveRiskEvent) string {
	rows := []struct {
		label string
		value string
	}{
		{"触发时间", time.Now().Format("2006-01-02 15:04:05 MST")},
		{"请求 ID", event.RequestId},
		{"用户 ID", fmt.Sprintf("%d", event.UserId)},
		{"用户邮箱", event.UserEmail},
		{"用户邮箱（脱敏）", common.MaskEmail(event.UserEmail)},
		{"客户端 IP", event.ClientIP},
		{"模型", event.ModelName},
		{"用户分组", event.UserGroup},
		{"令牌分组", event.TokenGroup},
		{"实际分组", event.UsingGroup},
		{"请求路径", event.RequestPath},
		{"风险分数", fmt.Sprintf("%d", event.RiskScore)},
		{"命中规则", strings.Join(event.Words, ", ")},
	}

	var builder strings.Builder
	builder.WriteString("<p>系统检测到用户请求命中敏感词/风控规则，已在转发上游前拦截。以下内容仅包含用户提示词，请用于管理员审计。</p>")
	builder.WriteString("<table style='border-collapse:collapse;width:100%;max-width:900px'>")
	for _, row := range rows {
		builder.WriteString("<tr>")
		builder.WriteString("<td style='border:1px solid #ddd;padding:6px 8px;font-weight:600;white-space:nowrap'>")
		builder.WriteString(html.EscapeString(row.label))
		builder.WriteString("</td><td style='border:1px solid #ddd;padding:6px 8px'>")
		builder.WriteString(html.EscapeString(emptyDash(row.value)))
		builder.WriteString("</td></tr>")
	}
	builder.WriteString("</table>")
	builder.WriteString("<p style='margin-top:16px;font-weight:600'>用户提示词</p>")
	builder.WriteString("<pre style='white-space:pre-wrap;word-break:break-word;border:1px solid #ddd;border-radius:6px;padding:12px;background:#f7f7f7'>")
	builder.WriteString(html.EscapeString(emptyDash(event.Prompt)))
	builder.WriteString("</pre>")
	return builder.String()
}

func sensitiveRiskUserContent(event SensitiveRiskEvent) string {
	rows := []struct {
		label string
		value string
	}{
		{"触发时间", time.Now().Format("2006-01-02 15:04:05 MST")},
		{"请求 ID", event.RequestId},
		{"模型", event.ModelName},
	}

	var builder strings.Builder
	builder.WriteString("<p>您好，您的请求触发了平台安全策略，系统已自动拦截本次请求。</p>")
	builder.WriteString("<p>请检查输入内容是否符合平台使用规范。如有疑问，请联系管理员并提供以下请求信息。</p>")
	builder.WriteString("<table style='border-collapse:collapse;width:100%;max-width:720px'>")
	for _, row := range rows {
		builder.WriteString("<tr>")
		builder.WriteString("<td style='border:1px solid #ddd;padding:6px 8px;font-weight:600;white-space:nowrap'>")
		builder.WriteString(html.EscapeString(row.label))
		builder.WriteString("</td><td style='border:1px solid #ddd;padding:6px 8px'>")
		builder.WriteString(html.EscapeString(emptyDash(row.value)))
		builder.WriteString("</td></tr>")
	}
	builder.WriteString("</table>")
	return builder.String()
}

func uniqueNonEmpty(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func emptyDash(value string) string {
	if strings.TrimSpace(value) == "" {
		return "-"
	}
	return value
}
