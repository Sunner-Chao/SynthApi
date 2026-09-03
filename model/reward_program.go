package model

import (
	"errors"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	RechargeBenefitThresholdCNY = 1000
	RechargeBenefitRewardCNY    = 50

	RechargeBenefitStatusPending  = "pending"
	RechargeBenefitStatusGranted  = "granted"
	RechargeBenefitStatusRejected = "rejected"
)

type AffiliateRewardStage struct {
	Code       string `json:"code"`
	Name       string `json:"name"`
	MinInvites int    `json:"min_invites"`
	MaxInvites int    `json:"max_invites"`
	RateBPS    int    `json:"rate_bps"`
}

var affiliateRewardStages = []AffiliateRewardStage{
	{Code: "launch_star", Name: "启航新星", MinInvites: 1, MaxInvites: 4, RateBPS: 800},
	{Code: "blazing_explorer", Name: "炽焰探索者", MinInvites: 5, MaxInvites: 9, RateBPS: 1000},
	{Code: "stellar_navigator", Name: "星环领航员", MinInvites: 10, MaxInvites: 24, RateBPS: 1250},
	{Code: "lightspeed_commander", Name: "光速指挥官", MinInvites: 25, MaxInvites: 49, RateBPS: 1500},
	{Code: "throne_conqueror", Name: "王座征服者", MinInvites: 50, MaxInvites: 99, RateBPS: 1750},
	{Code: "galaxy_captain", Name: "银河舰长", MinInvites: 100, MaxInvites: 0, RateBPS: 2000},
}

type AffiliateRebateRecord struct {
	Id                   int     `json:"id"`
	TradeNo              string  `json:"trade_no" gorm:"type:varchar(255);not null;uniqueIndex"`
	InviteeUserId        int     `json:"invitee_user_id" gorm:"not null;index"`
	InviterUserId        int     `json:"inviter_user_id" gorm:"not null;index"`
	PaidCNY              float64 `json:"paid_cny" gorm:"type:decimal(20,6);not null"`
	EffectiveInviteCount int     `json:"effective_invite_count" gorm:"not null"`
	StageCode            string  `json:"stage_code" gorm:"type:varchar(40);not null"`
	StageName            string  `json:"stage_name" gorm:"type:varchar(40);not null"`
	RateBPS              int     `json:"rate_bps" gorm:"not null"`
	RewardQuota          int     `json:"reward_quota" gorm:"not null"`
	CreatedAt            int64   `json:"created_at" gorm:"not null;index"`
}

type AffiliateTransferRecord struct {
	Id             int   `json:"id"`
	UserId         int   `json:"user_id" gorm:"not null;index"`
	Quota          int   `json:"quota" gorm:"not null"`
	AffQuotaBefore int   `json:"aff_quota_before" gorm:"not null"`
	AffQuotaAfter  int   `json:"aff_quota_after" gorm:"not null"`
	QuotaBefore    int   `json:"quota_before" gorm:"not null"`
	QuotaAfter     int   `json:"quota_after" gorm:"not null"`
	CreatedAt      int64 `json:"created_at" gorm:"not null;index"`
}

type RechargeBenefitClaim struct {
	Id             int    `json:"id"`
	UserId         int    `json:"user_id" gorm:"not null;uniqueIndex:idx_recharge_benefit_milestone,priority:1"`
	MilestoneIndex int    `json:"milestone_index" gorm:"not null;uniqueIndex:idx_recharge_benefit_milestone,priority:2"`
	ThresholdCNY   int    `json:"threshold_cny" gorm:"not null"`
	RewardCNY      int    `json:"reward_cny" gorm:"not null"`
	RewardQuota    int    `json:"reward_quota" gorm:"not null"`
	Status         string `json:"status" gorm:"type:varchar(20);not null;index"`
	RequestedAt    int64  `json:"requested_at" gorm:"not null;index"`
	GrantedAt      int64  `json:"granted_at" gorm:"not null;default:0"`
	GrantedBy      int    `json:"granted_by" gorm:"not null;default:0"`
	AdminRemark    string `json:"admin_remark" gorm:"type:varchar(255);not null;default:''"`
	CreatedAt      int64  `json:"created_at" gorm:"not null"`
	UpdatedAt      int64  `json:"updated_at" gorm:"not null"`
	Username       string `json:"username,omitempty" gorm:"-"`
}

type AdminQuotaRechargeRecord struct {
	Id          int     `json:"id"`
	EventKey    string  `json:"event_key" gorm:"type:varchar(128);not null;uniqueIndex"`
	SourceLogId int     `json:"source_log_id" gorm:"not null;default:0;index"`
	UserId      int     `json:"user_id" gorm:"not null;index"`
	AdminId     int     `json:"admin_id" gorm:"not null;index"`
	Mode        string  `json:"mode" gorm:"type:varchar(20);not null"`
	Quota       int     `json:"quota" gorm:"not null"`
	AmountCNY   float64 `json:"amount_cny" gorm:"type:decimal(20,6);not null"`
	CreatedAt   int64   `json:"created_at" gorm:"not null;index"`
}

type AdminQuotaAdjustmentResult struct {
	OldQuota      int                       `json:"old_quota"`
	NewQuota      int                       `json:"new_quota"`
	RechargeQuota int                       `json:"recharge_quota"`
	RechargeCNY   float64                   `json:"recharge_cny"`
	Recharge      *AdminQuotaRechargeRecord `json:"recharge,omitempty"`
}

type AdminQuotaRechargeBackfillSummary struct {
	DryRun          bool    `json:"dry_run"`
	ScannedLogs     int     `json:"scanned_logs"`
	EligibleLogs    int     `json:"eligible_logs"`
	CreatedRecords  int     `json:"created_records"`
	ExistingRecords int     `json:"existing_records"`
	SkippedLogs     int     `json:"skipped_logs"`
	TotalCNY        float64 `json:"total_cny"`
}

