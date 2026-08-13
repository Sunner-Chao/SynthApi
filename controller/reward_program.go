package controller

import (
	"errors"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
)

type rechargeBenefitReviewRequest struct {
	Remark string `json:"remark"`
}

func GetRewardProgramOverview(c *gin.Context) {
	program := strings.TrimSpace(c.Query("program"))
	if program == "affiliate" && !setting.IsAffiliateMilestoneRewardEnabled() {
		common.ApiError(c, errors.New("邀请返利活动当前未开放"))
		return
	}
	if program == "recharge" && !setting.IsRechargeBenefitEnabled() {
		common.ApiError(c, errors.New("千元充能活动当前未开放"))
		return
	}
	if program != "affiliate" && program != "recharge" {
		common.ApiError(c, errors.New("invalid reward program"))
		return
	}
	overview, err := model.GetRewardProgramOverview(c.GetInt("id"), program)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, overview)
}

func RequestRechargeBenefit(c *gin.Context) {
	claim, err := model.RequestRechargeBenefit(c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, claim)
}

func AdminListRechargeBenefitClaims(c *gin.Context) {
	// Administrators must retain access to the audit queue when an activity is
	// disabled. Disabling a program blocks new user claims, but must not hide
	// historical applications or prevent an administrator from resolving them.
	pageInfo := common.GetPageQuery(c)
	claims, total, err := model.ListRechargeBenefitClaims(pageInfo, strings.TrimSpace(c.Query("status")))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(claims)
	common.ApiSuccess(c, pageInfo)
}

func AdminGetUserRewardSummary(c *gin.Context) {
	userID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	summary, err := model.GetAdminUserRewardSummary(userID)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, summary)
}

func AdminGetUserRewardListSummaries(c *gin.Context) {
	rawIDs := strings.Split(c.Query("ids"), ",")
	if len(rawIDs) > 100 {
		common.ApiError(c, errors.New("too many user ids"))
		return
	}
	userIDs := make([]int, 0, len(rawIDs))
	for _, rawID := range rawIDs {
		userID, err := strconv.Atoi(strings.TrimSpace(rawID))
		if err != nil || userID <= 0 {
			continue
		}
		userIDs = append(userIDs, userID)
	}
	summaries, err := model.GetAdminUserRewardListSummaries(userIDs)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, summaries)
}

func reviewRechargeBenefit(c *gin.Context, grant bool) {
	// Existing claims remain reviewable after the public program is disabled.
	claimID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var req rechargeBenefitReviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	claim, err := model.ReviewRechargeBenefitClaim(claimID, c.GetInt("id"), grant, req.Remark)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, claim)
}

func AdminGrantRechargeBenefit(c *gin.Context) {
	reviewRechargeBenefit(c, true)
}

func AdminRejectRechargeBenefit(c *gin.Context) {
	reviewRechargeBenefit(c, false)
}
