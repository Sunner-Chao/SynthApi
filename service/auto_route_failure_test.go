package service

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func newAutoRouteFailureTestContext(tokenID int) *gin.Context {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	common.SetContextKey(c, constant.ContextKeyTokenId, tokenID)
	return c
}

func TestAutoRouteFailureRotatesGroupForNextRetry(t *testing.T) {
	autoRouteFailures.Lock()
	autoRouteFailures.items = make(map[autoRouteFailureKey]time.Time)
	autoRouteFailures.Unlock()

	c := newAutoRouteFailureTestContext(602)
	require.True(t, MarkAutoRouteFailure(c, "gpt-5.5", "Plus线路一"))
	require.True(t, IsAutoRouteGroupFailed(c, "gpt-5.5", "Plus线路一"))
	require.False(t, IsAutoRouteGroupFailed(c, "gpt-5.5", "Plus线路二"))
}

func TestAutoRouteFailureRequiresStableIdentity(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	require.False(t, MarkAutoRouteFailure(c, "gpt-5.5", "Plus线路一"))
}

func TestAutoRouteFailureMatchesAffinityMetadataBeforeLogInfo(t *testing.T) {
	autoRouteFailures.Lock()
	autoRouteFailures.items = make(map[autoRouteFailureKey]time.Time)
	autoRouteFailures.Unlock()

	first := newAutoRouteFailureTestContext(603)
	setChannelAffinityContext(first, channelAffinityMeta{KeyFingerprint: "conversation-603"})
	require.True(t, MarkAutoRouteFailure(first, "gpt-5.5", "Plus线路一"))

	// A new request has the affinity metadata after preferred-channel lookup,
	// but does not have the selected-channel log info yet.
	second := newAutoRouteFailureTestContext(603)
	setChannelAffinityContext(second, channelAffinityMeta{KeyFingerprint: "conversation-603"})
	require.True(t, IsAutoRouteGroupFailed(second, "gpt-5.5", "Plus线路一"))
}

func TestAutoRouteSelectionStateMarksDegradeAndRecovery(t *testing.T) {
	configureRequestAutoGroupsTest(t)
	autoRouteSelections.Lock()
	autoRouteSelections.items = make(map[autoRouteSelectionKey]autoRouteSelectionState)
	autoRouteSelections.Unlock()

	first := newAutoRouteFailureTestContext(604)
	common.SetContextKey(first, constant.ContextKeyUserGroup, "default")
	common.SetContextKey(first, constant.ContextKeyTokenAutoGroups, []string{"vip", "default"})
	MarkAutoRouteSelection(first, "gpt-5.5", "vip")
	require.Equal(t, "normal", common.GetContextKeyString(first, constant.ContextKeyAutoRouteStatus))
	require.Equal(t, 1, common.GetContextKeyInt(first, constant.ContextKeyAutoRoutePriority))

	degraded := newAutoRouteFailureTestContext(604)
	common.SetContextKey(degraded, constant.ContextKeyUserGroup, "default")
	common.SetContextKey(degraded, constant.ContextKeyTokenAutoGroups, []string{"vip", "default"})
	MarkAutoRouteSelection(degraded, "gpt-5.5", "default")
	require.Equal(t, "degraded", common.GetContextKeyString(degraded, constant.ContextKeyAutoRouteStatus))
	require.Equal(t, 2, common.GetContextKeyInt(degraded, constant.ContextKeyAutoRoutePriority))

	recovered := newAutoRouteFailureTestContext(604)
	common.SetContextKey(recovered, constant.ContextKeyUserGroup, "default")
	common.SetContextKey(recovered, constant.ContextKeyTokenAutoGroups, []string{"vip", "default"})
	MarkAutoRouteSelection(recovered, "gpt-5.5", "vip")
	require.Equal(t, "recovered", common.GetContextKeyString(recovered, constant.ContextKeyAutoRouteStatus))
	require.Equal(t, 1, common.GetContextKeyInt(recovered, constant.ContextKeyAutoRoutePriority))
}
