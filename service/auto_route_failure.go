package service

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/gin-gonic/gin"
)

// Auto route failures are deliberately short-lived. They steer a client's
// next retry away from the failed Auto group without permanently disabling a
// channel for a transient upstream outage.
const autoRouteFailureTTL = 90 * time.Second

type autoRouteFailureKey struct {
	scope string
	model string
	group string
}

var autoRouteFailures = struct {
	sync.Mutex
	items map[autoRouteFailureKey]time.Time
}{
	items: make(map[autoRouteFailureKey]time.Time),
}

func autoRouteFailureScope(c *gin.Context) string {
	if c == nil {
		return ""
	}
	tokenID := common.GetContextKeyInt(c, constant.ContextKeyTokenId)
	if tokenID <= 0 {
		tokenID = c.GetInt("token_id")
	}
	if tokenID <= 0 {
		tokenID = common.GetContextKeyInt(c, constant.ContextKeyUserId)
	}
	if tokenID <= 0 {
		tokenID = c.GetInt("id")
	}
	if tokenID <= 0 {
		return ""
	}

	// Keep separate cursors for distinct prompt-cache conversations. A failed
	// conversation route should not steer unrelated conversations on the token.
	// The log-info map is populated only after a channel has been selected; at
	// the beginning of a subsequent request the same value is available in the
	// affinity metadata created by GetPreferredChannelByAffinity.
	fingerprint := strings.TrimSpace(GetChannelAffinityFingerprint(c))
	if fingerprint == "" {
		if meta, ok := getChannelAffinityMeta(c); ok {
			fingerprint = strings.TrimSpace(meta.KeyFingerprint)
		}
	}
	if fingerprint != "" {
		return fmt.Sprintf("token:%d:affinity:%s", tokenID, fingerprint)
	}
	return fmt.Sprintf("token:%d", tokenID)
}

// MarkAutoRouteFailure cools down the failed group for this token/model scope.
// It returns false when the request has no stable token or user identity.
func MarkAutoRouteFailure(c *gin.Context, modelName, group string) bool {
	scope := autoRouteFailureScope(c)
	modelName = strings.TrimSpace(modelName)
	group = strings.TrimSpace(group)
	if scope == "" || modelName == "" || group == "" || group == "auto" {
		return false
	}

	autoRouteFailures.Lock()
	autoRouteFailures.items[autoRouteFailureKey{scope: scope, model: modelName, group: group}] = time.Now().Add(autoRouteFailureTTL)
	autoRouteFailures.Unlock()
	return true
}

// GetAutoRouteFailedGroups returns groups that should be skipped for the
// request's Auto route. Expired entries are removed opportunistically.
func GetAutoRouteFailedGroups(c *gin.Context, modelName string) map[string]struct{} {
	scope := autoRouteFailureScope(c)
	modelName = strings.TrimSpace(modelName)
	failed := make(map[string]struct{})
	if scope == "" || modelName == "" {
		return failed
	}

	now := time.Now()
	autoRouteFailures.Lock()
	for key, expiresAt := range autoRouteFailures.items {
		if !expiresAt.After(now) {
			delete(autoRouteFailures.items, key)
			continue
		}
		if key.scope == scope && key.model == modelName {
			failed[key.group] = struct{}{}
		}
	}
	autoRouteFailures.Unlock()
	return failed
}

func IsAutoRouteGroupFailed(c *gin.Context, modelName, group string) bool {
	group = strings.TrimSpace(group)
	if group == "" {
		return false
	}
	_, failed := GetAutoRouteFailedGroups(c, modelName)[group]
	return failed
}