type AdminUserRewardSummary struct {
	UserId    int                     `json:"user_id"`
	Affiliate AffiliateRewardOverview `json:"affiliate"`
	Recharge  RechargeBenefitOverview `json:"recharge"`
}

type AdminUserRewardListSummary struct {
	UserId               int                  `json:"user_id"`
	EffectiveInviteCount int                  `json:"effective_invite_count"`
	CurrentStage         AffiliateRewardStage `json:"current_stage"`
	TotalRewardCNY       float64              `json:"total_reward_cny"`
	RebateOrderCount     int                  `json:"rebate_order_count"`
	TotalRechargeCNY     float64              `json:"total_recharge_cny"`
	PendingBenefitCount  int                  `json:"pending_benefit_count"`
	GrantedBenefitCount  int                  `json:"granted_benefit_count"`
}

type AffiliateBackfillSummary struct {
	DryRun           bool    `json:"dry_run"`
	ScannedTopUps    int     `json:"scanned_topups"`
	EligibleTopUps   int     `json:"eligible_topups"`
	InvitedTopUps    int     `json:"invited_topups"`
	CreatedRecords   int     `json:"created_records"`
	AdjustedRecords  int     `json:"adjusted_records"`
	UnchangedRecords int     `json:"unchanged_records"`
	SkippedTopUps    int     `json:"skipped_topups"`
	RefundedTopUps   int     `json:"refunded_topups"`
	TotalRewardCNY   float64 `json:"total_reward_cny"`
	TotalRewardQuota int64   `json:"total_reward_quota"`
	QuotaDelta       int64   `json:"quota_delta"`
}

type affiliateBackfillEntry struct {
	topUp       TopUp
	inviteeID   int
	inviterID   int
	inviteCount int
	stage       AffiliateRewardStage
	rewardQuota int
}

type RewardProgramOverview struct {
	Affiliate AffiliateRewardOverview `json:"affiliate"`
	Recharge  RechargeBenefitOverview `json:"recharge"`
}

type AffiliateRewardOverview struct {
	EffectiveInviteCount int                       `json:"effective_invite_count"`
	CurrentStage         AffiliateRewardStage      `json:"current_stage"`
	NextStage            *AffiliateRewardStage     `json:"next_stage"`
	TotalRewardQuota     int64                     `json:"total_reward_quota"`
	TotalRewardCNY       float64                   `json:"total_reward_cny"`
	RebateOrderCount     int64                     `json:"rebate_order_count"`
	RecentRecords        []AffiliateRebateRecord   `json:"recent_records"`
	RecentTransfers      []AffiliateTransferRecord `json:"recent_transfers"`
	Stages               []AffiliateRewardStage    `json:"stages"`
}

type RechargeBenefitOverview struct {
	TotalRechargeCNY float64                `json:"total_recharge_cny"`
	CurrentCycleCNY  float64                `json:"current_cycle_cny"`
	NextThresholdCNY float64                `json:"next_threshold_cny"`
	UnlockedCount    int                    `json:"unlocked_count"`
	AvailableCount   int                    `json:"available_count"`
	PendingCount     int                    `json:"pending_count"`
	GrantedCount     int                    `json:"granted_count"`
	ThresholdUnitCNY int                    `json:"threshold_unit_cny"`
	RewardUnitCNY    int                    `json:"reward_unit_cny"`
	RecentClaims     []RechargeBenefitClaim `json:"recent_claims"`
}

func AffiliateRewardStages() []AffiliateRewardStage {
	stages := make([]AffiliateRewardStage, len(affiliateRewardStages))
	copy(stages, affiliateRewardStages)
	return stages
}

