package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

var (
	userGroupChannelStatusRefreshMu sync.Mutex
	userGroupChannelStatusRefreshAt = map[string]int64{}
)

func GetGroups(c *gin.Context) {
	groupNames := make([]string, 0)
	for groupName := range ratio_setting.GetGroupRatioCopy() {
		groupNames = append(groupNames, groupName)
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    groupNames,
	})
}

func GetTopupGroups(c *gin.Context) {
	groupNames := make([]string, 0)
	for groupName := range common.GetTopupGroupRatioCopy() {
		groupNames = append(groupNames, groupName)
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    groupNames,
	})
}

func GetUserGroups(c *gin.Context) {
	imageOnly := strings.EqualFold(strings.TrimSpace(c.Query("image")), "true")
	usableGroups := make(map[string]map[string]interface{})
	userGroup := ""
	userId := c.GetInt("id")
	userGroup, _ = model.GetUserGroup(userId, false)
	userUsableGroups := service.GetUserUsableGroups(userGroup)
	groupRatios := ratio_setting.GetGroupRatioCopy()
	topupRatios := common.GetTopupGroupRatioCopy()
	for groupName := range groupRatios {
		// UserUsableGroups contains the groups that the user can use
		if desc, ok := userUsableGroups[groupName]; ok {
			usableGroups[groupName] = map[string]interface{}{
				"ratio": service.GetUserGroupRatio(userGroup, groupName),
				"desc":  desc,
			}
		}
	}
	for groupName, desc := range userUsableGroups {
		groupName = strings.TrimSpace(groupName)
		if groupName == "" || groupName == "auto" {
			continue
		}
		if _, ok := usableGroups[groupName]; ok {
			continue
		}
		groupRatio, hasGroupRatio := groupRatios[groupName]
		topupRatio, hasTopupRatio := topupRatios[groupName]
		if !hasGroupRatio && !hasTopupRatio && groupName != strings.TrimSpace(userGroup) {
			continue
		}
		if !hasGroupRatio && !model.IsUnlimitedSubscriptionGroup(groupName) {
			continue
		}
		ratio := groupRatio
		if !hasGroupRatio {
			ratio = 1
			if hasTopupRatio {
				ratio = topupRatio
			}
		}
		usableGroups[groupName] = map[string]interface{}{
			"ratio": ratio,
			"desc":  desc,
		}
	}
	// Auto is a public virtual token group. Its concrete routing chain is still
	// filtered against each user's selectable groups before channel selection.
	description := setting.GetUsableGroupDescription("auto")
	if description == "auto" {
		description = "自动重试"
	}
	usableGroups["auto"] = map[string]interface{}{
		"ratio": "自动",
		"desc":  description,
	}
	if imageOnly {
		capabilities := getImageGroupCapabilities()
		for groupName := range usableGroups {
			capability, ok := capabilities[groupName]
			if !ok {
				delete(usableGroups, groupName)
				continue
			}
			usableGroups[groupName]["supports_resolution_pricing"] = capability.SupportsResolutionPricing
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    usableGroups,
	})
}

type imageGroupCapability struct {
	SupportsResolutionPricing bool
}

type imageAbilityWithChannel struct {
	model.Ability
	ChannelBaseURL string `gorm:"column:channel_base_url"`
}

func getImageGroupCapabilities() map[string]imageGroupCapability {
	var rows []imageAbilityWithChannel
	model.DB.Table("abilities").
		Select("abilities.*, channels.base_url AS channel_base_url").
		Joins("JOIN channels ON channels.id = abilities.channel_id").
		Where("abilities.enabled = ? AND channels.status = ?", true, common.ChannelStatusEnabled).
		Scan(&rows)

	capabilities := make(map[string]imageGroupCapability)
	for _, row := range rows {
		modelName := strings.ToLower(strings.TrimSpace(row.Model))
		if !isImageGenerationProbeModel(modelName) && !strings.Contains(modelName, "image") {
			continue
		}
		capability := capabilities[row.Group]
		if (modelName == "gpt-image-2" || modelName == "gpt-image-2-ext") && common.IsAPIMartAPIBaseURL(row.ChannelBaseURL) {
			capability.SupportsResolutionPricing = true
		}
		capabilities[row.Group] = capability
	}
	return capabilities
}

