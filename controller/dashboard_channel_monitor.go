package controller

import (
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
)

type ChannelMonitorItem struct {
	Id                int                       `json:"id"`
	Name              string                    `json:"name"`
	Type              int                       `json:"type"`
	TypeName          string                    `json:"type_name"`
	Status            int                       `json:"status"`
	Group             string                    `json:"group"`
	Tag               string                    `json:"tag,omitempty"`
	ModelCount        int                       `json:"model_count"`
	ResponseTime      int                       `json:"response_time"`
	TestTime          int64                     `json:"test_time"`
	ActiveUsers       int                       `json:"active_users"`
	ChannelCount      int                       `json:"channel_count"`
	EnabledCount      int                       `json:"enabled_count"`
	SuccessRate       float64                   `json:"success_rate"`
	SuccessRateSource string                    `json:"success_rate_source"`
	AvailabilityRate  float64                   `json:"availability_rate"`
	UsageRequestCount int64                     `json:"usage_request_count"`
	UsageSuccessCount int64                     `json:"usage_success_count"`
	SuccessSeries     []perfmetrics.BucketPoint `json:"success_series,omitempty"`
}

type ChannelMonitorSummary struct {
	Total          int64 `json:"total"`
	Enabled        int64 `json:"enabled"`
	AutoDisabled   int64 `json:"auto_disabled"`
	ManualDisabled int64 `json:"manual_disabled"`
	Untested       int64 `json:"untested"`
	Slow           int64 `json:"slow"`
	ActiveUsers    int64 `json:"active_users"`
	ActiveChannels int64 `json:"active_channels"`
}

type channelMonitorGroupAggregate struct {
	name           string
	channelCount   int
	enabledCount   int
	autoDisabled   int
	manualDisabled int
	untested       bool
	models         map[string]struct{}
	responseTotal  int
	responseCount  int
	slowestMs      int
	lastTestTime   int64
	activeUsers    int
	perf           *perfmetrics.GroupResult
}

