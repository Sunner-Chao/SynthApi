package service

import (
	"errors"
	"math"

	"github.com/shopspring/decimal"
)

func NormalizePaymentTopUpAmount(amount float64) (float64, error) {
	if math.IsNaN(amount) || math.IsInf(amount, 0) || amount <= 0 {
		return 0, errors.New("充值数量必须大于 0")
	}
	original := decimal.NewFromFloat(amount)
	normalized := original.Round(2)
	if normalized.LessThan(decimal.NewFromFloat(0.01)) {
		return 0, errors.New("充值数量四舍五入后必须至少为 0.01")
	}
	return normalized.InexactFloat64(), nil
}