// BackfillAffiliateMilestoneRebates replays successful CNY top-ups in payment
// order. The first eligible payment by an invitee makes that invitee effective
// for the inviter; every payment is then priced at the stage active at that
// point in history. Existing trade_no ledger rows are adjusted by delta.
func BackfillAffiliateMilestoneRebates(apply bool) (*AffiliateBackfillSummary, error) {
	summary := &AffiliateBackfillSummary{DryRun: !apply}
	var topUps []TopUp
	if err := DB.Where("status = ?", common.TopUpStatusSuccess).Find(&topUps).Error; err != nil {
		return nil, err
	}
	summary.ScannedTopUps = len(topUps)
	sort.SliceStable(topUps, func(i, j int) bool {
		leftTime, rightTime := topUps[i].CompleteTime, topUps[j].CompleteTime
		if leftTime == 0 {
			leftTime = topUps[i].CreateTime
		}
		if rightTime == 0 {
			rightTime = topUps[j].CreateTime
		}
		if leftTime != rightTime {
			return leftTime < rightTime
		}
		if topUps[i].CreateTime != topUps[j].CreateTime {
			return topUps[i].CreateTime < topUps[j].CreateTime
		}
		return topUps[i].Id < topUps[j].Id
	})

	var users []User
	if err := DB.Select("id", "inviter_id").Find(&users).Error; err != nil {
		return nil, err
	}
	inviterByUser := make(map[int]int, len(users))
	for _, user := range users {
		inviterByUser[user.Id] = user.InviterId
	}
	var refunds []PaymentRefundReview
	if err := DB.Select("local_trade_no", "refund_amount").Where("refund_amount > ?", 0).Find(&refunds).Error; err != nil {
		return nil, err
	}
	refundedTrades := make(map[string]struct{}, len(refunds))
	for _, refund := range refunds {
		refundedTrades[strings.TrimSpace(refund.LocalTradeNo)] = struct{}{}
	}

	effective := make(map[int]map[int]struct{})
	entries := make([]affiliateBackfillEntry, 0, len(topUps))
	for _, topUp := range topUps {
		if !isEligibleCNYTopUp(&topUp) {
			summary.SkippedTopUps++
			continue
		}
		if _, refunded := refundedTrades[strings.TrimSpace(topUp.TradeNo)]; refunded {
			summary.RefundedTopUps++
			summary.SkippedTopUps++
			continue
		}
		summary.EligibleTopUps++
		inviterID := inviterByUser[topUp.UserId]
		if inviterID <= 0 || inviterID == topUp.UserId {
			summary.SkippedTopUps++
			continue
		}
		invitees := effective[inviterID]
		if invitees == nil {
			invitees = make(map[int]struct{})
			effective[inviterID] = invitees
		}
		invitees[topUp.UserId] = struct{}{}
		stage := affiliateStageForCount(len(invitees))
		rewardCNY := decimal.NewFromFloat(topUp.Money).
			Mul(decimal.NewFromInt(int64(stage.RateBPS))).
			Div(decimal.NewFromInt(10000)).Round(2)
		rewardQuota := cnyToQuota(rewardCNY.InexactFloat64())
		if rewardQuota <= 0 {
			return nil, fmt.Errorf("invalid reward quota for trade %s", topUp.TradeNo)
		}
		summary.InvitedTopUps++
		summary.TotalRewardCNY = decimal.NewFromFloat(summary.TotalRewardCNY).Add(rewardCNY).InexactFloat64()
		summary.TotalRewardQuota += int64(rewardQuota)
		entries = append(entries, affiliateBackfillEntry{
			topUp: topUp, inviteeID: topUp.UserId, inviterID: inviterID,
			inviteCount: len(invitees), stage: stage, rewardQuota: rewardQuota,
		})
	}

	var existing []AffiliateRebateRecord
	if err := DB.Find(&existing).Error; err != nil {
		return nil, err
	}
	existingByTrade := make(map[string]AffiliateRebateRecord, len(existing))
	for _, record := range existing {
		existingByTrade[record.TradeNo] = record
	}
	for _, entry := range entries {
		if record, ok := existingByTrade[entry.topUp.TradeNo]; ok {
			delta := int64(entry.rewardQuota - record.RewardQuota)
			summary.QuotaDelta += delta
			if delta == 0 && record.RateBPS == entry.stage.RateBPS && record.EffectiveInviteCount == entry.inviteCount {
				summary.UnchangedRecords++
			} else {
				summary.AdjustedRecords++
			}
		} else {
			summary.CreatedRecords++
			summary.QuotaDelta += int64(entry.rewardQuota)
		}
	}
	if !apply {
		return summary, nil
	}

	err := DB.Transaction(func(tx *gorm.DB) error {
		for _, entry := range entries {
			var inviter User
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", entry.inviterID).First(&inviter).Error; err != nil {
				return err
			}
			record, exists := existingByTrade[entry.topUp.TradeNo]
			delta := entry.rewardQuota
			if exists {
				delta -= record.RewardQuota
			}
			if delta < 0 && inviter.AffQuota+delta < 0 {
				return fmt.Errorf("trade %s adjustment would make inviter %d affiliate quota negative", entry.topUp.TradeNo, entry.inviterID)
			}
			if delta != 0 {
				if err := tx.Model(&User{}).Where("id = ?", entry.inviterID).Updates(map[string]interface{}{
					"aff_quota":   gorm.Expr("aff_quota + ?", delta),
					"aff_history": gorm.Expr("aff_history + ?", delta),
				}).Error; err != nil {
					return err
				}
			}
			createdAt := entry.topUp.CompleteTime
			if createdAt == 0 {
				createdAt = entry.topUp.CreateTime
			}
			values := AffiliateRebateRecord{
				TradeNo: entry.topUp.TradeNo, InviteeUserId: entry.inviteeID,
				InviterUserId: entry.inviterID, PaidCNY: decimal.NewFromFloat(entry.topUp.Money).Round(2).InexactFloat64(),
				EffectiveInviteCount: entry.inviteCount, StageCode: entry.stage.Code, StageName: entry.stage.Name,
				RateBPS: entry.stage.RateBPS, RewardQuota: entry.rewardQuota, CreatedAt: createdAt,
			}
			if exists {
				if err := tx.Model(&AffiliateRebateRecord{}).Where("id = ?", record.Id).Updates(values).Error; err != nil {
					return err
				}
			} else if err := tx.Create(&values).Error; err != nil {
				return err
			}
		}
		return nil
	})
	return summary, err
}

func affiliateStageForCount(count int) AffiliateRewardStage {
	if count <= 0 {
		return AffiliateRewardStage{Code: "ready", Name: "待启航", MinInvites: 0, MaxInvites: 0, RateBPS: 0}
	}
	for _, stage := range affiliateRewardStages {
		if count >= stage.MinInvites && (stage.MaxInvites == 0 || count <= stage.MaxInvites) {
			return stage
		}
	}
	return affiliateRewardStages[len(affiliateRewardStages)-1]
}

func affiliateNextStage(count int) *AffiliateRewardStage {
	for _, stage := range affiliateRewardStages {
		if count < stage.MinInvites {
			candidate := stage
			return &candidate
		}
	}
	return nil
}

func isEligibleCNYTopUp(topUp *TopUp) bool {
	if topUp == nil || topUp.Status != common.TopUpStatusSuccess || topUp.Money <= 0 {
		return false
	}
	currency := strings.ToUpper(strings.TrimSpace(topUp.Currency))
	if currency == "CNY" {
		return topUp.PaymentProvider != PaymentProviderBalance && topUp.PaymentProvider != PaymentProviderRedemption
	}
	if currency != "" {
		return false
	}
	switch topUp.PaymentProvider {
	case PaymentProviderEpay, PaymentProviderMPay, PaymentProviderXPay, PaymentProviderAlipayDirect:
		return true
	default:
		return false
	}
}

