package model

import (
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupSubscriptionGroupEligibilityTestDB(t *testing.T) {
	t.Helper()
	previousDB := DB
	previousLogDB := LOG_DB
	previousGroupCol := commonGroupCol
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&User{}, &SubscriptionPlan{}, &UserSubscription{}, &SubscriptionPreConsumeRecord{}, &Log{}))
	DB = db
	LOG_DB = db
	commonGroupCol = "`group`"
	t.Cleanup(func() {
		_ = sqlDB.Close()
		DB = previousDB
		LOG_DB = previousLogDB
		commonGroupCol = previousGroupCol
	})
}

func TestHasActiveUserSubscriptionRequiresMatchingUnlimitedUpgradeGroup(t *testing.T) {
	setupSubscriptionGroupEligibilityTestDB(t)
	now := time.Now().Unix()
	require.NoError(t, DB.Create(&User{Id: 124, Username: "rain", Password: "password", Group: "other"}).Error)
	require.NoError(t, DB.Create(&UserSubscription{
		UserId:       124,
		Status:       "active",
		EndTime:      now + 3600,
		UpgradeGroup: "unlimited_month",
	}).Error)

	hasActive, err := HasActiveUserSubscription(124)
	require.NoError(t, err)
	require.False(t, hasActive)

	require.NoError(t, DB.Model(&User{}).Where("id = ?", 124).Update("group", "unlimited_month").Error)
	hasActive, err = HasActiveUserSubscription(124)
	require.NoError(t, err)
	require.True(t, hasActive)
}

func TestHasActiveUserSubscriptionAllowsRegularPlanWithDifferentUserGroup(t *testing.T) {
	setupSubscriptionGroupEligibilityTestDB(t)
	now := time.Now().Unix()
	require.NoError(t, DB.Create(&User{Id: 129, Username: "regular", Password: "password", Group: "default"}).Error)
	require.NoError(t, DB.Create(&UserSubscription{
		UserId:       129,
		Status:       "active",
		EndTime:      now + 3600,
		UpgradeGroup: "month_plus",
	}).Error)

	hasActive, err := HasActiveUserSubscription(129)
	require.NoError(t, err)
	require.True(t, hasActive)
}

func TestHasActiveUserSubscriptionAllowsDiscountOnlySubscription(t *testing.T) {
	setupSubscriptionGroupEligibilityTestDB(t)
	now := time.Now().Unix()
	require.NoError(t, DB.Create(&User{Id: 125, Username: "discount", Password: "password", Group: "other"}).Error)
	require.NoError(t, DB.Create(&UserSubscription{
		UserId:       125,
		Status:       "active",
		EndTime:      now + 3600,
		UpgradeGroup: "",
	}).Error)

	hasActive, err := HasActiveUserSubscription(125)
	require.NoError(t, err)
	require.True(t, hasActive)
}

func TestCancelMismatchedActiveUpgradeSubscriptions(t *testing.T) {
	setupSubscriptionGroupEligibilityTestDB(t)
	now := time.Now().Unix()
	require.NoError(t, DB.Create(&User{Id: 126, Username: "admin-edit", Password: "password", Group: "new-group"}).Error)
	subs := []UserSubscription{
		{UserId: 126, Status: "active", EndTime: now + 3600, UpgradeGroup: "unlimited_month"},
		{UserId: 126, Status: "active", EndTime: now + 3600, UpgradeGroup: "month_plus"},
		{UserId: 126, Status: "active", EndTime: now + 3600, UpgradeGroup: "new-group"},
		{UserId: 126, Status: "active", EndTime: now + 3600, UpgradeGroup: ""},
	}
	require.NoError(t, DB.Create(&subs).Error)

	cancelled, err := cancelMismatchedActiveUpgradeSubscriptionsTx(DB, 126, "new-group", now)
	require.NoError(t, err)
	require.EqualValues(t, 1, cancelled)

	var stored []UserSubscription
	require.NoError(t, DB.Order("id asc").Find(&stored).Error)
	require.Equal(t, "cancelled", stored[0].Status)
	require.Equal(t, "active", stored[1].Status)
	require.Equal(t, "active", stored[2].Status)
	require.Equal(t, "active", stored[3].Status)
}

