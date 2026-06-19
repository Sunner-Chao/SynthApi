package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestRedeemLimitsUserOncePerBatch(t *testing.T) {
	truncateTables(t)

	const batchId = "batch000000000000000000000000001"
	require.NoError(t, DB.Create(&User{Id: 1, Username: "user-1", Status: common.UserStatusEnabled, AffCode: "aff-user-1"}).Error)
	require.NoError(t, DB.Create(&User{Id: 2, Username: "user-2", Status: common.UserStatusEnabled, AffCode: "aff-user-2"}).Error)

	codes := []*Redemption{
		{
			UserId:      100,
			Key:         "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			Status:      common.RedemptionCodeStatusEnabled,
			Name:        "batch gift 1",
			Quota:       100,
			CreatedTime: common.GetTimestamp(),
			BatchId:     batchId,
		},
		{
			UserId:      100,
			Key:         "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			Status:      common.RedemptionCodeStatusEnabled,
			Name:        "batch gift 2",
			Quota:       100,
			CreatedTime: common.GetTimestamp(),
			BatchId:     batchId,
		},
		{
			UserId:      100,
			Key:         "cccccccccccccccccccccccccccccccc",
			Status:      common.RedemptionCodeStatusEnabled,
			Name:        "batch gift 3",
			Quota:       100,
			CreatedTime: common.GetTimestamp(),
			BatchId:     batchId,
		},
	}
	for _, code := range codes {
		require.NoError(t, DB.Create(code).Error)
	}

	quota, err := Redeem(codes[0].Key, 1)
	require.NoError(t, err)
	require.Equal(t, 100, quota)

	_, err = Redeem(codes[1].Key, 1)
	require.Error(t, err)

	quota, err = Redeem(codes[2].Key, 2)
	require.NoError(t, err)
	require.Equal(t, 100, quota)
}
