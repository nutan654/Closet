// Package config centralizes every environment-driven setting the service
// needs so nothing is hardcoded in business logic. Load() is called once in
// cmd/api/main.go and the resulting Config is passed down through the
// dependency chain (main -> database/server -> repository -> service ->
// handler), which is what Phase 1 Step 3 (dependency injection) means in
// practice: nothing below main.go reaches into the environment directly.
package config

import (
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Server    ServerConfig
	Database  DatabaseConfig
	Auth      AuthConfig
	Log       LogConfig
	Storage   StorageConfig
	Image     ImageConfig
	Pattern   PatternServiceConfig
	Companion CompanionConfig
}

type ServerConfig struct {
	Port            string
	AllowedOrigins  []string
	ShutdownTimeout time.Duration
}

type DatabaseConfig struct {
	URL             string
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
	QueryTimeout    time.Duration
}

type AuthConfig struct {
	JWTSecret          string
	AccessTokenTTL     time.Duration
	RefreshTokenTTL    time.Duration
	BcryptCost         int
	RateLimitPerMinute int // failed-login / signup attempts allowed per IP per minute
}

type LogConfig struct {
	Level string // debug | info | warn | error
}

// StorageConfig drives which storage.Storage implementation main.go wires
// up (Phase 3). Nothing above the storage package itself — services,
// handlers — ever reads these values directly; they only ever see the
// Storage interface, which is the whole point of the abstraction.
type StorageConfig struct {
	Provider string // "local" | "gcs" | "s3"

	// Bucket is the GCS bucket name in production. For local storage it
	// doubles as a human-readable label only (not a filesystem path).
	Bucket string

	// BaseURL is the public URL prefix files are served from — a
	// same-origin /uploads path in dev, a bucket or CDN URL in prod.
	BaseURL string

	// LocalDir is where LocalStorage writes files on disk. Deliberately
	// outside internal/ or cmd/ (see .env.example) so uploaded content is
	// never mistaken for source code and never ends up inside a Go build.
	LocalDir string

	MaxFileSizeMB int64
	UploadTimeout time.Duration

	// GCSCredentialsFile is optional. Empty means "use Application Default
	// Credentials", which is the correct default on Cloud Run/GCE and for
	// local dev via `gcloud auth application-default login` — the brief's
	// "do not require GCP credentials for local development" requirement
	// is satisfied one level up, by simply not selecting the gcs provider
	// at all in dev (STORAGE_PROVIDER=local).
	GCSCredentialsFile string

	// The fields below are only read when Provider == "s3" — used for
	// any S3-compatible object store (Cloudflare R2, Backblaze B2, real
	// AWS S3) when GCS isn't available (e.g. deploying off GCP). See
	// storage.S3Config for what each maps to.
	S3Endpoint        string
	S3Region          string
	S3AccessKeyID     string
	S3SecretAccessKey string
	S3ForcePathStyle  bool
}

// ImageConfig bounds what image processing is allowed to do, per the
// brief's "use configurable limits" instruction — nothing here is
// hardcoded in the image processor itself.
type ImageConfig struct {
	MaxWidth        int
	MaxHeight       int
	ThumbnailWidth  int
	ThumbnailHeight int
	JPEGQuality     int
}

// PatternServiceConfig points at the Phase 5 Python microservice
// (pattern-service/) that does the actual image processing — seamless
// tiling + palette extraction. The Go backend never processes pixels
// itself for this feature; it validates the upload the same way it does
// for item photos (internal/upload) and then proxies to this URL. Kept as
// its own small internal HTTP client (internal/patternproxy) rather than
// pulled into ItemService, since patterns are not persisted items.
type PatternServiceConfig struct {
	URL     string
	Timeout time.Duration

	// APIKey, when set, is sent as X-API-Key on every request to the
	// pattern service. It's the free-tier substitute for network-level
	// isolation: Render's free plan only offers public "web" services
	// (no private "pserv" tier), so this service ends up with a public
	// URL and needs some form of gatekeeping. Leave empty for local dev
	// (docker-compose's pattern-service isn't internet-reachable at all,
	// so there's nothing to protect against there).
	APIKey string

	// UseIDToken, when true, signs every outbound request to the pattern
	// service with a Google-issued ID token (see internal/patternproxy)
	// scoped to URL as the audience. Required if the pattern service is
	// deployed with --no-allow-unauthenticated (the production default —
	// see DEPLOYMENT.md §4); leave false for local dev, where
	// docker-compose's pattern-service takes plain unauthenticated
	// requests over the internal compose network.
	UseIDToken bool
}

// CompanionConfig drives Bear's chat (internal/companion + the
// CompanionHandler), backed by Google's Gemini API. APIKey is
// deliberately allowed to be empty — unlike JWT_SECRET/DATABASE_URL this
// does NOT fail Load(), so the rest of the app keeps working with Bear's
// chat simply disabled (the handler returns a clear "not configured"
// error) until a key is added, rather than the whole backend refusing to
// start over one optional feature.
type CompanionConfig struct {
	APIKey  string
	Model   string
	Timeout time.Duration
}