func cnyToQuota(amount float64) int {
	if amount <= 0 || operation_setting.USDExchangeRate <= 0 || common.QuotaPerUnit <= 0 {
		return 0
	}
	return int(decimal.NewFromFloat(amount).
		Div(decimal.NewFromFloat(operation_setting.USDExchangeRate)).
		Mul(decimal.NewFromFloat(common.QuotaPerUnit)).
		Round(0).IntPart())
}

func quotaToCNY(quota int64) float64 {
	if quota <= 0 || common.QuotaPerUnit <= 0 || operation_setting.USDExchangeRate <= 0 {
		return 0
	}
	value, _ := decimal.NewFromInt(quota).
		Div(decimal.NewFromFloat(common.QuotaPerUnit)).
		Mul(decimal.NewFromFloat(operation_setting.USDExchangeRate)).
		Round(2).Float64()
	return value
}

func adminQuotaRechargeEventKey(requestID string, userID int, adminID int) string {
	requestID = strings.TrimSpace(requestID)
	if requestID == "" {
		requestID = fmt.Sprintf("%d-%s", common.GetTimestamp(), common.GetRandomString(12))
	}
	return fmt.Sprintf("admin-quota:%d:%d:%s", adminID, userID, requestID)
}

// AdjustUserQuotaByAdmin changes the wallet and records any positive balance
// delta as net recharge in the same transaction.
func AdjustUserQuotaByAdmin(userID int, adminID int, mode string, value int, requestID string) (*AdminQuotaAdjustmentResult, error) {
	if userID <= 0 || adminID <= 0 {
		return nil, errors.New("invalid user or admin id")
	}
	if mode != "override" && value <= 0 {
		return nil, errors.New("quota change must be positive")
	}
	var result AdminQuotaAdjustmentResult
	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Select("id", "quota").Where("id = ?", userID).First(&user).Error; err != nil {
			return err
		}
		result.OldQuota = user.Quota
		switch mode {
		case "add":
			result.NewQuota = user.Quota + value
		case "subtract":
			result.NewQuota = user.Quota - value
		case "override":
			result.NewQuota = value
		default:
			return errors.New("invalid quota adjustment mode")
		}
		if err := tx.Model(&User{}).Where("id = ?", userID).Update("quota", result.NewQuota).Error; err != nil {
			return err
		}
		if result.NewQuota <= result.OldQuota {
			return nil
		}
		result.RechargeQuota = result.NewQuota - result.OldQuota
		result.RechargeCNY = quotaToCNY(int64(result.RechargeQuota))
		if result.RechargeCNY <= 0 {
			return errors.New("admin recharge quota conversion is invalid")
		}
		record := &AdminQuotaRechargeRecord{
			EventKey:  adminQuotaRechargeEventKey(requestID, userID, adminID),
			UserId:    userID,
			AdminId:   adminID,
			Mode:      mode,
			Quota:     result.RechargeQuota,
			AmountCNY: decimal.NewFromFloat(result.RechargeCNY).Round(6).InexactFloat64(),
			CreatedAt: common.GetTimestamp(),
		}
		if err := tx.Create(record).Error; err != nil {
			return err
		}
		result.Recharge = record
		return nil
	})
	if err != nil {
		return nil, err
	}
	if err := updateUserQuotaCache(userID, result.NewQuota); err != nil {
		common.SysLog(fmt.Sprintf("failed to update user %d quota cache after admin adjustment: %s", userID, err.Error()))
	}
	if result.NewQuota > result.OldQuota {
		if err := ClearWalletLowQuotaNotifyStateIfRecovered(userID); err != nil {
			common.SysLog(fmt.Sprintf("failed to clear user %d low quota state after admin adjustment: %s", userID, err.Error()))
		}
	}
	return &result, nil
}

func adminRechargeCNYByUserIDs(userIDs []int) (map[int]decimal.Decimal, error) {
	result := make(map[int]decimal.Decimal, len(userIDs))
	if len(userIDs) == 0 {
		return result, nil
	}
	type row struct {
		UserId    int
		AmountCNY float64
	}
	var rows []row
	if err := DB.Model(&AdminQuotaRechargeRecord{}).Select("user_id, SUM(amount_cny) AS amount_cny").
		Where("user_id IN ?", userIDs).Group("user_id").Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, item := range rows {
		result[item.UserId] = decimal.NewFromFloat(item.AmountCNY)
	}
	return result, nil
}

var adminQuotaCNYPattern = regexp.MustCompile(`¥([0-9]+(?:\.[0-9]+)?)`)

func adminQuotaRechargeFromLog(log *Log) (float64, string, int, bool) {
	if log == nil || log.UserId <= 0 {
		return 0, "", 0, false
	}
	matches := adminQuotaCNYPattern.FindAllStringSubmatch(log.Content, -1)
	mode := ""
	amount := 0.0
	switch {
	case strings.HasPrefix(log.Content, "管理员增加用户额度 ") && len(matches) >= 1:
		mode = "add"
		amount, _ = strconv.ParseFloat(matches[0][1], 64)
	case strings.HasPrefix(log.Content, "管理员覆盖用户额度从 ") && len(matches) >= 2:
		mode = "override"
		before, _ := strconv.ParseFloat(matches[0][1], 64)
		after, _ := strconv.ParseFloat(matches[1][1], 64)
		amount = after - before
	default:
		return 0, "", 0, false
	}
	if amount <= 0 {
		return 0, "", 0, false
	}
	adminID := 0
	if other, err := common.StrToMap(log.Other); err == nil {
		if adminInfo, ok := other["admin_info"].(map[string]interface{}); ok {
			if counted, ok := adminInfo["net_recharge_counted"].(bool); ok && counted {
				return 0, "", 0, false
			}
			switch value := adminInfo["admin_id"].(type) {
			case float64:
				adminID = int(value)
			case int:
				adminID = value
			}
		}
	}
	return decimal.NewFromFloat(amount).Round(6).InexactFloat64(), mode, adminID, true
}