func TestPreConsumeRejectsMismatchedUnlimitedUpgradeGroup(t *testing.T) {
	setupSubscriptionGroupEligibilityTestDB(t)
	now := time.Now().Unix()
	require.NoError(t, DB.Create(&User{Id: 127, Username: "pre-consume", Password: "password", Group: "other"}).Error)
	require.NoError(t, DB.Create(&UserSubscription{
		UserId:       127,
		Status:       "active",
		EndTime:      now + 3600,
		UpgradeGroup: "unlimited_month",
	}).Error)

	_, err := PreConsumeUserSubscription("mismatched-group-request", 127, "gpt-5.6-sol", 0, 1)
	require.EqualError(t, err, "no active subscription")
}

func TestPreConsumeAllowsRegularPlanWithDifferentUserGroup(t *testing.T) {
	setupSubscriptionGroupEligibilityTestDB(t)
	now := time.Now().Unix()
	require.NoError(t, DB.Create(&User{Id: 131, Username: "regular-pre-consume", Password: "password", Group: "default"}).Error)
	plan := SubscriptionPlan{
		Title:            "Regular monthly plan",
		BillingDiscount:  1,
		DurationUnit:     SubscriptionDurationMonth,
		DurationValue:    1,
		UpgradeGroup:     "month_plus",
		TotalAmount:      1000,
		QuotaResetPeriod: SubscriptionResetNever,
	}
	require.NoError(t, DB.Create(&plan).Error)
	subscription := UserSubscription{
		UserId:       131,
		PlanId:       plan.Id,
		AmountTotal:  plan.TotalAmount,
		Status:       "active",
		StartTime:    now,
		EndTime:      now + 3600,
		UpgradeGroup: plan.UpgradeGroup,
	}
	require.NoError(t, DB.Create(&subscription).Error)

	result, err := PreConsumeUserSubscription("regular-group-request", 131, "gpt-5.6-sol", 0, 100)
	require.NoError(t, err)
	require.Equal(t, subscription.Id, result.UserSubscriptionId)
	require.EqualValues(t, 100, result.PreConsumed)
	require.EqualValues(t, 100, result.AmountUsedAfter)

	var stored UserSubscription
	require.NoError(t, DB.First(&stored, subscription.Id).Error)
	require.EqualValues(t, 100, stored.AmountUsed)
}

func TestUserEditCancelsMismatchedUpgradeSubscription(t *testing.T) {
	setupSubscriptionGroupEligibilityTestDB(t)
	now := time.Now().Unix()
	require.NoError(t, DB.Create(&User{
		Id:          128,
		Username:    "group-edit",
		Password:    "password",
		DisplayName: "Before",
		Group:       "unlimited_month",
	}).Error)
	sub := UserSubscription{
		UserId:       128,
		Status:       "active",
		EndTime:      now + 3600,
		UpgradeGroup: "unlimited_month",
	}
	require.NoError(t, DB.Create(&sub).Error)

	updated := User{
		Id:          128,
		Username:    "group-edit",
		DisplayName: "After",
		Group:       "other",
	}
	require.NoError(t, updated.Edit(false))

	var stored UserSubscription
	require.NoError(t, DB.First(&stored, sub.Id).Error)
	require.Equal(t, "cancelled", stored.Status)
	require.Equal(t, "other", updated.Group)
}

func TestUserEditKeepsRegularPlanSubscription(t *testing.T) {
	setupSubscriptionGroupEligibilityTestDB(t)
	now := time.Now().Unix()
	require.NoError(t, DB.Create(&User{
		Id:          130,
		Username:    "regular-group-edit",
		Password:    "password",
		DisplayName: "Before",
		Group:       "default",
	}).Error)
	sub := UserSubscription{
		UserId:       130,
		Status:       "active",
		EndTime:      now + 3600,
		UpgradeGroup: "month_plus",
	}
	require.NoError(t, DB.Create(&sub).Error)

	updated := User{
		Id:          130,
		Username:    "regular-group-edit",
		DisplayName: "After",
		Group:       "other",
	}
	require.NoError(t, updated.Edit(false))

	var stored UserSubscription
	require.NoError(t, DB.First(&stored, sub.Id).Error)
	require.Equal(t, "active", stored.Status)
	require.Equal(t, "other", updated.Group)
}