// Load reads a .env file if present (local dev) and falls back to real
// process env vars either way (Docker/Cloud Run won't have a .env file —
// they inject env vars directly — so a missing .env is not an error).
func Load() (*Config, error) {
	_ = godotenv.Load()

	cfg := &Config{
		Server: ServerConfig{
			Port:            getEnv("PORT", "8080"),
			AllowedOrigins:  splitCSV(getEnv("ALLOWED_ORIGINS", "http://localhost:3000")),
			ShutdownTimeout: getDuration("SHUTDOWN_TIMEOUT", 10*time.Second),
		},
		Database: DatabaseConfig{
			URL:             getEnv("DATABASE_URL", ""),
			MaxOpenConns:    getInt("DB_MAX_OPEN_CONNS", 20),
			MaxIdleConns:    getInt("DB_MAX_IDLE_CONNS", 5),
			ConnMaxLifetime: getDuration("DB_CONN_MAX_LIFETIME", 30*time.Minute),
			QueryTimeout:    getDuration("DB_QUERY_TIMEOUT", 5*time.Second),
		},
		Auth: AuthConfig{
			JWTSecret:          getEnv("JWT_SECRET", ""),
			AccessTokenTTL:     getDuration("ACCESS_TOKEN_TTL", 15*time.Minute),
			RefreshTokenTTL:    getDuration("REFRESH_TOKEN_TTL", 30*24*time.Hour),
			BcryptCost:         getInt("BCRYPT_COST", 12),
			RateLimitPerMinute: getInt("AUTH_RATE_LIMIT_PER_MIN", 10),
		},
		Log: LogConfig{
			Level: getEnv("LOG_LEVEL", "info"),
		},
		Storage: StorageConfig{
			Provider:           getEnv("STORAGE_PROVIDER", "local"),
			Bucket:             getEnv("STORAGE_BUCKET", "uploads"),
			BaseURL:            getEnv("STORAGE_BASE_URL", "http://localhost:8080/uploads"),
			LocalDir:           getEnv("STORAGE_LOCAL_DIR", "./data/uploads"),
			MaxFileSizeMB:      int64(getInt("STORAGE_MAX_FILE_SIZE_MB", 10)),
			UploadTimeout:      getDuration("STORAGE_UPLOAD_TIMEOUT", 30*time.Second),
			GCSCredentialsFile: getEnv("GCS_CREDENTIALS_FILE", ""),
			S3Endpoint:         getEnv("STORAGE_S3_ENDPOINT", ""),
			S3Region:           getEnv("STORAGE_S3_REGION", "auto"),
			S3AccessKeyID:      getEnv("STORAGE_S3_ACCESS_KEY_ID", ""),
			S3SecretAccessKey:  getEnv("STORAGE_S3_SECRET_ACCESS_KEY", ""),
			S3ForcePathStyle:   getBool("STORAGE_S3_FORCE_PATH_STYLE", true),
		},
		Image: ImageConfig{
			MaxWidth:        getInt("MAX_IMAGE_WIDTH", 2000),
			MaxHeight:       getInt("MAX_IMAGE_HEIGHT", 2000),
			ThumbnailWidth:  getInt("THUMBNAIL_WIDTH", 400),
			ThumbnailHeight: getInt("THUMBNAIL_HEIGHT", 400),
			JPEGQuality:     getInt("IMAGE_JPEG_QUALITY", 85),
		},
		Pattern: PatternServiceConfig{
			URL:        getEnv("PATTERN_SERVICE_URL", "http://localhost:8000"),
			Timeout:    getDuration("PATTERN_SERVICE_TIMEOUT", 15*time.Second),
			UseIDToken: getBool("PATTERN_SERVICE_USE_ID_TOKEN", false),
			APIKey:     getEnv("PATTERN_SERVICE_API_KEY", ""),
		},
		Companion: CompanionConfig{
			APIKey:  getEnv("GEMINI_API_KEY", ""),
			Model:   getEnv("COMPANION_MODEL", "gemini-2.5-flash"),
			Timeout: getDuration("COMPANION_TIMEOUT", 20*time.Second),
		},
	}

	if cfg.Database.URL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.Auth.JWTSecret == "" || len(cfg.Auth.JWTSecret) < 16 {
		return nil, fmt.Errorf("JWT_SECRET is required and must be at least 16 characters")
	}
	if cfg.Storage.Provider != "local" && cfg.Storage.Provider != "gcs" && cfg.Storage.Provider != "s3" {
		return nil, fmt.Errorf("STORAGE_PROVIDER must be \"local\", \"gcs\", or \"s3\", got %q", cfg.Storage.Provider)
	}
	if cfg.Storage.Provider == "gcs" && cfg.Storage.Bucket == "" {
		return nil, fmt.Errorf("STORAGE_BUCKET is required when STORAGE_PROVIDER=gcs")
	}
	if cfg.Storage.Provider == "s3" {
		if cfg.Storage.Bucket == "" {
			return nil, fmt.Errorf("STORAGE_BUCKET is required when STORAGE_PROVIDER=s3")
		}
		if cfg.Storage.S3AccessKeyID == "" || cfg.Storage.S3SecretAccessKey == "" {
			return nil, fmt.Errorf("STORAGE_S3_ACCESS_KEY_ID and STORAGE_S3_SECRET_ACCESS_KEY are required when STORAGE_PROVIDER=s3")
		}
	}
	if cfg.Storage.MaxFileSizeMB <= 0 {
		return nil, fmt.Errorf("STORAGE_MAX_FILE_SIZE_MB must be positive")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func getInt(key string, fallback int) int {
	if v, ok := os.LookupEnv(key); ok {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func getDuration(key string, fallback time.Duration) time.Duration {
	if v, ok := os.LookupEnv(key); ok {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}

func getBool(key string, fallback bool) bool {
	if v, ok := os.LookupEnv(key); ok {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return fallback
}

func splitCSV(s string) []string {
	out := []string{}
	cur := ""
	for _, r := range s {
		if r == ',' {
			if cur != "" {
				out = append(out, cur)
			}
			cur = ""
			continue
		}
		cur += string(r)
	}
	if cur != "" {
		out = append(out, cur)
	}
	return out
}
