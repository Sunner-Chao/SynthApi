package service

import (
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

// Auto route failures are deliberately short-lived. They steer a client's
// next retry away from the failed Auto group without permanently disabling a
// channel for a transient upstream outage.
const autoRouteFailureTTL = 90 * time.Second

// ShouldMarkAutoRouteFailure identifies errors that mean the selected Auto
// group is temporarily unusable. It is intentionally narrow for channel
// selection errors so ordinary 404s and local user quota errors are not
// allowed to cool down a healthy group.
func ShouldMarkAutoRouteFailure(err *types.NewAPIError) bool {
	if err == nil {
		return false
	}
	// An upstream 429 is route-scoped even when it was wrapped by a relay
	// adaptor as a generic bad-response error (for example, bodies containing
	// "exceeded retry limit, last status: 429"). Do not require a channel error
	// code here: Auto must be able to move to its next group for every upstream
	// rate-limit response.
	if err.StatusCode == http.StatusTooManyRequests {
		return true
	}
	if err.GetErrorCode() == types.ErrorCodeConcurrencyLimit {
		return true
	}
	message := strings.ToLower(strings.TrimSpace(err.Error()))
	// A positive wallet balance can still be below the estimated cost of the
	// selected (usually higher-priced) Auto group. Allow the next client retry
	// to try a cheaper group. Do not classify the plain "user quota insufficient"
	// error this way: when the balance is zero, changing upstream groups cannot
	// make the request affordable.
	if err.GetErrorCode() == types.ErrorCodeInsufficientUserQuota &&
		(strings.Contains(message, "预扣费额度失败") || strings.Contains(message, "pre-consume quota failed")) {
		return true
	}
	for _, marker := range []string{
		"exceeded retry limit",
		"last status: 429",
		"too many requests",
		"unknown provider for model",
		"not supported by any configured account in this group",
		"not supported by any currently configured upstream account",
		"no available channel",
		"no available account",
		"no available key",
		"all eligible channels are at concurrency capacity",
		"all channels at capacity",
		"selected model is at capacity",
		"insufficient account balance",
		"insufficient balance",
		"balance is insufficient",
		"insufficient funds",
		"余额不足",
		"encrypted function output content could not be decrypted or decoded",
		"transport error",
		"network error",
		"error decoding response body",
	} {
		if strings.Contains(message, marker) {
			return true
		}
	}
	switch err.StatusCode {
	case http.StatusRequestTimeout, http.StatusTooEarly, http.StatusTooManyRequests,
		http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout:
		return err.GetErrorCode() == types.ErrorCodeGetChannelFailed || types.IsChannelError(err)
	default:
		return false
	}
}

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
