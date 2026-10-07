package service

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/bytedance/gopkg/util/gopool"
)

const (
	inactiveReminderTick = 24 * time.Hour
	inactiveReminderAge  = 7 * 24 * time.Hour
	inactiveReminderBatch = 100
)

var (
	inactiveReminderOnce sync.Once
	inactiveReminderRunning atomic.Bool
)

// StartInactiveUserReminderTask runs only on the master node. It is deliberately
// daily and bounded so a large user table cannot create an SMTP burst.
func StartInactiveUserReminderTask() {
	inactiveReminderOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		gopool.Go(func() {
			logger.LogInfo(context.Background(), fmt.Sprintf("inactive user reminder task started: tick=%s", inactiveReminderTick))
			runInactiveUserReminderOnce()
			ticker := time.NewTicker(inactiveReminderTick)
			defer ticker.Stop()
			for range ticker.C {
				runInactiveUserReminderOnce()
			}
		})
	})
}

func runInactiveUserReminderOnce() {
	if !inactiveReminderRunning.CompareAndSwap(false, true) {
		return
	}
	defer inactiveReminderRunning.Store(false)
	now := time.Now()
	cutoff := now.Add(-inactiveReminderAge).Unix()
	var users []model.User
	err := model.DB.Select("id", "username", "display_name", "email", "created_at", "last_login_at", "last_inactive_reminder_at").
		Where("status = ? AND email <> '' AND marketing_email_opt_out = ? AND ((last_login_at > 0 AND last_login_at < ?) OR (last_login_at = 0 AND created_at < ?))", common.UserStatusEnabled, false, cutoff, cutoff).
		Where("last_inactive_reminder_at = 0 OR last_inactive_reminder_at < last_login_at").
		Order("id asc").Limit(inactiveReminderBatch).Find(&users).Error
	if err != nil {
		logger.LogWarn(context.Background(), fmt.Sprintf("inactive user reminder query failed: %v", err))
		return
	}
	sent := 0
	for i := range users {
		if model.SendInactiveUserReminder(&users[i], now.Unix()) {
			if err := model.DB.Model(&model.User{}).Where("id = ? AND (last_inactive_reminder_at = 0 OR last_inactive_reminder_at < last_login_at)", users[i].Id).Update("last_inactive_reminder_at", now.Unix()).Error; err == nil {
				sent++
			}
		}
	}
	if sent > 0 {
		logger.LogInfo(context.Background(), fmt.Sprintf("inactive user reminders sent: %d", sent))
	}
}
