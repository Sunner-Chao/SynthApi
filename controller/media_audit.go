package controller

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func GetMediaAudit(c *gin.Context)    { getMediaAudit(c, false) }
func GetAllMediaAudit(c *gin.Context) { getMediaAudit(c, true) }

func getMediaAudit(c *gin.Context, admin bool) {
	kind, view := c.Param("kind"), c.DefaultQuery("view", "requests")
	if (kind != "image" && kind != "video") || (view != "requests" && view != "tasks" && view != "midjourney") {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid media kind or view"})
		return
	}
	start, e1 := strconv.ParseInt(c.DefaultQuery("start_timestamp", strconv.FormatInt(time.Now().Add(-7*24*time.Hour).Unix(), 10)), 10, 64)
	end, e2 := strconv.ParseInt(c.DefaultQuery("end_timestamp", strconv.FormatInt(time.Now().Unix(), 10)), 10, 64)
	if e1 != nil || e2 != nil || start <= 0 || end < start || end-start > 93*24*3600 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Select a valid time range of at most 93 days"})
		return
	}
	page := common.GetPageQuery(c)
	if page.Page < 1 || page.Page > 1000000 || page.PageSize < 1 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid pagination"})
		return
	}
	if c.GetInt("id") <= 0 {
		c.Status(http.StatusUnauthorized)
		return
	}
	validStatuses := map[string]bool{"": true}
	if view == "requests" {
		for _, s := range []string{"CONSUME", "REFUND", "ERROR"} {
			validStatuses[s] = true
		}
	} else {
		for _, s := range []string{"NOT_START", "SUBMITTED", "QUEUED", "IN_PROGRESS", "FAILURE", "SUCCESS", "UNKNOWN", "MODAL"} {
			validStatuses[s] = true
		}
	}
	if !validStatuses[c.Query("status")] {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid media status"})
		return
	}
	q := model.MediaAuditQuery{Kind: kind, View: view, Start: start, End: end, Limit: page.GetPageSize(), Offset: page.GetStartIdx(), Model: strings.TrimSpace(c.Query("model")), Identifier: strings.TrimSpace(c.Query("identifier")), Status: c.Query("status")}
	if q.Limit > 100 {
		q.Limit = 100
	}
	if len(q.Model) > 256 || len(q.Identifier) > 256 {
		c.Status(http.StatusBadRequest)
		return
	}
	if admin {
		for key, target := range map[string]*int{"user_id": &q.UserID, "channel_id": &q.ChannelID} {
			if value := c.Query(key); value != "" {
				n, err := strconv.Atoi(value)
				if err != nil || n < 1 {
					c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid user or channel ID"})
					return
				}
				*target = n
			}
		}
	} else {
		q.UserID = c.GetInt("id")
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 12*time.Second)
	defer cancel()
	result, err := model.GetMediaAuditPage(ctx, q)
	if err != nil {
		common.SysError("media audit query failed: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Unable to load media logs"})
		return
	}
	result.Page = page.Page
	result.PageSize = q.Limit
	scope := "self"
	if admin {
		scope = "admin"
	}
	for i := range result.Items {
		row := &result.Items[i]
		if row.Source == "task" && row.Status == string(model.TaskStatusSuccess) {
			row.ContentURL = "/api/media-logs/" + scope + "/" + kind + "/" + url.PathEscape(row.TaskID) + "/content"
		}
		if !admin {
			row.ChannelID = 0
			row.UserID = 0
			row.Username = ""
		}
	}
	common.ApiSuccess(c, result)
}

func MediaAuditContent(c *gin.Context)      { mediaAuditContent(c, false) }
func MediaAuditAdminContent(c *gin.Context) { mediaAuditContent(c, true) }

func mediaAuditContent(c *gin.Context, admin bool) {
	kind := c.Param("kind")
	if kind != "image" && kind != "video" {
		c.Status(http.StatusBadRequest)
		return
	}
	task, exists, err := model.GetByOnlyTaskId(c.Param("task_id"))
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	if !exists || task == nil || (!admin && task.UserId != c.GetInt("id")) {
		c.Status(http.StatusNotFound)
		return
	}
	isImage := task.Action == constant.TaskActionImageGenerate
	isVideo := false
	for _, action := range []string{constant.TaskActionVideoGenerate, constant.TaskActionGenerate, constant.TaskActionTextGenerate, constant.TaskActionFirstTailGenerate, constant.TaskActionReferenceGenerate, constant.TaskActionRemix} {
		if task.Action == action {
			isVideo = true
		}
	}
	if (kind == "image" && !isImage) || (kind == "video" && !isVideo) || task.Platform == constant.TaskPlatformSuno {
		c.Status(http.StatusNotFound)
		return
	}
	// AdminAuth guards the administrator route. Existing media proxies perform
	// ownership checks; use the selected owner's identity only for this request.
	originalUser := c.GetInt("id")
	c.Set("id", task.UserId)
	defer c.Set("id", originalUser)
	if isImage {
		ImageProxy(c)
	} else {
		VideoProxy(c)
	}
}
