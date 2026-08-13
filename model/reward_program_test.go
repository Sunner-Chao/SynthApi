package model

import (
	"fmt"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupRewardProgramTestDB(t *testing.T) {
	t.Helper()
	originalDB := DB
	originalLogDB := LOG_DB
	originalQuotaPerUnit := common.QuotaPerUnit
	originalExchangeRate := operation_setting.USDExchangeRate
	originalAffiliateEnabled := setting.IsAffiliateMilestoneRewardEnabled()
	originalRechargeEnabled := setting.IsRechargeBenefitEnabled()
	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&User{}, &TopUp{}, &AffiliateRebateRecord{}, &AffiliateTransferRecord{}, &RechargeBenefitClaim{}, &PaymentRefundReview{}, &Log{}))
	DB = db
	LOG_DB = db
	common.QuotaPerUnit = 500_000
	operation_setting.USDExchangeRate = 7.3
	setting.SetAffiliateMilestoneRewardEnabled(true)
	setting.SetRechargeBenefitEnabled(true)
	t.Cleanup(func() {
		DB = originalDB
		LOG_DB = originalLogDB
		common.QuotaPerUnit = originalQuotaPerUnit
		operation_setting.USDExchangeRate = originalExchangeRate
		setting.SetAffiliateMilestoneRewardEnabled(originalAffiliateEnabled)
		setting.SetRechargeBenefitEnabled(originalRechargeEnabled)
	})
}

func TestTransferAffiliateQuotaCreatesAuditRecordForSmallBalance(t *testing.T) {
	setupRewardProgramTestDB(t)
	user := &User{Id: 12, Username: "small-affiliate-transfer", AffCode: "SMALL12", AffQuota: 6_849, Quota: 10_000}
	require.NoError(t, DB.Create(user).Error)

	record, err := user.TransferAffQuotaToQuota(6_849)
	require.NoError(t, err)
	require.Equal(t, 6_849, record.Quota)
	require.Equal(t, 6_849, record.AffQuotaBefore)
	require.Zero(t, record.AffQuotaAfter)
	require.Equal(t, 10_000, record.QuotaBefore)
	require.Equal(t, 16_849, record.QuotaAfter)

	var saved AffiliateTransferRecord
	require.NoError(t, DB.First(&saved, record.Id).Error)
	require.Equal(t, record.Quota, saved.Quota)

	var refreshed User
	require.NoError(t, DB.First(&refreshed, user.Id).Error)
	require.Zero(t, refreshed.AffQuota)
	require.Equal(t, 16_849, refreshed.Quota)
}

func createRewardTestUsers(t *testing.T, inviterID int, inviteeID int) {
	t.Helper()
	require.NoError(t, DB.Create(&User{Id: inviterID, Username: fmt.Sprintf("inviter-%d", inviterID), Password: "password", AffCode: fmt.Sprintf("INV%d", inviterID)}).Error)
	require.NoError(t, DB.Create(&User{Id: inviteeID, Username: fmt.Sprintf("invitee-%d", inviteeID), Password: "password", AffCode: fmt.Sprintf("IEE%d", inviteeID), InviterId: inviterID}).Error)
}

func createSuccessfulCNYTopUp(t *testing.T, userID int, tradeNo string, money float64) {
	t.Helper()
	require.NoError(t, DB.Create(&TopUp{
		UserId: userID, TradeNo: tradeNo, Money: money, Currency: "CNY",
		PaymentProvider: PaymentProviderMPay, Status: common.TopUpStatusSuccess,
	}).Error)
}

func TestSettleAffiliateMilestoneRebateIsIdempotent(t *testing.T) {
	setupRewardProgramTestDB(t)
	createRewardTestUsers(t, 1, 2)
	createSuccessfulCNYTopUp(t, 2, "reward-idempotent", 100)

	require.NoError(t, SettleAffiliateMilestoneRebate("reward-idempotent"))
	require.NoError(t, SettleAffiliateMilestoneRebate("reward-idempotent"))

	var records int64
	require.NoError(t, DB.Model(&AffiliateRebateRecord{}).Count(&records).Error)
	require.EqualValues(t, 1, records)
	var inviter User
	require.NoError(t, DB.First(&inviter, 1).Error)
	require.Equal(t, cnyToQuota(8), inviter.AffQuota)
}

