package model

import (
	"errors"
	"math"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	LowQuotaNotifyScopeWallet       = "wallet"
	LowQuotaNotifyScopeSubscription = "subscription"
)

type LowQuotaNotifyState struct {
	Id        int    `json:"id"`
	UserId    int    `json:"user_id" gorm:"uniqueIndex:idx_low_quota_notify_state,priority:1"`
	Scope     string `json:"scope" gorm:"type:varchar(32);uniqueIndex:idx_low_quota_notify_state,priority:2"`
	RefId     int    `json:"ref_id" gorm:"uniqueIndex:idx_low_quota_notify_state,priority:3"`
	CreatedAt int64  `json:"created_at" gorm:"bigint"`
	UpdatedAt int64  `json:"updated_at" gorm:"bigint"`
}

func (s *LowQuotaNotifyState) BeforeCreate(tx *gorm.DB) error {
	now := common.GetTimestamp()
	s.CreatedAt = now
	s.UpdatedAt = now
	return nil
}

func (s *LowQuotaNotifyState) BeforeUpdate(tx *gorm.DB) error {
	s.UpdatedAt = common.GetTimestamp()
	return nil
}

func TryMarkLowQuotaNotified(userId int, scope string, refId int) (bool, error) {
	if userId <= 0 || scope == "" {
		return false, errors.New("invalid low quota notify state")
	}
	state := LowQuotaNotifyState{
		UserId: userId,
		Scope:  scope,
		RefId:  refId,
	}
	result := DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&state)
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected > 0, nil
}

func ClearLowQuotaNotifyState(userId int, scope string, refId int) error {
	return ClearLowQuotaNotifyStateTx(DB, userId, scope, refId)
}

func ClearLowQuotaNotifyStateTx(tx *gorm.DB, userId int, scope string, refId int) error {
	if userId <= 0 || scope == "" {
		return nil
	}
	if tx == nil {
		tx = DB
	}
	return tx.Where("user_id = ? AND scope = ? AND ref_id = ?", userId, scope, refId).
		Delete(&LowQuotaNotifyState{}).Error
}

func LowQuotaNotifyThreshold(userSettingThreshold float64) int {
	threshold := common.QuotaRemindThreshold
	oneCNYThreshold := oneCNYQuotaThreshold()
	if oneCNYThreshold > threshold {
		threshold = oneCNYThreshold
	}
	if userSettingThreshold != 0 {
		threshold = int(userSettingThreshold)
		if oneCNYThreshold > threshold {
			threshold = oneCNYThreshold
		}
	}
	return threshold
}

func ClearWalletLowQuotaNotifyStateIfRecovered(userId int) error {
	if userId <= 0 {
		return nil
	}
	user, err := GetUserById(userId, true)
	if err != nil {
		return err
	}
	threshold := LowQuotaNotifyThreshold(user.GetSetting().QuotaWarningThreshold)
	if user.Quota < threshold {
		return nil
	}
	return ClearLowQuotaNotifyState(userId, LowQuotaNotifyScopeWallet, 0)
}

func ClearWalletLowQuotaNotifyStateIfRecoveredTx(tx *gorm.DB, userId int) error {
	if tx == nil {
		tx = DB
	}
	if userId <= 0 {
		return nil
	}
	var user User
	if err := tx.Where("id = ?", userId).First(&user).Error; err != nil {
		return err
	}
	threshold := LowQuotaNotifyThreshold(user.GetSetting().QuotaWarningThreshold)
	if user.Quota < threshold {
		return nil
	}
	return ClearLowQuotaNotifyStateTx(tx, userId, LowQuotaNotifyScopeWallet, 0)
}

func oneCNYQuotaThreshold() int {
	if operation_setting.USDExchangeRate <= 0 || common.QuotaPerUnit <= 0 {
		return 0
	}
	return int(math.Ceil(common.QuotaPerUnit / operation_setting.USDExchangeRate))
}
