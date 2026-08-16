package storage

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// S3Storage implements Storage on top of any S3-compatible object store
// (STORAGE_PROVIDER=s3). It exists so the app isn't tied to GCP for image
// storage — the same code path works against Cloudflare R2, Backblaze B2,
// or real AWS S3, since all three speak the S3 API. Which one you point it
// at is entirely a config.StorageConfig/env-var decision; nothing above
// the Storage interface changes (see storage.go's doc comment).
type S3Storage struct {
	client  *s3.Client
	bucket  string
	baseURL string
}

// S3Config mirrors GCSConfig's shape deliberately, swapping "which GCP
// credential file" for "which S3-compatible endpoint and keys" — the two
// providers are configured differently because that's what their auth
// models actually require, not because the abstraction leaks.
type S3Config struct {
	Bucket   string
	Region   string // required by the SDK even when the provider (R2/B2) doesn't really have regions; "auto" works for R2
	Endpoint string // e.g. https://<account_id>.r2.cloudflarestorage.com — empty means "real AWS S3"
	// BaseURL is the public URL prefix files are served from. For R2/B2
	// this should be the bucket's public bucket URL or a custom domain,
	// NOT the same as Endpoint (Endpoint is the S3 API endpoint, which is
	// not directly browsable). Required whenever Endpoint is set.
	BaseURL         string
	AccessKeyID     string
	SecretAccessKey string
	// ForcePathStyle is required by most non-AWS S3-compatible providers
	// (R2, B2, MinIO) — virtual-hosted-style bucket addressing assumes
	// AWS's own DNS wildcarding, which they don't provide.
	ForcePathStyle bool
}

// NewS3Storage dials nothing at construction time (the SDK client is
// lazy) but validates config up front so a typo in STORAGE_BUCKET or a
// missing key fails at boot, not on the first upload.
func NewS3Storage(ctx context.Context, cfg S3Config) (*S3Storage, error) {
	if cfg.Bucket == "" {
		return nil, errors.New("storage: S3 bucket is required")
	}
	if cfg.Endpoint != "" && cfg.BaseURL == "" {
		return nil, errors.New("storage: STORAGE_BASE_URL is required when STORAGE_S3_ENDPOINT is set (the API endpoint isn't a public browsing URL)")
	}
	if cfg.AccessKeyID == "" || cfg.SecretAccessKey == "" {
		return nil, errors.New("storage: S3 access key and secret are required")
	}

	region := cfg.Region
	if region == "" {
		region = "auto"
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			cfg.AccessKeyID, cfg.SecretAccessKey, "",
		)),
	)
	if err != nil {
		return nil, fmt.Errorf("storage: load S3 config: %w", err)
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.UsePathStyle = cfg.ForcePathStyle
		if cfg.Endpoint != "" {
			o.BaseEndpoint = aws.String(cfg.Endpoint)
		}
	})

	baseURL := strings.TrimRight(cfg.BaseURL, "/")
	if baseURL == "" {
		// Real AWS S3, virtual-hosted style.
		baseURL = fmt.Sprintf("https://%s.s3.%s.amazonaws.com", cfg.Bucket, region)
	}

	return &S3Storage{client: client, bucket: cfg.Bucket, baseURL: baseURL}, nil
}

func (s *S3Storage) Upload(ctx context.Context, in UploadInput) (string, error) {
	putInput := &s3.PutObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(in.Key),
		Body:   in.Reader,
		// Wardrobe image assets are immutable once uploaded (a re-upload
		// gets a brand-new key via a fresh item/asset ID), matching the
		// same aggressive-caching rationale as GCSStorage.
		CacheControl: aws.String("public, max-age=31536000, immutable"),
	}
	if in.ContentType != "" {
		putInput.ContentType = aws.String(in.ContentType)
	}
	if in.Size >= 0 {
		putInput.ContentLength = aws.Int64(in.Size)
	}

	if _, err := s.client.PutObject(ctx, putInput); err != nil {
		return "", fmt.Errorf("storage: s3 put %q: %w", in.Key, err)
	}
	return s.GetURL(in.Key), nil
}

func (s *S3Storage) Delete(ctx context.Context, key string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	// DeleteObject on S3-compatible APIs returns success (not a 404) for
	// a missing key already, so unlike GCSStorage there's no
	// "not exist" sentinel to special-case here — any error is real.
	if err != nil {
		return fmt.Errorf("storage: s3 delete %q: %w", key, err)
	}
	return nil
}

func (s *S3Storage) GetURL(key string) string {
	return s.baseURL + "/" + strings.TrimPrefix(key, "/")
}

// Close is a no-op — the SDK v2 client holds no resources that need
// releasing — but matches GCSStorage's shape so main.go can treat both
// providers the same way during graceful shutdown if it ever wants to.
func (s *S3Storage) Close() error {
	return nil
}

var _ Storage = (*S3Storage)(nil)