func TestAffiliateStageBoundaries(t *testing.T) {
	tests := []struct {
		count int
		rate  int
		name  string
	}{
		{1, 800, "启航新星"}, {5, 1000, "炽焰探索者"},
		{10, 1250, "星环领航员"}, {25, 1500, "光速指挥官"},
		{50, 1750, "王座征服者"}, {100, 2000, "银河舰长"},
	}
	for _, test := range tests {
		stage := affiliateStageForCount(test.count)
		require.Equal(t, test.rate, stage.RateBPS)
		require.Equal(t, test.name, stage.Name)
	}
}

func TestRepeatedInviteeTopUpUsesCurrentStageWithoutIncreasingCount(t *testing.T) {
	setupRewardProgramTestDB(t)
	createRewardTestUsers(t, 10, 20)
	for i := 0; i < 9; i++ {
		inviteeID := 100 + i
		require.NoError(t, DB.Create(&User{Id: inviteeID, Username: fmt.Sprintf("paid-%d", i), Password: "password", AffCode: fmt.Sprintf("PAID%d", inviteeID), InviterId: 10}).Error)
		require.NoError(t, DB.Create(&AffiliateRebateRecord{
			TradeNo: fmt.Sprintf("historical-%d", i), InviteeUserId: inviteeID,
			InviterUserId: 10, PaidCNY: 100, EffectiveInviteCount: i + 1,
			StageCode: "historical", StageName: "历史", RateBPS: 800,
			RewardQuota: cnyToQuota(8), CreatedAt: int64(i + 1),
		}).Error)
	}
	createSuccessfulCNYTopUp(t, 20, "repeat-one", 100)
	createSuccessfulCNYTopUp(t, 20, "repeat-two", 100)

	require.NoError(t, SettleAffiliateMilestoneRebate("repeat-one"))
	require.NoError(t, SettleAffiliateMilestoneRebate("repeat-two"))

	var records []AffiliateRebateRecord
	require.NoError(t, DB.Order("id asc").Find(&records).Error)
	require.Len(t, records, 11)
	require.Equal(t, 10, records[9].EffectiveInviteCount)
	require.Equal(t, 10, records[10].EffectiveInviteCount)
	require.Equal(t, 1250, records[9].RateBPS)
	require.Equal(t, 1250, records[10].RateBPS)
}

func TestDisabledRewardProgramsRejectNewWork(t *testing.T) {
	setupRewardProgramTestDB(t)
	createRewardTestUsers(t, 70, 71)
	createSuccessfulCNYTopUp(t, 71, "disabled-affiliate", 100)
	setting.SetAffiliateMilestoneRewardEnabled(false)
	require.NoError(t, SettleAffiliateMilestoneRebate("disabled-affiliate"))
	var records int64
	require.NoError(t, DB.Model(&AffiliateRebateRecord{}).Count(&records).Error)
	require.Zero(t, records)

	setting.SetRechargeBenefitEnabled(false)
	_, err := RequestRechargeBenefit(71)
	require.EqualError(t, err, "千元充能活动当前未开放")
}

