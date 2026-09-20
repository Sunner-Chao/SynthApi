package service

import "github.com/gin-gonic/gin"

func channelSelectionExcludedIDs(c *gin.Context) map[int]struct{} {
	if c == nil {
		return nil
	}
	excluded := cloneChannelIDSet(ImportedAccountExcludedChannelIDs(c))
	for channelID := range requestChannelSelectionExcludedIDs(c) {
		if excluded == nil {
			excluded = make(map[int]struct{})
		}
		excluded[channelID] = struct{}{}
	}
	return excluded
}

func cloneChannelIDSet(source map[int]struct{}) map[int]struct{} {
	if len(source) == 0 {
		return nil
	}
	cloned := make(map[int]struct{}, len(source))
	for channelID := range source {
		cloned[channelID] = struct{}{}
	}
	return cloned
}