// BackfillAdminQuotaRechargeLedger imports historical administrator quota-add
// audit logs. SourceLogId makes repeated runs idempotent.
func BackfillAdminQuotaRechargeLedger(apply bool) (*AdminQuotaRechargeBackfillSummary, error) {
	summary := &AdminQuotaRechargeBackfillSummary{DryRun: !apply}
	var logs []Log
	if err := LOG_DB.Where("type = ? AND (content LIKE ? OR content LIKE ?)", LogTypeManage, "管理员增加用户额度 %", "管理员覆盖用户额度从 %").Order("id asc").Find(&logs).Error; err != nil {
		return nil, err
	}
	summary.ScannedLogs = len(logs)
	for i := range logs {
		amountCNY, mode, adminID, eligible := adminQuotaRechargeFromLog(&logs[i])
		if !eligible {
			summary.SkippedLogs++
			continue
		}
		summary.EligibleLogs++
		var existing int64
		if err := DB.Model(&AdminQuotaRechargeRecord{}).Where("source_log_id = ?", logs[i].Id).Count(&existing).Error; err != nil {
			return nil, err
		}
		if existing > 0 {
			summary.ExistingRecords++
			continue
		}
		summary.CreatedRecords++
		summary.TotalCNY = decimal.NewFromFloat(summary.TotalCNY).Add(decimal.NewFromFloat(amountCNY)).InexactFloat64()
		if !apply {
			continue
		}
		record := &AdminQuotaRechargeRecord{
			EventKey:    fmt.Sprintf("legacy-admin-log:%d", logs[i].Id),
			SourceLogId: logs[i].Id,
			UserId:      logs[i].UserId,
			AdminId:     adminID,
			Mode:        mode,
			Quota:       cnyToQuota(amountCNY),
			AmountCNY:   amountCNY,
			CreatedAt:   logs[i].CreatedAt,
		}
		if err := DB.Clauses(clause.OnConflict{DoNothing: true}).Create(record).Error; err != nil {
			return nil, err
		}
	}
	summary.TotalCNY = decimal.NewFromFloat(summary.TotalCNY).Round(2).InexactFloat64()
	return summary, nil
}

func effectiveInviteCountTx(tx *gorm.DB, inviterID int) (int, error) {
	var ledgerIDs []int
	if err := tx.Model(&AffiliateRebateRecord{}).
		Where("inviter_user_id = ?", inviterID).
		Distinct("invitee_user_id").Pluck("invitee_user_id", &ledgerIDs).Error; err != nil {
		return 0, err
	}
	return len(ledgerIDs), nil
}

// SettleAffiliateMilestoneRebate settles only the referenced successful top-up.
// The trade_no unique index is the idempotency key for callback retries.
func SettleAffiliateMilestoneRebate(tradeNo string) error {
	if !setting.IsAffiliateMilestoneRewardEnabled() {
		return nil
	}
	tradeNo = strings.TrimSpace(tradeNo)
	if tradeNo == "" {
		return nil
	}
	var settled AffiliateRebateRecord
	err := DB.Transaction(func(tx *gorm.DB) error {
		var topUp TopUp
		if err := tx.Where("trade_no = ?", tradeNo).First(&topUp).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			return err
		}
		if !isEligibleCNYTopUp(&topUp) {
			return nil
		}

		var invitee User
		if err := tx.Select("id", "inviter_id").Where("id = ?", topUp.UserId).First(&invitee).Error; err != nil {
			return err
		}
		if invitee.InviterId <= 0 || invitee.InviterId == invitee.Id {
			return nil
		}

		var inviter User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Select("id").Where("id = ?", invitee.InviterId).First(&inviter).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			return err
		}

		candidate := AffiliateRebateRecord{
			TradeNo:       topUp.TradeNo,
			InviteeUserId: invitee.Id,
			InviterUserId: inviter.Id,
			PaidCNY:       decimal.NewFromFloat(topUp.Money).Round(2).InexactFloat64(),
			StageCode:     "pending",
			StageName:     "待结算",
			CreatedAt:     common.GetTimestamp(),
		}
		created := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&candidate)
		if created.Error != nil {
			return created.Error
		}
		if created.RowsAffected != 1 {
			return nil
		}

		count, err := effectiveInviteCountTx(tx, inviter.Id)
		if err != nil {
			return err
		}
		stage := affiliateStageForCount(count)
		if stage.RateBPS <= 0 {
			return errors.New("affiliate stage configuration is invalid")
		}
		rewardCNY := decimal.NewFromFloat(topUp.Money).
			Mul(decimal.NewFromInt(int64(stage.RateBPS))).
			Div(decimal.NewFromInt(10000)).Round(2).InexactFloat64()
		rewardQuota := cnyToQuota(rewardCNY)
		if rewardQuota <= 0 {
			return errors.New("affiliate reward quota conversion is invalid")
		}

		if err := tx.Model(&User{}).Where("id = ?", inviter.Id).Updates(map[string]interface{}{
			"aff_quota":   gorm.Expr("aff_quota + ?", rewardQuota),
			"aff_history": gorm.Expr("aff_history + ?", rewardQuota),
		}).Error; err != nil {
			return err
		}
		if err := tx.Model(&AffiliateRebateRecord{}).Where("id = ?", candidate.Id).Updates(map[string]interface{}{
			"effective_invite_count": count,
			"stage_code":             stage.Code,
			"stage_name":             stage.Name,
			"rate_bps":               stage.RateBPS,
			"reward_quota":           rewardQuota,
		}).Error; err != nil {
			return err
		}
		candidate.EffectiveInviteCount = count
		candidate.StageCode = stage.Code
		candidate.StageName = stage.Name
		candidate.RateBPS = stage.RateBPS
		candidate.RewardQuota = rewardQuota
		settled = candidate
		return nil
	})
	if err != nil {
		return err
	}
	if settled.Id > 0 && settled.RewardQuota > 0 {
		RecordLog(settled.InviterUserId, LogTypeSystem, fmt.Sprintf(
			"邀请返利到账：%s · %.0f%% · %s",
			settled.StageName, float64(settled.RateBPS)/100, logger.LogQuota(settled.RewardQuota),
		))
	}
	return nil
}

