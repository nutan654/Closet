package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

// LocalStorage implements Storage on the local filesystem, for
// development (STORAGE_PROVIDER=local). Every configuration value it
// needs (base directory, public base URL) is passed in by the caller —
// see config.StorageConfig — never read from the environment directly.
type LocalStorage struct {
	baseDir string // absolute directory everything is written under
	baseURL string // public URL prefix, e.g. http://localhost:8080/uploads
}

// NewLocalStorage creates the base directory (STORAGE_LOCAL_DIR) if it
// doesn't exist yet and returns a ready-to-use LocalStorage. baseDir is
// deliberately expected to live outside the Go source tree (the default,
// ./data/uploads, does) so uploaded content is never mistaken for part of
// the build and Dockerfile COPY steps don't need to special-case it.
func NewLocalStorage(baseDir, baseURL string) (*LocalStorage, error) {
	abs, err := filepath.Abs(baseDir)
	if err != nil {
		return nil, fmt.Errorf("storage: resolve local base dir: %w", err)
	}
	if err := os.MkdirAll(abs, 0o755); err != nil {
		return nil, fmt.Errorf("storage: create local base dir: %w", err)
	}
	return &LocalStorage{baseDir: abs, baseURL: strings.TrimRight(baseURL, "/")}, nil
}

// resolve turns a storage key into an absolute filesystem path and
// verifies the result is still inside baseDir. Keys in this codebase are
// always generated server-side (NewItemKey), so this is defense in depth
// rather than the primary guard — but it means a bug elsewhere that ever
// passed a raw, unsanitized key still can't write or read outside the
// upload directory.
func (l *LocalStorage) resolve(key string) (string, error) {
	if key == "" {
		return "", errors.New("storage: empty key")
	}
	// Cleaning against a synthetic leading slash collapses any "../"
	// segments relative to a virtual root, so the joined path can never
	// climb above baseDir even if a key somehow contained them.
	clean := strings.TrimPrefix(filepath.Clean("/"+key), "/")
	full := filepath.Join(l.baseDir, clean)

	if full != l.baseDir && !strings.HasPrefix(full, l.baseDir+string(os.PathSeparator)) {
		return "", fmt.Errorf("storage: key %q escapes the storage root", key)
	}
	return full, nil
}

func (l *LocalStorage) Upload(ctx context.Context, in UploadInput) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}

	full, err := l.resolve(in.Key)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return "", fmt.Errorf("storage: create object dir: %w", err)
	}

	// Write to a temp file in the same directory and rename into place so
	// a concurrent reader (or a request that times out mid-write) never
	// observes a partially-written file at the final path.
	tmp := full + ".tmp-" + uuid.NewString()
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC|os.O_EXCL, 0o644)
	if err != nil {
		return "", fmt.Errorf("storage: create temp file: %w", err)
	}

	if _, err := io.Copy(f, in.Reader); err != nil {
		f.Close()
		os.Remove(tmp)
		return "", fmt.Errorf("storage: write file: %w", err)
	}
	if err := f.Close(); err != nil {
		os.Remove(tmp)
		return "", fmt.Errorf("storage: close file: %w", err)
	}
	if err := os.Rename(tmp, full); err != nil {
		os.Remove(tmp)
		return "", fmt.Errorf("storage: finalize file: %w", err)
	}

	return l.GetURL(in.Key), nil
}

func (l *LocalStorage) Delete(ctx context.Context, key string) error {
	full, err := l.resolve(key)
	if err != nil {
		return err
	}
	if err := os.Remove(full); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("storage: delete file: %w", err)
	}
	return nil
}

func (l *LocalStorage) GetURL(key string) string {
	return l.baseURL + "/" + strings.TrimPrefix(key, "/")
}