func GetDashboardChannelMonitor(c *gin.Context) {
	const slowResponseMs = 3000
	const defaultItemLimit = 12
	const maxItemLimit = 200
	const defaultModelName = "gpt-5.5"

	selectedModel := strings.TrimSpace(c.Query("model"))
	if selectedModel == "" {
		selectedModel = defaultModelName
	}

	itemLimit := defaultItemLimit
	if rawLimit := c.Query("limit"); rawLimit != "" {
		parsedLimit, err := strconv.Atoi(rawLimit)
		if err == nil && parsedLimit > 0 {
			itemLimit = min(parsedLimit, maxItemLimit)
		}
	}

	var channels []model.Channel
	if err := model.DB.Model(&model.Channel{}).
		Order("\"group\" asc, status asc, test_time desc, response_time desc").
		Find(&channels).Error; err != nil {
		common.SysError("failed to get channel monitor data: " + err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "获取渠道状态失败"})
		return
	}

	allowedGroups := map[string]struct{}{}
	filterByAllowedGroups := c.GetInt("role") < common.RoleAdminUser
	if filterByAllowedGroups {
		userGroup, _ := model.GetUserGroup(c.GetInt("id"), false)
		userUsableGroups := service.GetUserUsableGroups(userGroup)
		knownGroups := ratio_setting.GetGroupRatioCopy()
		for groupName := range userUsableGroups {
			if groupName == "auto" {
				continue
			}
			if _, ok := knownGroups[groupName]; ok {
				allowedGroups[groupName] = struct{}{}
			}
		}
	}

	modelNames := make(map[string]struct{})
	channelIDs := make([]int, 0, len(channels))
	for _, channel := range channels {
		if !channelHasMonitorVisibleGroup(&channel, filterByAllowedGroups, allowedGroups) {
			continue
		}
		if !channelSupportsMonitorModel(&channel, selectedModel) {
			continue
		}
		for _, groupName := range monitorChannelGroups(&channel) {
			if filterByAllowedGroups {
				if _, ok := allowedGroups[groupName]; !ok {
					continue
				}
			}
			channelIDs = append(channelIDs, channel.Id)
			break
		}
	}
	activeUserCounts := service.GetChannelActiveUserCounts(channelIDs)
	activeUsers, _ := service.GetChannelActiveUserSummaryForChannels(channelIDs)

	groups := make(map[string]*channelMonitorGroupAggregate)
	for _, channel := range channels {
		if !channelHasMonitorVisibleGroup(&channel, filterByAllowedGroups, allowedGroups) {
			continue
		}
		for _, modelName := range channel.GetModels() {
			modelName = strings.TrimSpace(modelName)
			if modelName != "" {
				modelNames[modelName] = struct{}{}
			}
		}
		if !channelSupportsMonitorModel(&channel, selectedModel) {
			continue
		}

		channelGroups := monitorChannelGroups(&channel)

		for _, groupName := range channelGroups {
			groupName = strings.TrimSpace(groupName)
			if groupName == "" {
				continue
			}
			if filterByAllowedGroups {
				if _, ok := allowedGroups[groupName]; !ok {
					continue
				}
			}

			group := groups[groupName]
			if group == nil {
				group = &channelMonitorGroupAggregate{
					name:   groupName,
					models: make(map[string]struct{}),
				}
				groups[groupName] = group
			}

			group.channelCount++
			switch channel.Status {
			case common.ChannelStatusEnabled:
				group.enabledCount++
			case common.ChannelStatusAutoDisabled:
				group.autoDisabled++
			case common.ChannelStatusManuallyDisabled:
				group.manualDisabled++
			}

			if channel.TestTime == 0 {
				group.untested = true
			}
			if channel.TestTime > group.lastTestTime {
				group.lastTestTime = channel.TestTime
			}
			if channel.ResponseTime > 0 {
				group.responseTotal += channel.ResponseTime
				group.responseCount++
				if channel.ResponseTime > group.slowestMs {
					group.slowestMs = channel.ResponseTime
				}
			}
			group.activeUsers += activeUserCounts[channel.Id]
			for _, modelName := range channel.GetModels() {
				modelName = strings.TrimSpace(modelName)
				if modelName != "" {
					group.models[modelName] = struct{}{}
				}
			}
		}
	}

	perfResult, perfErr := perfmetrics.Query(perfmetrics.QueryParams{
		Model: selectedModel,
		Hours: 24,
	})
	if perfErr != nil {
		common.SysError("failed to get group monitor performance metrics: " + perfErr.Error())
	} else {
		for index := range perfResult.Groups {
			group := groups[perfResult.Groups[index].Group]
			if group == nil || perfResult.Groups[index].RequestCount <= 0 {
				continue
			}
			group.perf = &perfResult.Groups[index]
		}
	}

	groupList := make([]*channelMonitorGroupAggregate, 0, len(groups))
	for _, group := range groups {
		groupList = append(groupList, group)
	}
	sort.Slice(groupList, func(i, j int) bool {
		leftStatus := groupDisplayStatus(groupList[i])
		rightStatus := groupDisplayStatus(groupList[j])
		if leftStatus != rightStatus {
			return leftStatus < rightStatus
		}
		leftRate := groupSortSuccessRate(groupList[i])
		rightRate := groupSortSuccessRate(groupList[j])
		if leftRate != rightRate {
			return leftRate < rightRate
		}
		return groupList[i].name < groupList[j].name
	})
	items := make([]ChannelMonitorItem, 0, min(len(groupList), itemLimit))
	var enabled, autoDisabled, manualDisabled, untested, slow, activeGroups int64
	for index, group := range groupList {
		status := groupDisplayStatus(group)
		switch status {
		case common.ChannelStatusEnabled:
			enabled++
		case common.ChannelStatusAutoDisabled:
			autoDisabled++
		case common.ChannelStatusManuallyDisabled:
			manualDisabled++
		}
		if group.untested {
			untested++
		}

		responseTime := 0
		if group.responseCount > 0 {
			responseTime = group.responseTotal / group.responseCount
		}
		if responseTime >= slowResponseMs || group.slowestMs >= slowResponseMs {
			slow++
		}
		if group.activeUsers > 0 {
			activeGroups++
		}

		if index < itemLimit {
			successRate := groupSuccessRate(group)
			availabilityRate := groupAvailabilityRate(group)
			items = append(items, ChannelMonitorItem{
				Id:                index + 1,
				Name:              group.name,
				Type:              0,
				TypeName:          "Group",
				Status:            status,
				Group:             group.name,
				ModelCount:        len(group.models),
				ResponseTime:      groupResponseTime(group, responseTime),
				TestTime:          group.lastTestTime,
				ActiveUsers:       group.activeUsers,
				ChannelCount:      group.channelCount,
				EnabledCount:      group.enabledCount,
				SuccessRate:       successRate,
				SuccessRateSource: groupSuccessRateSource(group),
				AvailabilityRate:  availabilityRate,
				UsageRequestCount: groupUsageRequestCount(group),
				UsageSuccessCount: groupUsageSuccessCount(group),
				SuccessSeries:     groupSuccessSeries(group),
			})
		}
	}

	modelList := sortedMonitorModelNames(modelNames, selectedModel)
	total := int64(len(groups))
	common.ApiSuccess(c, gin.H{
		"model":  selectedModel,
		"models": modelList,
		"summary": ChannelMonitorSummary{
			Total:          total,
			Enabled:        enabled,
			AutoDisabled:   autoDisabled,
			ManualDisabled: manualDisabled,
			Untested:       untested,
			Slow:           slow,
			ActiveUsers:    activeUsers,
			ActiveChannels: activeGroups,
		},
		"items": items,
	})
}