func userNetRechargeCNY(userID int) (float64, error) {
	var topUps []TopUp
	if err := DB.Where("user_id = ? AND status = ?", userID, common.TopUpStatusSuccess).Find(&topUps).Error; err != nil {
		return 0, err
	}
	total := decimal.Zero
	for i := range topUps {
		if isEligibleCNYTopUp(&topUps[i]) {
			total = total.Add(decimal.NewFromFloat(topUps[i].Money))
		}
	}
	var refunds []PaymentRefundReview
	if err := DB.Where("user_id = ? AND refund_amount > ?", userID, 0).Find(&refunds).Error; err != nil {
		return 0, err
	}
	for _, refund := range refunds {
		if strings.EqualFold(refund.Currency, "CNY") {
			total = total.Sub(decimal.NewFromFloat(refund.RefundAmount))
		}
	}
	adminRecharge, err := adminRechargeCNYByUserIDs([]int{userID})
	if err != nil {
		return 0, err
	}
	if amount, exists := adminRecharge[userID]; exists {
		total = total.Add(amount)
	}
	if total.IsNegative() {
		total = decimal.Zero
	}
	return total.Round(2).InexactFloat64(), nil
}

func GetRewardProgramOverview(userID int, program string) (*RewardProgramOverview, error) {
	if userID <= 0 {
		return nil, errors.New("invalid user id")
	}
	overview := &RewardProgramOverview{}
	if program == "affiliate" {
		count, err := effectiveInviteCountTx(DB, userID)
		if err != nil {
			return nil, err
		}
		var totalRewardQuota int64
		if err := DB.Model(&AffiliateRebateRecord{}).Where("inviter_user_id = ?", userID).
			Select("COALESCE(SUM(reward_quota), 0)").Scan(&totalRewardQuota).Error; err != nil {
			return nil, err
		}
		var rebateOrderCount int64
		if err := DB.Model(&AffiliateRebateRecord{}).Where("inviter_user_id = ?", userID).
			Count(&rebateOrderCount).Error; err != nil {
			return nil, err
		}
		var rebateRecords []AffiliateRebateRecord
		if err := DB.Where("inviter_user_id = ?", userID).Order("id desc").Limit(8).Find(&rebateRecords).Error; err != nil {
			return nil, err
		}
		var transferRecords []AffiliateTransferRecord
		if err := DB.Where("user_id = ?", userID).Order("id desc").Limit(12).Find(&transferRecords).Error; err != nil {
			return nil, err
		}
		overview.Affiliate = AffiliateRewardOverview{
			EffectiveInviteCount: count,
			CurrentStage:         affiliateStageForCount(count),
			NextStage:            affiliateNextStage(count),
			TotalRewardQuota:     totalRewardQuota,
			TotalRewardCNY:       quotaToCNY(totalRewardQuota),
			RebateOrderCount:     rebateOrderCount,
			RecentRecords:        rebateRecords,
			RecentTransfers:      transferRecords,
			Stages:               AffiliateRewardStages(),
		}
		return overview, nil
	}
	if program != "recharge" {
		return nil, errors.New("invalid reward program")
	}
	totalRecharge, err := userNetRechargeCNY(userID)
	if err != nil {
		return nil, err
	}
	unlocked := int(math.Floor(totalRecharge / RechargeBenefitThresholdCNY))
	var claims []RechargeBenefitClaim
	if err := DB.Where("user_id = ?", userID).Order("milestone_index desc").Limit(20).Find(&claims).Error; err != nil {
		return nil, err
	}
	var pending int64
	if err := DB.Model(&RechargeBenefitClaim{}).Where("user_id = ? AND status = ?", userID, RechargeBenefitStatusPending).Count(&pending).Error; err != nil {
		return nil, err
	}
	var granted int64
	if err := DB.Model(&RechargeBenefitClaim{}).Where("user_id = ? AND status = ?", userID, RechargeBenefitStatusGranted).Count(&granted).Error; err != nil {
		return nil, err
	}
	used := int(pending + granted)
	available := unlocked - used
	if available < 0 {
		available = 0
	}
	cycle := math.Mod(totalRecharge, RechargeBenefitThresholdCNY)
	if totalRecharge > 0 && cycle == 0 {
		cycle = RechargeBenefitThresholdCNY
	}

	overview.Recharge = RechargeBenefitOverview{
		TotalRechargeCNY: totalRecharge,
		CurrentCycleCNY:  cycle,
		NextThresholdCNY: float64((unlocked + 1) * RechargeBenefitThresholdCNY),
		UnlockedCount:    unlocked,
		AvailableCount:   available,
		PendingCount:     int(pending),
		GrantedCount:     int(granted),
		ThresholdUnitCNY: RechargeBenefitThresholdCNY,
		RewardUnitCNY:    RechargeBenefitRewardCNY,
		RecentClaims:     claims,
	}
	return overview, nil
}

