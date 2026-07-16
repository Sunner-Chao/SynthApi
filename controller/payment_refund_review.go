package controller

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func AdminListPaymentRefundReviews(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	reviews, total, err := model.ListPaymentRefundReviews(
		pageInfo,
		strings.TrimSpace(c.Query("status")),
		strings.TrimSpace(c.Query("trade_no")),
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(reviews)
	common.ApiSuccess(c, pageInfo)
}