func TestRechargeBenefitClaimAndGrantAreIdempotent(t *testing.T) {
	setupRewardProgramTestDB(t)
	require.NoError(t, DB.Create(&User{Id: 30, Username: "benefit-user", Password: "password", AffCode: "BEN30"}).Error)
	createSuccessfulCNYTopUp(t, 30, "benefit-topup", 2000)

	first, err := RequestRechargeBenefit(30)
	require.NoError(t, err)
	require.Equal(t, 1, first.MilestoneIndex)
	second, err := RequestRechargeBenefit(30)
	require.NoError(t, err)
	require.Equal(t, 2, second.MilestoneIndex)
	_, err = RequestRechargeBenefit(30)
	require.Error(t, err)

	granted, err := ReviewRechargeBenefitClaim(first.Id, 99, true, "verified")
	require.NoError(t, err)
	require.Equal(t, RechargeBenefitStatusGranted, granted.Status)
	_, err = ReviewRechargeBenefitClaim(first.Id, 99, true, "duplicate")
	require.Error(t, err)

	var user User
	require.NoError(t, DB.First(&user, 30).Error)
	require.Equal(t, cnyToQuota(50), user.Quota)
}

func TestAdminUserRewardSummaryIncludesAffiliateAndRechargeDetails(t *testing.T) {
	setupRewardProgramTestDB(t)
	createRewardTestUsers(t, 300, 301)
	createSuccessfulCNYTopUp(t, 301, "summary-invitee-topup", 100)
	createSuccessfulCNYTopUp(t, 300, "summary-own-topup", 1000)
	require.NoError(t, SettleAffiliateMilestoneRebate("summary-invitee-topup"))

	summary, err := GetAdminUserRewardSummary(300)
	require.NoError(t, err)
	require.Equal(t, 1, summary.Affiliate.EffectiveInviteCount)
	require.Equal(t, int64(1), summary.Affiliate.RebateOrderCount)
	require.Equal(t, 800, summary.Affiliate.CurrentStage.RateBPS)
	require.Equal(t, 8.0, summary.Affiliate.TotalRewardCNY)
	require.Equal(t, 1000.0, summary.Recharge.TotalRechargeCNY)
	require.Equal(t, 1, summary.Recharge.AvailableCount)
}

func TestListRechargeBenefitClaimsIncludesUsername(t *testing.T) {
	setupRewardProgramTestDB(t)
	require.NoError(t, DB.Create(&User{Id: 310, Username: "claim-owner", Password: "password", AffCode: "CLAIM310"}).Error)
	createSuccessfulCNYTopUp(t, 310, "claim-list-topup", 1000)
	_, err := RequestRechargeBenefit(310)
	require.NoError(t, err)

	pageInfo := &common.PageInfo{Page: 1, PageSize: 20}
	claims, total, err := ListRechargeBenefitClaims(pageInfo, RechargeBenefitStatusPending)
	require.NoError(t, err)
	require.EqualValues(t, 1, total)
	require.Len(t, claims, 1)
	require.Equal(t, "claim-owner", claims[0].Username)
}

func TestAdminUserRewardListSummariesAggregateCurrentPage(t *testing.T) {
	setupRewardProgramTestDB(t)
	createRewardTestUsers(t, 320, 321)
	createSuccessfulCNYTopUp(t, 321, "list-summary-invitee", 200)
	createSuccessfulCNYTopUp(t, 320, "list-summary-own", 1000)
	require.NoError(t, SettleAffiliateMilestoneRebate("list-summary-invitee"))
	claim, err := RequestRechargeBenefit(320)
	require.NoError(t, err)
	_, err = ReviewRechargeBenefitClaim(claim.Id, 99, true, "list summary")
	require.NoError(t, err)

	summaries, err := GetAdminUserRewardListSummaries([]int{320, 321, 320})
	require.NoError(t, err)
	require.Len(t, summaries, 2)
	require.Equal(t, 1, summaries[320].EffectiveInviteCount)
	require.Equal(t, 1, summaries[320].RebateOrderCount)
	require.Equal(t, 16.0, summaries[320].TotalRewardCNY)
	require.Equal(t, 1000.0, summaries[320].TotalRechargeCNY)
	require.Equal(t, 1, summaries[320].GrantedBenefitCount)
}

