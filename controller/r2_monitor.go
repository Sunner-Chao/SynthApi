package controller

import (
	"github.com/QuantumNous/new-api/common"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

func GetR2Monitor(c *gin.Context) {
	getR2MonitorSnapshot(c, "/var/lib/synthapi-monitor/snapshot.json")
}

func getR2MonitorSnapshot(c *gin.Context, path string) {
	c.Header("Cache-Control", "no-store")
	b, err := os.ReadFile(path)
	var data map[string]interface{}
	if err != nil || common.Unmarshal(b, &data) != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": "R2 monitor snapshot unavailable"})
		return
	}
	common.ApiSuccess(c, data)
}
