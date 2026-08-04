package model

import (
	"errors"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestValidatePublicRegistrationRejectsSameNetworkInvitation(t *testing.T) {
	truncateTables(t)
	originalSubnetEnabled := common.RegisterSubnetLimitEnable
	originalSubnetMax := common.RegisterSubnetLimitMaxAccounts
	t.Cleanup(func() {
		common.RegisterSubnetLimitEnable = originalSubnetEnabled
		common.RegisterSubnetLimitMaxAccounts = originalSubnetMax
	})
	common.RegisterSubnetLimitEnable = false

	inviter := &User{Username: "network-inviter", RegisterIP: "203.0.113.10", Status: common.UserStatusEnabled}
	require.NoError(t, DB.Create(inviter).Error)
	candidate := &User{Username: "network-invitee", Status: common.UserStatusEnabled}

	_, _, err := ValidatePublicRegistration(candidate, "203.0.113.99", inviter.Id)
	require.ErrorIs(t, err, ErrSelfInvitation)
}

func TestValidatePublicRegistrationEnforcesIPv4SubnetLimit(t *testing.T) {
	truncateTables(t)
	originalSubnetEnabled := common.RegisterSubnetLimitEnable
	originalSubnetMax := common.RegisterSubnetLimitMaxAccounts
	t.Cleanup(func() {
		common.RegisterSubnetLimitEnable = originalSubnetEnabled
		common.RegisterSubnetLimitMaxAccounts = originalSubnetMax
	})
	common.RegisterSubnetLimitEnable = true
	common.RegisterSubnetLimitMaxAccounts = 2

	for i, ip := range []string{"198.51.100.10", "198.51.100.11"} {
		require.NoError(t, DB.Create(&User{
			Username:   "subnet-user-" + string(rune('a'+i)),
			Status:     common.UserStatusEnabled,
			AffCode:    "subnet-aff-" + string(rune('a'+i)),
			RegisterIP: ip,
		}).Error)
	}
	candidate := &User{Username: "subnet-user-new", Status: common.UserStatusEnabled}
	_, _, err := ValidatePublicRegistration(candidate, "198.51.100.99", 0)
	require.ErrorIs(t, err, ErrRegistrationSubnetLimit)
}

func TestGrantInviteRewardAfterPaymentIsIdempotent(t *testing.T) {
	truncateTables(t)
	originalAfterPayment := common.AffiliateRewardAfterPayment
	originalMinPayment := common.AffiliateRewardMinPayment
	originalReward := common.QuotaForInviter
	t.Cleanup(func() {
		common.AffiliateRewardAfterPayment = originalAfterPayment
		common.AffiliateRewardMinPayment = originalMinPayment
		common.QuotaForInviter = originalReward
	})
	common.AffiliateRewardAfterPayment = true
	common.AffiliateRewardMinPayment = 1
	common.QuotaForInviter = 100

	inviter := &User{Username: "reward-inviter", Status: common.UserStatusEnabled, AffCode: "reward-aff-inviter"}
	require.NoError(t, DB.Create(inviter).Error)
	invitee := &User{
		Username:               "reward-invitee",
		Status:                 common.UserStatusEnabled,
		AffCode:                "reward-aff-invitee",
		InviterId:              inviter.Id,
		InviteRewardEligibleAt: time.Now().Unix(),
		InviteRewardClaimed:    false,
	}
	require.NoError(t, DB.Create(invitee).Error)
	topUp := &TopUp{
		UserId:          invitee.Id,
		Amount:          1000,
		Money:           1,
		TradeNo:         "affiliate-reward-idempotency",
		PaymentProvider: PaymentProviderMPay,
		Status:          common.TopUpStatusSuccess,
		CreateTime:      time.Now().Unix(),
	}
	require.NoError(t, DB.Create(topUp).Error)

	require.NoError(t, GrantInviteRewardAfterPayment(topUp.TradeNo))
	require.NoError(t, GrantInviteRewardAfterPayment(topUp.TradeNo))

	var updated User
	require.NoError(t, DB.First(&updated, inviter.Id).Error)
	require.Equal(t, 1, updated.AffCount)
	require.Equal(t, 100, updated.AffQuota)
	require.Equal(t, 100, updated.AffHistoryQuota)
	var claimed User
	require.NoError(t, DB.First(&claimed, invitee.Id).Error)
	require.True(t, claimed.InviteRewardClaimed)
}

func TestWithRegistrationGuardRejectsInvalidIP(t *testing.T) {
	err := WithRegistrationGuard("not-an-ip", func() error { return nil })
	require.True(t, errors.Is(err, ErrInvalidRegistrationIP))
}