func monitorChannelGroups(channel *model.Channel) []string {
	if channel == nil {
		return []string{}
	}
	channelGroups := channel.GetGroups()
	if len(channelGroups) == 0 {
		return []string{"default"}
	}
	return channelGroups
}

func channelHasMonitorVisibleGroup(channel *model.Channel, filterByAllowedGroups bool, allowedGroups map[string]struct{}) bool {
	for _, groupName := range monitorChannelGroups(channel) {
		if !filterByAllowedGroups {
			return true
		}
		if _, ok := allowedGroups[groupName]; ok {
			return true
		}
	}
	return false
}

func channelSupportsMonitorModel(channel *model.Channel, selectedModel string) bool {
	if channel == nil {
		return false
	}
	selectedModel = strings.TrimSpace(selectedModel)
	if selectedModel == "" {
		return true
	}
	for _, modelName := range channel.GetModels() {
		modelName = strings.TrimSpace(modelName)
		if modelName == "" {
			continue
		}
		if modelName == selectedModel || strings.EqualFold(modelName, selectedModel) {
			return true
		}
		if modelName == "*" || strings.EqualFold(modelName, "all") {
			return true
		}
	}
	return false
}

func sortedMonitorModelNames(modelNames map[string]struct{}, selectedModel string) []string {
	selectedModel = strings.TrimSpace(selectedModel)
	if selectedModel != "" {
		modelNames[selectedModel] = struct{}{}
	}

	list := make([]string, 0, len(modelNames))
	for modelName := range modelNames {
		modelName = strings.TrimSpace(modelName)
		if modelName != "" && modelName != "*" && !strings.EqualFold(modelName, "all") {
			list = append(list, modelName)
		}
	}
	sort.Strings(list)
	return list
}

func groupDisplayStatus(group *channelMonitorGroupAggregate) int {
	if group.enabledCount > 0 {
		return common.ChannelStatusEnabled
	}
	if group.autoDisabled > 0 {
		return common.ChannelStatusAutoDisabled
	}
	return common.ChannelStatusManuallyDisabled
}

func groupSuccessRate(group *channelMonitorGroupAggregate) float64 {
	if group != nil && group.perf != nil && group.perf.RequestCount > 0 {
		return group.perf.SuccessRate
	}
	return 0
}

func groupSortSuccessRate(group *channelMonitorGroupAggregate) float64 {
	if group != nil && group.perf != nil && group.perf.RequestCount > 0 {
		return group.perf.SuccessRate
	}
	return 101
}

func groupAvailabilityRate(group *channelMonitorGroupAggregate) float64 {
	if group == nil || group.channelCount <= 0 {
		return 0
	}
	return float64(group.enabledCount) / float64(group.channelCount) * 100
}

func groupSuccessRateSource(group *channelMonitorGroupAggregate) string {
	if group != nil && group.perf != nil && group.perf.RequestCount > 0 {
		return "usage"
	}
	return "availability"
}

func groupUsageRequestCount(group *channelMonitorGroupAggregate) int64 {
	if group == nil || group.perf == nil {
		return 0
	}
	return group.perf.RequestCount
}

func groupUsageSuccessCount(group *channelMonitorGroupAggregate) int64 {
	if group == nil || group.perf == nil {
		return 0
	}
	return group.perf.SuccessCount
}

func groupSuccessSeries(group *channelMonitorGroupAggregate) []perfmetrics.BucketPoint {
	if group == nil || group.perf == nil || group.perf.RequestCount <= 0 {
		return nil
	}
	return group.perf.Series
}

func groupResponseTime(group *channelMonitorGroupAggregate, fallback int) int {
	if group != nil && group.perf != nil && group.perf.RequestCount > 0 && group.perf.AvgLatencyMs > 0 {
		return int(group.perf.AvgLatencyMs)
	}
	return fallback
}
