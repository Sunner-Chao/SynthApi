package common

import (
	"bytes"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
)

func setBodyStorageTestConfig(t *testing.T, thresholdMB int, maxSizeMB int) string {
	t.Helper()
	oldConfig := GetDiskCacheConfig()
	cachePath := t.TempDir()
	SetDiskCacheConfig(DiskCacheConfig{
		Enabled:     true,
		ThresholdMB: thresholdMB,
		MaxSizeMB:   maxSizeMB,
		Path:        cachePath,
	})
	t.Cleanup(func() {
		SetDiskCacheConfig(oldConfig)
	})
	return cachePath
}

func TestCreateBodyStorageFromReaderUnknownLengthSmallBodyStaysInMemory(t *testing.T) {
	setBodyStorageTestConfig(t, 1, 64)
	payload := bytes.Repeat([]byte("a"), 256<<10)

	storage, err := CreateBodyStorageFromReader(bytes.NewReader(payload), -1, 4<<20)
	if err != nil {
		t.Fatalf("CreateBodyStorageFromReader() error = %v", err)
	}
	defer storage.Close()

	if storage.IsDisk() {
		t.Fatal("small unknown-length body unexpectedly used disk storage")
	}
	got, err := storage.Bytes()
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, payload) {
		t.Fatal("stored body differs from source")
	}
}

func TestCreateBodyStorageFromReaderUnknownLengthSpillsToDisk(t *testing.T) {
	setBodyStorageTestConfig(t, 1, 64)
	payload := bytes.Repeat([]byte("b"), 2<<20)

	storage, err := CreateBodyStorageFromReader(bytes.NewReader(payload), -1, 4<<20)
	if err != nil {
		t.Fatalf("CreateBodyStorageFromReader() error = %v", err)
	}
	defer storage.Close()

	if !storage.IsDisk() {
		t.Fatal("large unknown-length body did not spill to disk")
	}
	got, err := storage.Bytes()
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, payload) {
		t.Fatal("stored body differs from source")
	}
}

func TestCreateBodyStorageFromReaderUnknownLengthHonorsMaximum(t *testing.T) {
	cachePath := setBodyStorageTestConfig(t, 1, 64)
	payload := bytes.Repeat([]byte("c"), (1<<20)+1)

	storage, err := CreateBodyStorageFromReader(bytes.NewReader(payload), -1, 1<<20)
	if storage != nil {
		_ = storage.Close()
		t.Fatal("oversized body unexpectedly returned storage")
	}
	if !errors.Is(err, ErrRequestBodyTooLarge) {
		t.Fatalf("error = %v, want ErrRequestBodyTooLarge", err)
	}
	assertNoBodyStorageFiles(t, cachePath)
}

func TestCreateBodyStorageFromReaderUnknownLengthFallsBackWhenDiskFull(t *testing.T) {
	setBodyStorageTestConfig(t, 1, 1)
	payload := bytes.Repeat([]byte("d"), 2<<20)

	storage, err := CreateBodyStorageFromReader(bytes.NewReader(payload), -1, 4<<20)
	if err != nil {
		t.Fatalf("CreateBodyStorageFromReader() error = %v", err)
	}
	defer storage.Close()
	if storage.IsDisk() {
		t.Fatal("body used disk despite insufficient configured capacity")
	}
}

type failingBodyReader struct{}

func (failingBodyReader) Read([]byte) (int, error) {
	return 0, errors.New("injected reader failure")
}

func TestCreateBodyStorageFromReaderRemovesPartialSpillOnReadError(t *testing.T) {
	cachePath := setBodyStorageTestConfig(t, 1, 64)
	reader := io.MultiReader(
		bytes.NewReader(bytes.Repeat([]byte("e"), 2<<20)),
		failingBodyReader{},
	)

	storage, err := CreateBodyStorageFromReader(reader, -1, 4<<20)
	if storage != nil {
		_ = storage.Close()
		t.Fatal("failed reader unexpectedly returned storage")
	}
	if err == nil {
		t.Fatal("failed reader unexpectedly returned nil error")
	}
	assertNoBodyStorageFiles(t, cachePath)
}

func assertNoBodyStorageFiles(t *testing.T, cachePath string) {
	t.Helper()
	entries, err := os.ReadDir(filepath.Join(cachePath, diskCacheDir))
	if err != nil {
		if os.IsNotExist(err) {
			return
		}
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("temporary body files were not cleaned up: %d", len(entries))
	}
}
