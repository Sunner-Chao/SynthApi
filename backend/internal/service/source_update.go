package service

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const maxSourceUpdateStatusSize = 1024 * 1024

type UpdateServiceOptions struct {
	Strategy    string
	RequestFile string
	StatusFile  string
	Now         func() time.Time
}

type UpdateExecution struct {
	UpdateStarted bool   `json:"update_started"`
	NeedRestart   bool   `json:"need_restart"`
	OperationID   string `json:"operation_id"`
	TargetVersion string `json:"target_version"`
	Strategy      string `json:"strategy"`
}

type SourceUpdateRequest struct {
	SchemaVersion      int    `json:"schema_version"`
	OperationID        string `json:"operation_id"`
	CurrentVersion     string `json:"current_version"`
	TargetVersion      string `json:"target_version"`
	OfficialRepository string `json:"official_repository"`
	RequestedAt        string `json:"requested_at"`
}

type SourceUpdateStatus struct {
	SchemaVersion  int    `json:"schema_version"`
	State          string `json:"state"`
	Phase          string `json:"phase,omitempty"`
	Message        string `json:"message,omitempty"`
	OperationID    string `json:"operation_id,omitempty"`
	CurrentVersion string `json:"current_version,omitempty"`
	TargetVersion  string `json:"target_version,omitempty"`
	RequestedAt    string `json:"requested_at,omitempty"`
	StartedAt      string `json:"started_at,omitempty"`
	FinishedAt     string `json:"finished_at,omitempty"`
	BackupStatus   string `json:"backup_status,omitempty"`
}

func UpdateServiceOptionsFromEnv() UpdateServiceOptions {
	return UpdateServiceOptions{
		Strategy:    os.Getenv("UPDATE_STRATEGY"),
		RequestFile: os.Getenv("UPDATE_REQUEST_FILE"),
		StatusFile:  os.Getenv("UPDATE_STATUS_FILE"),
	}
}

func normalizeUpdateStrategy(value string) string {
	if strings.EqualFold(strings.TrimSpace(value), UpdateStrategySourceSync) {
		return UpdateStrategySourceSync
	}
	return UpdateStrategyBinary
}

func (s *UpdateService) decorateUpdateInfo(info *UpdateInfo) *UpdateInfo {
	if info == nil {
		return nil
	}
	info.UpdateStrategy = s.strategy
	info.RollbackSupported = s.strategy != UpdateStrategySourceSync
	if s.strategy != UpdateStrategySourceSync {
		info.UpdateStatus = nil
		return info
	}

	status, err := s.readSourceUpdateStatus()
	if err != nil {
		if info.Warning != "" {
			info.Warning += "; "
		}
		info.Warning += "source update status unavailable: " + err.Error()
		return info
	}
	info.UpdateStatus = status
	return info
}

func (s *UpdateService) queueSourceUpdate(operationID, targetVersion string) (*UpdateExecution, error) {
	status, err := s.readSourceUpdateStatus()
	if err != nil {
		return nil, fmt.Errorf("read source update status: %w", err)
	}
	if status != nil && (status.State == "queued" || status.State == "running") {
		return nil, ErrSourceUpdateInProgress
	}

	operationID = strings.TrimSpace(operationID)
	if operationID == "" {
		operationID = fmt.Sprintf("source-update-%d", s.now().UnixNano())
	}
	now := s.now().UTC().Format(time.RFC3339)
	request := SourceUpdateRequest{
		SchemaVersion:      1,
		OperationID:        operationID,
		CurrentVersion:     s.currentVersion,
		TargetVersion:      strings.TrimPrefix(strings.TrimSpace(targetVersion), "v"),
		OfficialRepository: githubRepo,
		RequestedAt:        now,
	}
	status := SourceUpdateStatus{
		SchemaVersion:  1,
		State:          "queued",
		Phase:          "queued",
		Message:        "Source update request accepted",
		OperationID:    operationID,
		CurrentVersion: s.currentVersion,
		TargetVersion:  request.TargetVersion,
		RequestedAt:    now,
		BackupStatus:   "pending",
	}

	if err := writeUpdateJSONAtomically(s.statusFile, status); err != nil {
		return nil, fmt.Errorf("write source update status: %w", err)
	}
	if err := writeUpdateJSONAtomically(s.requestFile, request); err != nil {
		status.State = "failed"
		status.Phase = "queue"
		status.Message = "Failed to persist source update request"
		status.FinishedAt = s.now().UTC().Format(time.RFC3339)
		_ = writeUpdateJSONAtomically(s.statusFile, status)
		return nil, fmt.Errorf("write source update request: %w", err)
	}

	return &UpdateExecution{
		UpdateStarted: true,
		NeedRestart:   false,
		OperationID:   operationID,
		TargetVersion: request.TargetVersion,
		Strategy:      UpdateStrategySourceSync,
	}, nil
}

func (s *UpdateService) readSourceUpdateStatus() (*SourceUpdateStatus, error) {
	if strings.TrimSpace(s.statusFile) == "" {
		return nil, nil
	}
	f, err := os.Open(s.statusFile)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	defer func() { _ = f.Close() }()

	var status SourceUpdateStatus
	decoder := json.NewDecoder(io.LimitReader(f, maxSourceUpdateStatusSize))
	if err := decoder.Decode(&status); err != nil {
		return nil, err
	}
	return &status, nil
}

func writeUpdateJSONAtomically(path string, value any) (err error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return fmt.Errorf("path is empty")
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0750); err != nil {
		return err
	}

	temp, err := os.CreateTemp(dir, "."+filepath.Base(path)+"-*.tmp")
	if err != nil {
		return err
	}
	tempName := temp.Name()
	defer func() {
		_ = temp.Close()
		if err != nil {
			_ = os.Remove(tempName)
		}
	}()

	if err = temp.Chmod(0640); err != nil {
		return err
	}
	encoder := json.NewEncoder(temp)
	encoder.SetIndent("", "  ")
	if err = encoder.Encode(value); err != nil {
		return err
	}
	if err = temp.Sync(); err != nil {
		return err
	}
	if err = temp.Close(); err != nil {
		return err
	}
	if err = os.Rename(tempName, path); err != nil {
		return err
	}
	return nil
}
