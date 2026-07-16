package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestUpsertPaymentRefundReviewIsIdempotentAndCountsNotifications(t *testing.T) {
	truncateTables(t)
	input := PaymentRefundReviewInput{
		PaymentProvider: PaymentProviderAlipayDirect,
		LocalTradeNo:    "ALI-refund-review-1",
		ProviderTradeNo: "provider-refund-review-1",
		OrderKind:       "topup",
		UserId:          808,
		Amount:          7.30,
		Currency:        "CNY",
		ProviderStatus:  "TRADE_CLOSED",
		Source:          "webhook",
	}
	first, err := UpsertPaymentRefundReview(input)
	require.NoError(t, err)
	require.Equal(t, int64(1), first.NotificationCount)
	second, err := UpsertPaymentRefundReview(input)
	require.NoError(t, err)
	require.Equal(t, first.Id, second.Id)
	require.Equal(t, int64(2), second.NotificationCount)
	require.Equal(t, first.FirstNotifiedAt, second.FirstNotifiedAt)
	require.GreaterOrEqual(t, second.LastNotifiedAt, first.LastNotifiedAt)

	var count int64
	require.NoError(t, DB.Model(&PaymentRefundReview{}).Count(&count).Error)
	require.Equal(t, int64(1), count)

	mismatched := input
	mismatched.ProviderTradeNo = "different-provider-trade"
	_, err = UpsertPaymentRefundReview(mismatched)
	require.ErrorIs(t, err, ErrPaymentRefundReviewMismatch)
	var persisted PaymentRefundReview
	require.NoError(t, DB.First(&persisted, first.Id).Error)
	require.Equal(t, int64(2), persisted.NotificationCount)
}

func TestUpsertPaymentRefundReviewRejectsNegativeRefundAmount(t *testing.T) {
	truncateTables(t)
	_, err := UpsertPaymentRefundReview(PaymentRefundReviewInput{
		PaymentProvider: PaymentProviderAlipayDirect,
		LocalTradeNo:    "ALI-negative-refund",
		ProviderTradeNo: "provider-negative-refund",
		OrderKind:       "topup",
		UserId:          808,
		Amount:          7.30,
		Currency:        "CNY",
		ProviderStatus:  "TRADE_SUCCESS",
		RefundAmount:    -1,
		Source:          "webhook",
	})
	require.Error(t, err)
}

func TestListPaymentRefundReviewsFiltersStatusAndTradeNumber(t *testing.T) {
	truncateTables(t)
	_, err := UpsertPaymentRefundReview(PaymentRefundReviewInput{
		PaymentProvider: PaymentProviderAlipayDirect,
		LocalTradeNo:    "ALI-refund-review-list",
		ProviderTradeNo: "provider-refund-review-list",
		OrderKind:       "subscription",
		UserId:          909,
		Amount:          19.99,
		Currency:        "CNY",
		ProviderStatus:  "TRADE_CLOSED",
		Source:          "query",
	})
	require.NoError(t, err)

	reviews, total, err := ListPaymentRefundReviews(
		&common.PageInfo{Page: 1, PageSize: 20},
		PaymentRefundReviewStatusPending,
		"provider-refund-review-list",
	)
	require.NoError(t, err)
	require.Equal(t, int64(1), total)
	require.Len(t, reviews, 1)
	require.Equal(t, "ALI-refund-review-list", reviews[0].LocalTradeNo)
}