func TestNonCNYTopUpDoesNotSettleAffiliateRebate(t *testing.T) {
	setupRewardProgramTestDB(t)
	createRewardTestUsers(t, 40, 41)
	require.NoError(t, DB.Create(&TopUp{
		UserId: 41, TradeNo: "usd-topup", Money: 100, Currency: "USD",
		PaymentProvider: PaymentProviderStripe, Status: common.TopUpStatusSuccess,
	}).Error)
	require.NoError(t, SettleAffiliateMilestoneRebate("usd-topup"))
	var count int64
	require.NoError(t, DB.Model(&AffiliateRebateRecord{}).Count(&count).Error)
	require.Zero(t, count)
}

func TestAffiliateBackfillReplaysHistoricalStagesAndIsIdempotent(t *testing.T) {
	setupRewardProgramTestDB(t)
	require.NoError(t, DB.Create(&User{Id: 80, Username: "backfill-inviter", Password: "password", AffCode: "BF80"}).Error)
	for i := 1; i <= 10; i++ {
		userID := 80 + i
		require.NoError(t, DB.Create(&User{Id: userID, Username: fmt.Sprintf("bf-%d", i), Password: "password", AffCode: fmt.Sprintf("BF%d", userID), InviterId: 80}).Error)
		topUp := &TopUp{
			UserId: userID, TradeNo: fmt.Sprintf("backfill-%02d", i), Money: 100, Currency: "CNY",
			PaymentProvider: PaymentProviderMPay, Status: common.TopUpStatusSuccess, CompleteTime: int64(1000 + i),
		}
		require.NoError(t, DB.Create(topUp).Error)
	}

	dryRun, err := BackfillAffiliateMilestoneRebates(false)
	require.NoError(t, err)
	require.True(t, dryRun.DryRun)
	require.Equal(t, 10, dryRun.CreatedRecords)
	expectedQuota := int64(4*cnyToQuota(8) + 5*cnyToQuota(10) + cnyToQuota(12.5))
	require.Equal(t, expectedQuota, dryRun.TotalRewardQuota)
	var before int64
	require.NoError(t, DB.Model(&AffiliateRebateRecord{}).Count(&before).Error)
	require.Zero(t, before)

	applied, err := BackfillAffiliateMilestoneRebates(true)
	require.NoError(t, err)
	require.False(t, applied.DryRun)
	var records []AffiliateRebateRecord
	require.NoError(t, DB.Order("id asc").Find(&records).Error)
	require.Len(t, records, 10)
	require.Equal(t, 800, records[3].RateBPS)
	require.Equal(t, 1000, records[4].RateBPS)
	require.Equal(t, 1250, records[9].RateBPS)

	second, err := BackfillAffiliateMilestoneRebates(true)
	require.NoError(t, err)
	require.Equal(t, 10, second.UnchangedRecords)
	require.Zero(t, second.QuotaDelta)
}

func TestAffiliateBackfillSkipsRefundedTopUps(t *testing.T) {
	setupRewardProgramTestDB(t)
	createRewardTestUsers(t, 200, 201)
	createSuccessfulCNYTopUp(t, 201, "refunded-affiliate", 100)
	require.NoError(t, DB.Create(&PaymentRefundReview{
		PaymentProvider: PaymentProviderAlipayDirect,
		LocalTradeNo:    "refunded-affiliate", ProviderTradeNo: "provider-refund",
		OrderKind: "topup", UserId: 201, Amount: 100, Currency: "CNY",
		ProviderStatus: "REFUNDED", RefundAmount: 100, Status: PaymentRefundReviewStatusPending,
		FirstNotifiedAt: 1, LastNotifiedAt: 1, LastSource: "test", CreatedAt: 1, UpdatedAt: 1,
	}).Error)

	summary, err := BackfillAffiliateMilestoneRebates(false)
	require.NoError(t, err)
	require.Equal(t, 1, summary.RefundedTopUps)
	require.Zero(t, summary.InvitedTopUps)
	require.Zero(t, summary.CreatedRecords)
}
