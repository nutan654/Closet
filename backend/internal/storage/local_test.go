package storage

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLocalStorage_UploadGetDeleteRoundTrip(t *testing.T) {
	dir := t.TempDir()
	s, err := NewLocalStorage(dir, "http://localhost:8080/uploads")
	if err != nil {
		t.Fatalf("NewLocalStorage: %v", err)
	}

	key := NewItemKey("user-1", "item-1", "original.jpg")
	url, err := s.Upload(context.Background(), UploadInput{
		Key:         key,
		Reader:      strings.NewReader("fake image bytes"),
		ContentType: "image/jpeg",
	})
	if err != nil {
		t.Fatalf("Upload: %v", err)
	}

	wantURL := "http://localhost:8080/uploads/users/user-1/items/item-1/original.jpg"
	if url != wantURL {
		t.Errorf("Upload url = %q, want %q", url, wantURL)
	}
	if got := s.GetURL(key); got != wantURL {
		t.Errorf("GetURL = %q, want %q", got, wantURL)
	}

	onDisk := filepath.Join(dir, "users", "user-1", "items", "item-1", "original.jpg")
	data, err := os.ReadFile(onDisk)
	if err != nil {
		t.Fatalf("expected file on disk at %s: %v", onDisk, err)
	}
	if string(data) != "fake image bytes" {
		t.Errorf("file contents = %q, want %q", data, "fake image bytes")
	}

	if err := s.Delete(context.Background(), key); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := os.Stat(onDisk); !os.IsNotExist(err) {
		t.Errorf("expected file to be gone after Delete, stat err = %v", err)
	}
}

func TestLocalStorage_DeleteMissingKeyIsNotAnError(t *testing.T) {
	s, err := NewLocalStorage(t.TempDir(), "http://localhost:8080/uploads")
	if err != nil {
		t.Fatalf("NewLocalStorage: %v", err)
	}
	// Deleting something that was never uploaded must succeed (idempotent)
	// — this is what makes it safe to call unconditionally during
	// upload-failure rollback and item deletion.
	if err := s.Delete(context.Background(), "users/nobody/items/nothing/original.jpg"); err != nil {
		t.Errorf("Delete of missing key should be a no-op, got error: %v", err)
	}
}

func TestLocalStorage_NeutralizesPathTraversal(t *testing.T) {
	dir := t.TempDir()
	s, err := NewLocalStorage(dir, "http://localhost:8080/uploads")
	if err != nil {
		t.Fatalf("NewLocalStorage: %v", err)
	}

	// resolve() cleans the key against a synthetic root before joining
	// with baseDir, so a traversal attempt like "../../etc/passwd" can
	// never escape baseDir — it's neutralized down to a harmless relative
	// path ("etc/passwd") *inside* baseDir, rather than needing to be
	// detected and rejected after the fact.
	_, err = s.Upload(context.Background(), UploadInput{
		Key:    "../../etc/passwd",
		Reader: strings.NewReader("nope"),
	})
	if err != nil {
		t.Fatalf("expected the traversal attempt to be safely neutralized, not to error: %v", err)
	}

	// The real /etc/passwd (or anywhere outside dir) must never be touched.
	escaped := filepath.Join(filepath.Dir(filepath.Dir(dir)), "etc", "passwd")
	if _, statErr := os.Stat(escaped); statErr == nil {
		t.Fatalf("path traversal succeeded: file exists at %s", escaped)
	}

	// The write should have landed inside dir instead.
	if _, statErr := os.Stat(filepath.Join(dir, "etc", "passwd")); statErr != nil {
		t.Errorf("expected the neutralized path to resolve inside the storage root, got: %v", statErr)
	}
}

func TestLocalStorage_RejectsEmptyKey(t *testing.T) {
	s, err := NewLocalStorage(t.TempDir(), "http://localhost:8080/uploads")
	if err != nil {
		t.Fatalf("NewLocalStorage: %v", err)
	}
	if _, err := s.Upload(context.Background(), UploadInput{Key: "", Reader: strings.NewReader("x")}); err == nil {
		t.Error("expected an error for an empty key")
	}
}