type groupChannelStatusSummary struct {
	Total             int   `json:"total"`
	Enabled           int   `json:"enabled"`
	Reachable         int   `json:"reachable"`
	Tested            int   `json:"tested"`
	AutoDisabled      int   `json:"auto_disabled"`
	ManuallyDisabled  int   `json:"manually_disabled"`
	Unknown           int   `json:"unknown"`
	BestResponseTime  int   `json:"best_response_time"`
	LastTestTime      int64 `json:"last_test_time"`
	HasCurrentChannel bool  `json:"has_current_channel"`
}

type groupChannelProbeResult struct {
	Reachable    bool
	ResponseTime int
	TestTime     int64
}

func GetUserGroupChannelStatus(c *gin.Context) {
	userGroup := ""
	userId := c.GetInt("id")
	userGroup, _ = model.GetUserGroup(userId, false)
	userUsableGroups := service.GetUserUsableGroups(userGroup)
	refresh := strings.EqualFold(c.Query("refresh"), "true") || c.Query("refresh") == "1"
	requestedGroup := strings.TrimSpace(c.Query("group"))
	if requestedGroup != "" {
		if _, ok := userUsableGroups[requestedGroup]; !ok && requestedGroup != "auto" {
			common.ApiError(c, errors.New("group is not available"))
			return
		}
	}

	groupStatus := make(map[string]*groupChannelStatusSummary)
	for groupName := range userUsableGroups {
		if groupName == "auto" {
			continue
		}
		groupStatus[groupName] = &groupChannelStatusSummary{}
	}

	var channels []model.Channel
	query := model.DB.Model(&model.Channel{})
	if !refresh {
		query = query.Omit("key")
	}
	if err := query.Find(&channels).Error; err != nil {
		common.ApiError(c, err)
		return
	}

	probeResults := map[int]groupChannelProbeResult{}
	refreshed := false
	if refresh && shouldRefreshUserGroupChannelStatus(userId, requestedGroup) {
		testUserID, err := resolveChannelTestUserID(c)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		probeResults = testUserGroupChannels(channels, groupStatus, userGroup, testUserID, requestedGroup)
		refreshed = true
	}

	for _, channel := range channels {
		for _, groupName := range channel.GetGroups() {
			summary, ok := groupStatus[groupName]
			if !ok {
				continue
			}

			summary.Total++
			testTime := channel.TestTime
			responseTime := channel.ResponseTime
			if probe, ok := probeResults[channel.Id]; ok {
				summary.Tested++
				if probe.Reachable {
					summary.Reachable++
				}
				testTime = probe.TestTime
				responseTime = probe.ResponseTime
			}
			if testTime > 0 {
				summary.HasCurrentChannel = true
				if testTime > summary.LastTestTime {
					summary.LastTestTime = testTime
				}
			}
			if responseTime > 0 && (summary.BestResponseTime == 0 || responseTime < summary.BestResponseTime) {
				summary.BestResponseTime = responseTime
			}

			switch channel.Status {
			case common.ChannelStatusEnabled:
				summary.Enabled++
			case common.ChannelStatusAutoDisabled:
				summary.AutoDisabled++
			case common.ChannelStatusManuallyDisabled:
				summary.ManuallyDisabled++
			default:
				summary.Unknown++
			}
		}
	}

	autoSummary := &groupChannelStatusSummary{}
	seen := map[int]bool{}
	for _, groupName := range service.GetUserAutoGroup(userGroup) {
		for _, channel := range channels {
			if seen[channel.Id] {
				continue
			}
			if !common.StringsContains(channel.GetGroups(), groupName) {
				continue
			}
			seen[channel.Id] = true
			autoSummary.Total++
			testTime := channel.TestTime
			responseTime := channel.ResponseTime
			if probe, ok := probeResults[channel.Id]; ok {
				autoSummary.Tested++
				if probe.Reachable {
					autoSummary.Reachable++
				}
				testTime = probe.TestTime
				responseTime = probe.ResponseTime
			}
			if testTime > 0 {
				autoSummary.HasCurrentChannel = true
				if testTime > autoSummary.LastTestTime {
					autoSummary.LastTestTime = testTime
				}
			}
			if responseTime > 0 && (autoSummary.BestResponseTime == 0 || responseTime < autoSummary.BestResponseTime) {
				autoSummary.BestResponseTime = responseTime
			}
			switch channel.Status {
			case common.ChannelStatusEnabled:
				autoSummary.Enabled++
			case common.ChannelStatusAutoDisabled:
				autoSummary.AutoDisabled++
			case common.ChannelStatusManuallyDisabled:
				autoSummary.ManuallyDisabled++
			default:
				autoSummary.Unknown++
			}
		}
	}
	groupStatus["auto"] = autoSummary

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"message":    "",
		"refreshed":  refreshed,
		"updated_at": time.Now().Unix(),
		"data":       groupStatus,
	})
}

