package service

import (
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/gin-gonic/gin"
)

// Keep only a short-lived previous selection so a later request can explain
// that Auto returned to its highest-priority group after a degradation.
const autoRouteSelectionStateTTL = 30 * time.Minute

type autoRouteSelectionKey struct {
	scope string
	model string
}

type autoRouteSelectionState struct {
	group    string
	priority int
	seenAt   time.Time
}

var autoRouteSelections = struct {
	sync.Mutex
	items map[autoRouteSelectionKey]autoRouteSelectionState
}{
	items: make(map[autoRouteSelectionKey]autoRouteSelectionState),
}

// MarkAutoRouteSelection records the visible state of an Auto selection once
// per request. Priority is derived from the configured Auto order, not from a
// filtered list of temporarily cooling groups.
func MarkAutoRouteSelection(c *gin.Context, modelName, group string) {
	if c == nil || strings.TrimSpace(modelName) == "" || strings.TrimSpace(group) == "" {
		return
	}
	if common.GetContextKeyString(c, constant.ContextKeyAutoRouteStatus) != "" {
		return
	}

	modelName = strings.TrimSpace(modelName)
	group = strings.TrimSpace(group)
	userGroup := common.GetContextKeyString(c, constant.ContextKeyUserGroup)
	configuredGroups := GetRequestAutoGroups(c, userGroup)
	priority := 0
	for index, configuredGroup := range configuredGroups {
		if configuredGroup == group {
			priority = index + 1
			break
		}
	}
	if priority == 0 {
		return
	}

	status := "normal"
	scope := autoRouteFailureScope(c)
	if priority > 1 {
		status = "degraded"
	}
	if scope != "" {
		key := autoRouteSelectionKey{scope: scope, model: modelName}
		now := time.Now()
		autoRouteSelections.Lock()
		for stateKey, state := range autoRouteSelections.items {
			if now.Sub(state.seenAt) >= autoRouteSelectionStateTTL {
				delete(autoRouteSelections.items, stateKey)
			}
		}
		if priority == 1 {
			if previous, ok := autoRouteSelections.items[key]; ok && previous.priority > 1 {
				status = "recovered"
			}
		}
		autoRouteSelections.items[key] = autoRouteSelectionState{
			group:    group,
			priority: priority,
			seenAt:   now,
		}
		autoRouteSelections.Unlock()
	}

	common.SetContextKey(c, constant.ContextKeyAutoRouteStatus, status)
	common.SetContextKey(c, constant.ContextKeyAutoRoutePriority, priority)
}

func GetAutoRouteLogState(c *gin.Context, modelName, group string) (string, int) {
	if c == nil {
		return "", 0
	}
	MarkAutoRouteSelection(c, modelName, group)
	return common.GetContextKeyString(c, constant.ContextKeyAutoRouteStatus),
		common.GetContextKeyInt(c, constant.ContextKeyAutoRoutePriority)
}
