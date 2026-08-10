package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/service"
)

const cmccSeedanceTaskMetadataPrefix = "cmcc_seedance_task:"

func buildCMCCSeedanceTaskMetadataKey(groupID int64, taskHash string) string {
	return fmt.Sprintf("%s%d:%s", cmccSeedanceTaskMetadataPrefix, groupID, taskHash)
}

func (c *gatewayCache) SaveCMCCSeedanceTaskMetadata(
	ctx context.Context,
	groupID int64,
	taskHash string,
	metadata *service.CMCCSeedanceBillingMetadata,
	ttl time.Duration,
) error {
	if metadata == nil || taskHash == "" || ttl <= 0 {
		return fmt.Errorf("invalid cmcc seedance task metadata")
	}
	encoded, err := json.Marshal(metadata)
	if err != nil {
		return fmt.Errorf("encode cmcc seedance task metadata: %w", err)
	}
	return c.rdb.Set(ctx, buildCMCCSeedanceTaskMetadataKey(groupID, taskHash), encoded, ttl).Err()
}

func (c *gatewayCache) GetCMCCSeedanceTaskMetadata(
	ctx context.Context,
	groupID int64,
	taskHash string,
) (*service.CMCCSeedanceBillingMetadata, error) {
	if taskHash == "" {
		return nil, fmt.Errorf("invalid cmcc seedance task metadata key")
	}
	encoded, err := c.rdb.Get(ctx, buildCMCCSeedanceTaskMetadataKey(groupID, taskHash)).Bytes()
	if err != nil {
		return nil, err
	}
	var metadata service.CMCCSeedanceBillingMetadata
	if err := json.Unmarshal(encoded, &metadata); err != nil {
		return nil, fmt.Errorf("decode cmcc seedance task metadata: %w", err)
	}
	return &metadata, nil
}

var _ service.CMCCSeedanceTaskMetadataStore = (*gatewayCache)(nil)
