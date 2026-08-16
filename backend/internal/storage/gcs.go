package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"

	gcs "cloud.google.com/go/storage"
	"google.golang.org/api/option"
)

// GCSStorage implements Storage on top of Google Cloud Storage, for
// production (STORAGE_PROVIDER=gcs). It's selected and constructed once in
// main.go — everything else in the app keeps talking to the Storage
// interface exactly as it did with LocalStorage, per the brief's "the rest
// of the application must not change" requirement.
type GCSStorage struct {
	client  *gcs.Client
	bucket  string
	baseURL string
}

// GCSConfig is intentionally small: production deployment (Cloud Run/GKE)
// supplies credentials via Application Default Credentials, so the only
// things this abstraction needs from config.StorageConfig are the bucket
// name and an optional public URL override (e.g. a CDN domain in front of
// the bucket) plus an optional path to a service-account key file for
// environments without ADC (e.g. a developer's laptop pointed at a real
// bucket without running through `gcloud auth application-default login`).
type GCSConfig struct {
	Bucket          string
	BaseURL         string
	CredentialsFile string
}

// NewGCSStorage dials GCS once at startup. It is never called when
// STORAGE_PROVIDER=local, which is what lets local development run with
// zero GCP credentials configured at all — see cmd/api/main.go.
func NewGCSStorage(ctx context.Context, cfg GCSConfig) (*GCSStorage, error) {
	if cfg.Bucket == "" {
		return nil, errors.New("storage: GCS bucket is required")
	}

	var opts []option.ClientOption
	if cfg.CredentialsFile != "" {
		opts = append(opts, option.WithCredentialsFile(cfg.CredentialsFile))
	}

	client, err := gcs.NewClient(ctx, opts...)
	if err != nil {
		return nil, fmt.Errorf("storage: create GCS client: %w", err)
	}

	baseURL := strings.TrimRight(cfg.BaseURL, "/")
	if baseURL == "" {
		baseURL = "https://storage.googleapis.com/" + cfg.Bucket
	}

	return &GCSStorage{client: client, bucket: cfg.Bucket, baseURL: baseURL}, nil
}

func (g *GCSStorage) Upload(ctx context.Context, in UploadInput) (string, error) {
	obj := g.client.Bucket(g.bucket).Object(in.Key)
	w := obj.NewWriter(ctx)
	if in.ContentType != "" {
		w.ContentType = in.ContentType
	}
	// Wardrobe image assets are immutable once uploaded (a re-upload gets
	// a brand-new key via a fresh item/asset ID), so they're safe to cache
	// aggressively at the edge.
	w.CacheControl = "public, max-age=31536000, immutable"

	if _, err := io.Copy(w, in.Reader); err != nil {
		_ = w.Close()
		return "", fmt.Errorf("storage: gcs write %q: %w", in.Key, err)
	}
	if err := w.Close(); err != nil {
		return "", fmt.Errorf("storage: gcs finalize %q: %w", in.Key, err)
	}
	return g.GetURL(in.Key), nil
}

func (g *GCSStorage) Delete(ctx context.Context, key string) error {
	err := g.client.Bucket(g.bucket).Object(key).Delete(ctx)
	if err != nil && !errors.Is(err, gcs.ErrObjectNotExist) {
		return fmt.Errorf("storage: gcs delete %q: %w", key, err)
	}
	return nil
}

func (g *GCSStorage) GetURL(key string) string {
	return g.baseURL + "/" + strings.TrimPrefix(key, "/")
}

// Close releases the underlying GCS client's connections. main.go calls
// this during graceful shutdown if the configured provider is GCS.
func (g *GCSStorage) Close() error {
	return g.client.Close()
}