func shouldRefreshUserGroupChannelStatus(userId int, group string) bool {
	const minRefreshInterval = int64(5 * 60)
	now := time.Now().Unix()
	refreshKey := strconv.Itoa(userId) + ":" + group
	userGroupChannelStatusRefreshMu.Lock()
	defer userGroupChannelStatusRefreshMu.Unlock()
	if lastRefreshAt, ok := userGroupChannelStatusRefreshAt[refreshKey]; ok && now-lastRefreshAt < minRefreshInterval {
		return false
	}
	userGroupChannelStatusRefreshAt[refreshKey] = now
	return true
}

func testUserGroupChannels(channels []model.Channel, groupStatus map[string]*groupChannelStatusSummary, userGroup string, testUserID int, requestedGroup string) map[int]groupChannelProbeResult {
	results := make(map[int]groupChannelProbeResult)
	autoGroups := map[string]bool{}
	for _, groupName := range service.GetUserAutoGroup(userGroup) {
		autoGroups[groupName] = true
	}

	for i := range channels {
		channel := &channels[i]
		if channel.Status == common.ChannelStatusManuallyDisabled {
			continue
		}

		shouldTest := false
		for _, groupName := range channel.GetGroups() {
			if requestedGroup != "" && requestedGroup != "auto" && groupName != requestedGroup {
				continue
			}
			if requestedGroup == "auto" && !autoGroups[groupName] {
				continue
			}
			if _, ok := groupStatus[groupName]; ok {
				shouldTest = true
				break
			}
			if autoGroups[groupName] {
				shouldTest = true
				break
			}
		}
		if !shouldTest {
			continue
		}
		if shouldSkipGroupSelectorChannelProbe(channel) {
			continue
		}

		tik := time.Now()
		result := testChannel(channel, testUserID, "", "", normalizeChannelTestStream(channel, false))
		milliseconds := int(time.Since(tik).Milliseconds())
		if result.localErr == nil {
			channel.UpdateResponseTime(int64(milliseconds))
			channel.TestTime = common.GetTimestamp()
			channel.ResponseTime = milliseconds
		}
		results[channel.Id] = groupChannelProbeResult{
			Reachable:    result.localErr == nil && result.newAPIError == nil,
			ResponseTime: channel.ResponseTime,
			TestTime:     channel.TestTime,
		}
		time.Sleep(common.RequestInterval)
	}

	return results
}

func shouldSkipGroupSelectorChannelProbe(channel *model.Channel) bool {
	switch channel.Type {
	case constant.ChannelTypeMidjourney,
		constant.ChannelTypeMidjourneyPlus,
		constant.ChannelTypeKling,
		constant.ChannelTypeJimeng,
		constant.ChannelTypeVidu,
		constant.ChannelTypeDoubaoVideo,
		constant.ChannelTypeCMCCSeedance,
		constant.ChannelTypeSora,
		constant.ChannelTypeReplicate:
		return true
	}

	if channel.TestModel != nil && isImageGenerationProbeModel(*channel.TestModel) {
		return true
	}
	for _, modelName := range channel.GetModels() {
		if isImageGenerationProbeModel(modelName) {
			return true
		}
	}
	return false
}

func isImageGenerationProbeModel(modelName string) bool {
	name := strings.ToLower(strings.TrimSpace(modelName))
	if name == "" {
		return false
	}
	imageModelMarkers := []string{
		"gpt-image",
		"chatgpt-image",
		"dall-e",
		"imagen",
		"seedream",
		"flux",
		"stable-diffusion",
		"stabilityai/",
		"black-forest-labs/",
		"midjourney",
	}
	for _, marker := range imageModelMarkers {
		if strings.Contains(name, marker) {
			return true
		}
	}
	return false
}
