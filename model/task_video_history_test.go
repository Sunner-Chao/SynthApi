package model

import (
	"fmt"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/require"
)

func TestVideoHistoryIncludesReferenceAndRemix(t *testing.T) {
	truncateTables(t)
	actions := []string{"videoGenerate", "generate", "textGenerate", "firstTailGenerate", "referenceGenerate", "remixGenerate"}
	for i, action := range actions {
		insertTask(t, &Task{TaskID: fmt.Sprintf("history_%d", i), UserId: 41, Action: action, Status: TaskStatusSuccess, SubmitTime: time.Now().Unix()})
	}
	insertTask(t, &Task{TaskID: "other_user", UserId: 42, Action: "textGenerate", SubmitTime: time.Now().Unix()})
	insertTask(t, &Task{TaskID: "image", UserId: 41, Action: "imageGenerate", SubmitTime: time.Now().Unix()})
	insertTask(t, &Task{TaskID: "old", UserId: 41, Action: "textGenerate", SubmitTime: time.Now().Add(-8 * 24 * time.Hour).Unix()})
	query := SyncTaskQueryParams{Action: constant.TaskActionVideoGenerate}
	require.Len(t, TaskGetAllUserTask(41, 0, 50, query), len(actions))
	require.Equal(t, int64(len(actions)), TaskCountAllUserTask(41, query))
	query.UserID = "41"
	query.StartTimestamp = time.Now().Add(-7 * 24 * time.Hour).Unix()
	require.Len(t, TaskGetAllTasks(0, 50, query), len(actions))
	require.Equal(t, int64(len(actions)), TaskCountAllTasks(query))
}
