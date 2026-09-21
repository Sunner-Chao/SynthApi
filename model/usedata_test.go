package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestUsageAggregatesExcludeAdministratorTraffic(t *testing.T) {
	const regularUserID = 910001
	const adminUserID = 910002
	const rootUserID = 910003
	now := time.Now().Unix()

	for _, id := range []int{regularUserID, adminUserID, rootUserID} {
		DB.Where("id = ?", id).Delete(&User{})
		LOG_DB.Where("user_id = ?", id).Delete(&Log{})
	}
	t.Cleanup(func() {
		for _, id := range []int{regularUserID, adminUserID, rootUserID} {
			DB.Where("id = ?", id).Delete(&User{})
			LOG_DB.Where("user_id = ?", id).Delete(&Log{})
		}
	})

	users := []*User{
		{Id: regularUserID, Username: "aggregate-regular", Password: "password", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AffCode: "aggregate-regular"},
		{Id: adminUserID, Username: "aggregate-admin", Password: "password", Role: common.RoleAdminUser, Status: common.UserStatusEnabled, AffCode: "aggregate-admin"},
		{Id: rootUserID, Username: "aggregate-root", Password: "password", Role: common.RoleRootUser, Status: common.UserStatusEnabled, AffCode: "aggregate-root"},
	}
	for _, user := range users {
		require.NoError(t, DB.Create(user).Error)
	}
	logs := []*Log{
		{UserId: regularUserID, Username: "aggregate-regular", CreatedAt: now, Type: LogTypeConsume, ModelName: "aggregate-model", Quota: 300, PromptTokens: 30, CompletionTokens: 20},
		{UserId: adminUserID, Username: "aggregate-admin", CreatedAt: now, Type: LogTypeConsume, ModelName: "aggregate-model", Quota: 700, PromptTokens: 70, CompletionTokens: 30},
		{UserId: rootUserID, Username: "aggregate-root", CreatedAt: now, Type: LogTypeConsume, ModelName: "aggregate-model", Quota: 900, PromptTokens: 90, CompletionTokens: 10},
	}
	for _, log := range logs {
		require.NoError(t, LOG_DB.Create(log).Error)
	}

	stat, err := SumUsedQuota(LogTypeConsume, now-1, now+1, "aggregate-model", "", "", 0, "")
	require.NoError(t, err)
	require.Equal(t, 300, stat.Quota)
	require.Equal(t, 1, stat.Rpm)
	require.Equal(t, 50, stat.Tpm)

	data, err := GetAllQuotaDates(now-1, now+1, "")
	require.NoError(t, err)
	require.Len(t, data, 1)
	require.Equal(t, 300, data[0].Quota)
	require.Equal(t, 50, data[0].TokenUsed)
}