func GetAdminUserRewardSummary(userID int) (*AdminUserRewardSummary, error) {
	if userID <= 0 {
		return nil, errors.New("invalid user id")
	}
	var userCount int64
	if err := DB.Model(&User{}).Where("id = ?", userID).Count(&userCount).Error; err != nil {
		return nil, err
	}
	if userCount == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	affiliate, err := GetRewardProgramOverview(userID, "affiliate")
	if err != nil {
		return nil, err
	}
	recharge, err := GetRewardProgramOverview(userID, "recharge")
	if err != nil {
		return nil, err
	}
	return &AdminUserRewardSummary{
		UserId:    userID,
		Affiliate: affiliate.Affiliate,
		Recharge:  recharge.Recharge,
	}, nil
}

func GetAdminUserRewardListSummaries(userIDs []int) (map[int]AdminUserRewardListSummary, error) {
	result := make(map[int]AdminUserRewardListSummary, len(userIDs))
	uniqueIDs := make([]int, 0, len(userIDs))
	seen := make(map[int]struct{}, len(userIDs))
	for _, userID := range userIDs {
		if userID <= 0 {
			continue
		}
		if _, exists := seen[userID]; exists {
			continue
		}
		seen[userID] = struct{}{}
		uniqueIDs = append(uniqueIDs, userID)
		result[userID] = AdminUserRewardListSummary{
			UserId:       userID,
			CurrentStage: affiliateStageForCount(0),
		}
	}
	if len(uniqueIDs) == 0 {
		return result, nil
	}

	var rebateRecords []AffiliateRebateRecord
	if err := DB.Where("inviter_user_id IN ?", uniqueIDs).Find(&rebateRecords).Error; err != nil {
		return nil, err
	}
	inviteesByInviter := make(map[int]map[int]struct{}, len(uniqueIDs))
	rewardQuotaByInviter := make(map[int]int64, len(uniqueIDs))
	for _, record := range rebateRecords {
		invitees := inviteesByInviter[record.InviterUserId]
		if invitees == nil {
			invitees = make(map[int]struct{})
			inviteesByInviter[record.InviterUserId] = invitees
		}
		invitees[record.InviteeUserId] = struct{}{}
		rewardQuotaByInviter[record.InviterUserId] += int64(record.RewardQuota)
		summary := result[record.InviterUserId]
		summary.RebateOrderCount++
		result[record.InviterUserId] = summary
	}

	var topUps []TopUp
	if err := DB.Where("user_id IN ? AND status = ?", uniqueIDs, common.TopUpStatusSuccess).Find(&topUps).Error; err != nil {
		return nil, err
	}
	rechargeByUser := make(map[int]decimal.Decimal, len(uniqueIDs))
	for i := range topUps {
		if isEligibleCNYTopUp(&topUps[i]) {
			current, exists := rechargeByUser[topUps[i].UserId]
			if !exists {
				current = decimal.Zero
			}
			rechargeByUser[topUps[i].UserId] = current.Add(decimal.NewFromFloat(topUps[i].Money))
		}
	}
	var refunds []PaymentRefundReview
	if err := DB.Where("user_id IN ? AND refund_amount > ?", uniqueIDs, 0).Find(&refunds).Error; err != nil {
		return nil, err
	}
	for _, refund := range refunds {
		if strings.EqualFold(refund.Currency, "CNY") {
			current, exists := rechargeByUser[refund.UserId]
			if !exists {
				current = decimal.Zero
			}
			rechargeByUser[refund.UserId] = current.Sub(decimal.NewFromFloat(refund.RefundAmount))
		}
	}
	adminRechargeByUser, err := adminRechargeCNYByUserIDs(uniqueIDs)
	if err != nil {
		return nil, err
	}
	for userID, amount := range adminRechargeByUser {
		current, exists := rechargeByUser[userID]
		if !exists {
			current = decimal.Zero
		}
		rechargeByUser[userID] = current.Add(amount)
	}

	var claims []RechargeBenefitClaim
	if err := DB.Where("user_id IN ?", uniqueIDs).Find(&claims).Error; err != nil {
		return nil, err
	}
	for _, claim := range claims {
		summary := result[claim.UserId]
		switch claim.Status {
		case RechargeBenefitStatusPending:
			summary.PendingBenefitCount++
		case RechargeBenefitStatusGranted:
			summary.GrantedBenefitCount++
		}
		result[claim.UserId] = summary
	}

	for _, userID := range uniqueIDs {
		summary := result[userID]
		summary.EffectiveInviteCount = len(inviteesByInviter[userID])
		summary.CurrentStage = affiliateStageForCount(summary.EffectiveInviteCount)
		summary.TotalRewardCNY = quotaToCNY(rewardQuotaByInviter[userID])
		recharge, exists := rechargeByUser[userID]
		if !exists {
			recharge = decimal.Zero
		}
		if recharge.IsNegative() {
			recharge = decimal.Zero
		}
		summary.TotalRechargeCNY = recharge.Round(2).InexactFloat64()
		result[userID] = summary
	}
	return result, nil
}

