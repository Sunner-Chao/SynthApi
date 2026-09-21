package model

import (
	"context"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"gorm.io/gorm"
)

// MediaAuditQuery is always scoped by the authenticated controller. UserID zero
// means all users and is accepted only by the administrator route.
type MediaAuditQuery struct {
	Kind, View, Model, Identifier, Status string
	UserID, ChannelID, Offset, Limit      int
	Start, End                            int64
}

type MediaAuditRow struct {
	ID          string `json:"id"`
	Source      string `json:"source"`
	UserID      int    `json:"user_id,omitempty"`
	Username    string `json:"username,omitempty"`
	ChannelID   int    `json:"channel_id,omitempty"`
	CreatedAt   int64  `json:"created_at"`
	FinishTime  int64  `json:"finish_time,omitempty"`
	Model       string `json:"model"`
	TaskID      string `json:"task_id,omitempty"`
	RequestID   string `json:"request_id,omitempty"`
	Status      string `json:"status"`
	Action      string `json:"action,omitempty"`
	Quota       int    `json:"quota"`
	Duration    int    `json:"duration"`
	Prompt      string `json:"prompt,omitempty"`
	Message     string `json:"message,omitempty"`
	Progress    string `json:"progress,omitempty"`
	TokenName   string `json:"token_name,omitempty"`
	Group       string `json:"group,omitempty"`
	RequestPath string `json:"request_path,omitempty"`
	Size        string `json:"size,omitempty"`
	Quality     string `json:"quality,omitempty"`
	ImageCount  uint   `json:"image_count,omitempty"`
	ContentURL  string `json:"content_url,omitempty"`
}

type MediaAuditSummary struct {
	Total    int64 `json:"total"`
	Charged  int64 `json:"charged"`
	Refunded int64 `json:"refunded"`
	Errors   int64 `json:"errors"`
}

type MediaAuditPage struct {
	Page     int               `json:"page"`
	PageSize int               `json:"page_size"`
	Items    []MediaAuditRow   `json:"items"`
	Summary  MediaAuditSummary `json:"summary"`
}

func auditScope(tx *gorm.DB, q MediaAuditQuery, timeColumn string, millis bool) *gorm.DB {
	if q.UserID > 0 {
		tx = tx.Where("user_id = ?", q.UserID)
	}
	if q.ChannelID > 0 {
		tx = tx.Where("channel_id = ?", q.ChannelID)
	}
	start, end := q.Start, q.End
	if millis {
		start *= 1000
		end *= 1000
	}
	if start > 0 {
		tx = tx.Where(timeColumn+" >= ?", start)
	}
	if end > 0 {
		tx = tx.Where(timeColumn+" <= ?", end)
	}
	return tx
}

