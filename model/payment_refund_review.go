package model

import (
	"errors"
	"math"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const PaymentRefundReviewStatusPending = "pending_review"

var ErrPaymentRefundReviewMismatch = errors.New("payment refund review identity mismatch")

type PaymentRefundReview struct {
	Id                 int     `json:"id"`
	PaymentProvider    string  `json:"payment_provider" gorm:"type:varchar(50);not null;uniqueIndex:idx_refund_review_order,priority:1"`
	LocalTradeNo       string  `json:"local_trade_no" gorm:"type:varchar(128);not null;uniqueIndex:idx_refund_review_order,priority:2"`
	ProviderTradeNo    string  `json:"provider_trade_no" gorm:"type:varchar(128);not null;index"`
	OrderKind          string  `json:"order_kind" gorm:"type:varchar(32);not null"`
	UserId             int     `json:"user_id" gorm:"not null;index"`
	Amount             float64 `json:"amount" gorm:"type:decimal(20,6);not null"`
	Currency           string  `json:"currency" gorm:"type:varchar(8);not null"`
	ProviderStatus     string  `json:"provider_status" gorm:"type:varchar(32);not null"`
	RefundAmount       float64 `json:"refund_amount" gorm:"type:decimal(20,6);not null;default:0"`
	ProviderRefundNo   string  `json:"provider_refund_no" gorm:"type:varchar(128);not null;default:''"`
	ProviderRefundedAt string  `json:"provider_refunded_at" gorm:"type:varchar(32);not null;default:''"`
	Status             string  `json:"status" gorm:"type:varchar(32);not null;index"`
	FirstNotifiedAt    int64   `json:"first_notified_at" gorm:"not null;index"`
	LastNotifiedAt     int64   `json:"last_notified_at" gorm:"not null;index"`
	NotificationCount  int64   `json:"notification_count" gorm:"not null;default:1"`
	LastSource         string  `json:"last_source" gorm:"type:varchar(32);not null"`
	CreatedAt          int64   `json:"created_at" gorm:"not null"`
	UpdatedAt          int64   `json:"updated_at" gorm:"not null"`
}

type PaymentRefundReviewInput struct {
	PaymentProvider    string
	LocalTradeNo       string
	ProviderTradeNo    string
	OrderKind          string
	UserId             int
	Amount             float64
	Currency           string
	ProviderStatus     string
	RefundAmount       float64
	ProviderRefundNo   string
	ProviderRefundedAt string
	Source             string
}

func UpsertPaymentRefundReview(input PaymentRefundReviewInput) (*PaymentRefundReview, error) {
	input.PaymentProvider = strings.TrimSpace(input.PaymentProvider)
	input.LocalTradeNo = strings.TrimSpace(input.LocalTradeNo)
	input.ProviderTradeNo = strings.TrimSpace(input.ProviderTradeNo)
	input.OrderKind = strings.TrimSpace(input.OrderKind)
	input.Currency = strings.ToUpper(strings.TrimSpace(input.Currency))
	input.ProviderStatus = strings.TrimSpace(input.ProviderStatus)
	input.ProviderRefundNo = strings.TrimSpace(input.ProviderRefundNo)
	input.ProviderRefundedAt = strings.TrimSpace(input.ProviderRefundedAt)
	input.Source = strings.TrimSpace(input.Source)
	if math.IsNaN(input.RefundAmount) || math.IsInf(input.RefundAmount, 0) || input.RefundAmount < 0 {
		return nil, errors.New("invalid payment refund amount")
	}
	if input.PaymentProvider == "" || input.LocalTradeNo == "" || input.ProviderTradeNo == "" ||
		input.OrderKind == "" || input.UserId <= 0 || input.Amount <= 0 || input.Currency == "" ||
		input.ProviderStatus == "" || input.Source == "" {
		return nil, errors.New("invalid payment refund review input")
	}

	now := common.GetTimestamp()
	var review PaymentRefundReview
	err := DB.Transaction(func(tx *gorm.DB) error {
		candidate := PaymentRefundReview{
			PaymentProvider:    input.PaymentProvider,
			LocalTradeNo:       input.LocalTradeNo,
			ProviderTradeNo:    input.ProviderTradeNo,
			OrderKind:          input.OrderKind,
			UserId:             input.UserId,
			Amount:             input.Amount,
			Currency:           input.Currency,
			ProviderStatus:     input.ProviderStatus,
			RefundAmount:       input.RefundAmount,
			ProviderRefundNo:   input.ProviderRefundNo,
			ProviderRefundedAt: input.ProviderRefundedAt,
			Status:             PaymentRefundReviewStatusPending,
			FirstNotifiedAt:    now,
			LastNotifiedAt:     now,
			NotificationCount:  1,
			LastSource:         input.Source,
			CreatedAt:          now,
			UpdatedAt:          now,
		}
		if err := tx.Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "payment_provider"}, {Name: "local_trade_no"}},
			DoUpdates: clause.Assignments(map[string]interface{}{
				"provider_status":      input.ProviderStatus,
				"refund_amount":        gorm.Expr("CASE WHEN ? > refund_amount THEN ? ELSE refund_amount END", input.RefundAmount, input.RefundAmount),
				"provider_refund_no":   gorm.Expr("CASE WHEN ? <> '' THEN ? ELSE provider_refund_no END", input.ProviderRefundNo, input.ProviderRefundNo),
				"provider_refunded_at": gorm.Expr("CASE WHEN ? <> '' THEN ? ELSE provider_refunded_at END", input.ProviderRefundedAt, input.ProviderRefundedAt),
				"last_notified_at":     now,
				"notification_count":   gorm.Expr("notification_count + ?", 1),
				"last_source":          input.Source,
				"updated_at":           now,
			}),
		}).Create(&candidate).Error; err != nil {
			return err
		}
		if err := tx.Where("payment_provider = ? AND local_trade_no = ?", input.PaymentProvider, input.LocalTradeNo).
			First(&review).Error; err != nil {
			return err
		}
		if review.ProviderTradeNo != input.ProviderTradeNo || review.OrderKind != input.OrderKind ||
			review.UserId != input.UserId || review.Currency != input.Currency ||
			!decimal.NewFromFloat(review.Amount).Equal(decimal.NewFromFloat(input.Amount)) {
			return ErrPaymentRefundReviewMismatch
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &review, nil
}

func ListPaymentRefundReviews(pageInfo *common.PageInfo, status string, tradeNo string) ([]PaymentRefundReview, int64, error) {
	if pageInfo == nil {
		return nil, 0, errors.New("page info is nil")
	}
	query := DB.Model(&PaymentRefundReview{})
	if status = strings.TrimSpace(status); status != "" {
		query = query.Where("status = ?", status)
	}
	if tradeNo = strings.TrimSpace(tradeNo); tradeNo != "" {
		query = query.Where("local_trade_no = ? OR provider_trade_no = ?", tradeNo, tradeNo)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var reviews []PaymentRefundReview
	if err := query.Order("last_notified_at desc, id desc").
		Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&reviews).Error; err != nil {
		return nil, 0, err
	}
	return reviews, total, nil
}