func RequestRechargeBenefit(userID int) (*RechargeBenefitClaim, error) {
	if !setting.IsRechargeBenefitEnabled() {
		return nil, errors.New("千元充能活动当前未开放")
	}
	totalRecharge, err := userNetRechargeCNY(userID)
	if err != nil {
		return nil, err
	}
	unlocked := int(math.Floor(totalRecharge / RechargeBenefitThresholdCNY))
	if unlocked <= 0 {
		return nil, errors.New("累计净充值尚未达到 1000 CNY")
	}
	var existing []RechargeBenefitClaim
	if err := DB.Where("user_id = ?", userID).Order("milestone_index asc").Find(&existing).Error; err != nil {
		return nil, err
	}
	used := make(map[int]struct{}, len(existing))
	rejected := make(map[int]RechargeBenefitClaim)
	for _, claim := range existing {
		if claim.Status == RechargeBenefitStatusRejected {
			rejected[claim.MilestoneIndex] = claim
			continue
		}
		used[claim.MilestoneIndex] = struct{}{}
	}
	milestone := 0
	for i := 1; i <= unlocked; i++ {
		if _, exists := used[i]; !exists {
			milestone = i
			break
		}
	}
	if milestone == 0 {
		return nil, errors.New("当前没有可申请的千元充能福利")
	}
	now := common.GetTimestamp()
	claim := &RechargeBenefitClaim{
		UserId:         userID,
		MilestoneIndex: milestone,
		ThresholdCNY:   milestone * RechargeBenefitThresholdCNY,
		RewardCNY:      RechargeBenefitRewardCNY,
		RewardQuota:    cnyToQuota(RechargeBenefitRewardCNY),
		Status:         RechargeBenefitStatusPending,
		RequestedAt:    now,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if claim.RewardQuota <= 0 {
		return nil, errors.New("系统额度换算配置无效")
	}
	if previous, ok := rejected[milestone]; ok {
		claim.Id = previous.Id
		claim.CreatedAt = previous.CreatedAt
		if err := DB.Model(&RechargeBenefitClaim{}).Where("id = ? AND status = ?", previous.Id, RechargeBenefitStatusRejected).Updates(map[string]interface{}{
			"status":       RechargeBenefitStatusPending,
			"requested_at": now,
			"granted_at":   0,
			"granted_by":   0,
			"admin_remark": "",
			"reward_quota": claim.RewardQuota,
			"updated_at":   now,
		}).Error; err != nil {
			return nil, err
		}
	} else if err := DB.Create(claim).Error; err != nil {
		return nil, err
	}
	RecordLog(userID, LogTypeSystem, fmt.Sprintf("千元充能福利已申请：累计充值达 %d CNY", claim.ThresholdCNY))
	return claim, nil
}

func ListRechargeBenefitClaims(pageInfo *common.PageInfo, status string) ([]RechargeBenefitClaim, int64, error) {
	if pageInfo == nil {
		return nil, 0, errors.New("page info is nil")
	}
	query := DB.Model(&RechargeBenefitClaim{})
	if status = strings.TrimSpace(status); status != "" {
		query = query.Where("status = ?", status)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var claims []RechargeBenefitClaim
	if err := query.Order("requested_at desc, id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&claims).Error; err != nil {
		return nil, 0, err
	}
	userIDs := make([]int, 0, len(claims))
	for _, claim := range claims {
		userIDs = append(userIDs, claim.UserId)
	}
	if len(userIDs) > 0 {
		var users []User
		if err := DB.Select("id", "username").Where("id IN ?", userIDs).Find(&users).Error; err != nil {
			return nil, 0, err
		}
		usernameByID := make(map[int]string, len(users))
		for _, user := range users {
			usernameByID[user.Id] = user.Username
		}
		for i := range claims {
			claims[i].Username = usernameByID[claims[i].UserId]
		}
	}
	return claims, total, nil
}

func ReviewRechargeBenefitClaim(claimID int, adminID int, grant bool, remark string) (*RechargeBenefitClaim, error) {
	if !setting.IsRechargeBenefitEnabled() {
		return nil, errors.New("千元充能活动当前未开放")
	}
	if claimID <= 0 || adminID <= 0 {
		return nil, errors.New("invalid claim or admin id")
	}
	remark = strings.TrimSpace(remark)
	var reviewed RechargeBenefitClaim
	err := DB.Transaction(func(tx *gorm.DB) error {
		var claim RechargeBenefitClaim
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", claimID).First(&claim).Error; err != nil {
			return err
		}
		if claim.Status != RechargeBenefitStatusPending {
			return errors.New("该福利申请已处理")
		}
		now := common.GetTimestamp()
		updates := map[string]interface{}{
			"updated_at":   now,
			"granted_by":   adminID,
			"admin_remark": remark,
		}
		if grant {
			if err := tx.Model(&User{}).Where("id = ?", claim.UserId).
				Update("quota", gorm.Expr("quota + ?", claim.RewardQuota)).Error; err != nil {
				return err
			}
			updates["status"] = RechargeBenefitStatusGranted
			updates["granted_at"] = now
			claim.Status = RechargeBenefitStatusGranted
			claim.GrantedAt = now
		} else {
			updates["status"] = RechargeBenefitStatusRejected
			claim.Status = RechargeBenefitStatusRejected
		}
		if err := tx.Model(&RechargeBenefitClaim{}).Where("id = ?", claim.Id).Updates(updates).Error; err != nil {
			return err
		}
		claim.GrantedBy = adminID
		claim.AdminRemark = remark
		claim.UpdatedAt = now
		reviewed = claim
		return nil
	})
	if err != nil {
		return nil, err
	}
	if reviewed.Status == RechargeBenefitStatusGranted {
		_ = cacheIncrUserQuota(reviewed.UserId, int64(reviewed.RewardQuota))
		RecordLog(reviewed.UserId, LogTypeSystem, fmt.Sprintf("千元充能福利到账：%s", logger.LogQuota(reviewed.RewardQuota)))
	} else {
		RecordLog(reviewed.UserId, LogTypeSystem, "千元充能福利申请未通过，请联系管理员查看原因")
	}
	return &reviewed, nil
}