func GetMediaAuditPage(ctx context.Context, q MediaAuditQuery) (MediaAuditPage, error) {
	page := MediaAuditPage{Items: []MediaAuditRow{}}
	switch q.View {
	case "requests":
		tx := auditScope(LOG_DB.WithContext(ctx).Model(&Log{}), q, "created_at", false).
			Where(mediaLogCondition(q.Kind)).Where("type IN ?", []int{LogTypeConsume, LogTypeRefund, LogTypeError})
		if q.Model != "" {
			tx = tx.Where("model_name = ?", q.Model)
		}
		if q.Identifier != "" {
			encoded, _ := common.Marshal(q.Identifier)
			pattern := `"task_id":` + string(encoded)
			pattern = strings.NewReplacer("!", "!!", "%", "!%", "_", "!_").Replace(pattern)
			tx = tx.Where("(request_id = ? OR upstream_request_id = ? OR REPLACE(other, ' ', '') LIKE ? ESCAPE '!')", q.Identifier, q.Identifier, "%"+pattern+"%")
		}
		statuses := map[string]int{"CONSUME": LogTypeConsume, "REFUND": LogTypeRefund, "ERROR": LogTypeError}
		if q.Status != "" {
			tx = tx.Where("type = ?", statuses[q.Status])
		}
		if err := tx.Select("COUNT(*) total, COALESCE(SUM(CASE WHEN type = 2 THEN quota ELSE 0 END),0) charged, COALESCE(SUM(CASE WHEN type = 6 THEN quota ELSE 0 END),0) refunded, COALESCE(SUM(CASE WHEN type = 5 THEN 1 ELSE 0 END),0) errors").Scan(&page.Summary).Error; err != nil {
			return page, err
		}
		var logs []Log
		if err := tx.Select("*").Order("created_at DESC, id DESC").Offset(q.Offset).Limit(q.Limit).Find(&logs).Error; err != nil {
			return page, err
		}
		for _, log := range logs {
			var other struct {
				TaskID      string `json:"task_id"`
				RequestPath string `json:"request_path"`
			}
			_ = common.UnmarshalJsonStr(log.Other, &other)
			status := "CONSUME"
			if log.Type == LogTypeRefund {
				status = "REFUND"
			}
			if log.Type == LogTypeError {
				status = "ERROR"
			}
			page.Items = append(page.Items, MediaAuditRow{ID: "log:" + strconv.Itoa(log.Id), Source: "request", UserID: log.UserId, Username: log.Username, ChannelID: log.ChannelId, CreatedAt: log.CreatedAt, Model: log.ModelName, TaskID: other.TaskID, RequestID: log.RequestId, Status: status, Quota: log.Quota, Duration: log.UseTime, Message: log.Content, TokenName: log.TokenName, Group: log.Group, RequestPath: other.RequestPath})
		}
	case "tasks":
		tx := auditScope(DB.WithContext(ctx).Model(&Task{}), q, "submit_time", false)
		if q.Kind == "image" {
			tx = tx.Where("action = ?", constant.TaskActionImageGenerate)
		} else {
			tx = tx.Where("action IN ? AND platform <> ?", videoHistoryActions(), constant.TaskPlatformSuno)
		}
		if q.Identifier != "" {
			tx = tx.Where("task_id = ?", q.Identifier)
		}
		if q.Status != "" {
			tx = tx.Where("status = ?", q.Status)
		}
		if q.Model != "" {
			// Properties is JSON text on all supported databases. Match a complete,
			// escaped JSON string instead of accepting SQL wildcard input.
			encoded, _ := common.Marshal(q.Model)
			pattern := `"origin_model_name":` + string(encoded)
			pattern = strings.NewReplacer("!", "!!", "%", "!%", "_", "!_").Replace(pattern)
			castType := "TEXT"
			if DB.Dialector.Name() == "mysql" {
				castType = "CHAR"
			}
			tx = tx.Where("REPLACE(CAST(properties AS "+castType+"), ' ', '') LIKE ? ESCAPE '!'", "%"+pattern+"%")
		}
		return mediaTaskPage(tx, q)
	case "midjourney":
		tx := auditScope(DB.WithContext(ctx).Model(&Midjourney{}), q, "submit_time", true)
		if q.Kind == "video" {
			tx = tx.Where("LOWER(action) LIKE ?", "%video%")
		} else {
			tx = tx.Where("LOWER(action) NOT LIKE ?", "%video%")
		}
		if q.Identifier != "" {
			tx = tx.Where("mj_id = ?", q.Identifier)
		}
		if q.Model != "" && q.Model != "midjourney" {
			tx = tx.Where("1 = 0")
		}
		if q.Status != "" {
			tx = tx.Where("status = ?", q.Status)
		}
		if err := tx.Count(&page.Summary.Total).Error; err != nil {
			return page, err
		}
		var tasks []Midjourney
		if err := tx.Order("id DESC").Offset(q.Offset).Limit(q.Limit).Find(&tasks).Error; err != nil {
			return page, err
		}
		for _, task := range tasks {
			page.Items = append(page.Items, MediaAuditRow{ID: "mj:" + strconv.Itoa(task.Id), Source: "midjourney", UserID: task.UserId, ChannelID: task.ChannelId, CreatedAt: task.SubmitTime / 1000, FinishTime: task.FinishTime / 1000, Model: "midjourney", TaskID: task.MjId, Status: task.Status, Action: task.Action, Quota: task.Quota, Prompt: task.Prompt, Message: task.FailReason, Progress: task.Progress})
		}
	}
	return page, nil
}

func mediaTaskPage(tx *gorm.DB, q MediaAuditQuery) (MediaAuditPage, error) {
	page := MediaAuditPage{Items: []MediaAuditRow{}}
	if err := tx.Count(&page.Summary.Total).Error; err != nil {
		return page, err
	}
	var tasks []Task
	if err := tx.Order("id DESC").Offset(q.Offset).Limit(q.Limit).Find(&tasks).Error; err != nil {
		return page, err
	}
	for _, task := range tasks {
		message := ""
		if task.Status == TaskStatusFailure {
			message = task.FailReason
		}
		row := MediaAuditRow{ID: "task:" + strconv.FormatInt(task.ID, 10), Source: "task", UserID: task.UserId, ChannelID: task.ChannelId, CreatedAt: task.SubmitTime, FinishTime: task.FinishTime, Model: task.Properties.OriginModelName, TaskID: task.TaskID, RequestID: task.Properties.RequestID, Status: string(task.Status), Action: task.Action, Quota: task.Quota, Prompt: task.Properties.Input, Message: message, Progress: task.Progress, Size: task.Properties.ImageSize, Quality: task.Properties.ImageQuality, ImageCount: task.Properties.ImageCount, Group: task.Group}
		if row.Model == "" {
			row.Model = task.Properties.UpstreamModelName
		}
		if task.FinishTime > task.SubmitTime {
			row.Duration = int(task.FinishTime - task.SubmitTime)
		}
		page.Items = append(page.Items, row)
	}
	return page, nil
}
