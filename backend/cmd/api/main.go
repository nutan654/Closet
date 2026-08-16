// Command api is the entrypoint. Its only jobs are: load config, build the
// dependency chain in order (database -> repository -> service -> handler
// -> routes), and run the server with a graceful shutdown. No business
// logic lives here — that's the whole point of Phase 1's layering.
//
// @title           Closet API
// @version         1.0
// @description     Backend for Closet — a virtual wardrobe/dressing-doll app.
// @BasePath        /api/v1
// @securityDefinitions.apikey  BearerAuth
// @in                          header
// @name                        Authorization
// @description                 Type "Bearer" followed by a space and the access token.
package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/gin-gonic/gin"

	"closet-backend/internal/companion"
	"closet-backend/internal/config"
	"closet-backend/internal/database"
	"closet-backend/internal/handlers"
	"closet-backend/internal/imageproc"
	applogger "closet-backend/internal/logger"
	"closet-backend/internal/patternproxy"
	"closet-backend/internal/repository"
	"closet-backend/internal/routes"
	"closet-backend/internal/service"
	"closet-backend/internal/storage"
	appvalidator "closet-backend/internal/validator"
	"closet-backend/internal/weather"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		// config isn't loaded yet, so this is the one place a plain stderr
		// write instead of the structured logger is correct.
		os.Stderr.WriteString("config error: " + err.Error() + "\n")
		os.Exit(1)
	}

	log := applogger.New(cfg.Log.Level)
	appvalidator.Register()

	db, err := database.Connect(cfg.Database)
	if err != nil {
		log.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := database.RunMigrations(db, log); err != nil {
		log.Error("migrations failed", "error", err)
		os.Exit(1)
	}

	// --- storage: selected once, here, based on STORAGE_PROVIDER. Every
	// layer above this (ItemService, handlers) only ever sees the
	// storage.Storage interface — see internal/storage/storage.go. ---
	var store storage.Storage
	switch cfg.Storage.Provider {
	case "gcs":
		gcsStore, err := storage.NewGCSStorage(context.Background(), storage.GCSConfig{
			Bucket:          cfg.Storage.Bucket,
			BaseURL:         cfg.Storage.BaseURL,
			CredentialsFile: cfg.Storage.GCSCredentialsFile,
		})
		if err != nil {
			log.Error("gcs storage init failed", "error", err)
			os.Exit(1)
		}
		defer gcsStore.Close()
		store = gcsStore
		log.Info("storage provider selected", "provider", "gcs", "bucket", cfg.Storage.Bucket)
	case "s3":
		s3Store, err := storage.NewS3Storage(context.Background(), storage.S3Config{
			Bucket:          cfg.Storage.Bucket,
			Region:          cfg.Storage.S3Region,
			Endpoint:        cfg.Storage.S3Endpoint,
			BaseURL:         cfg.Storage.BaseURL,
			AccessKeyID:     cfg.Storage.S3AccessKeyID,
			SecretAccessKey: cfg.Storage.S3SecretAccessKey,
			ForcePathStyle:  cfg.Storage.S3ForcePathStyle,
		})
		if err != nil {
			log.Error("s3 storage init failed", "error", err)
			os.Exit(1)
		}
		store = s3Store
		log.Info("storage provider selected", "provider", "s3", "bucket", cfg.Storage.Bucket, "endpoint", cfg.Storage.S3Endpoint)
	default:
		localStore, err := storage.NewLocalStorage(cfg.Storage.LocalDir, cfg.Storage.BaseURL)
		if err != nil {
			log.Error("local storage init failed", "error", err)
			os.Exit(1)
		}
		store = localStore
		log.Info("storage provider selected", "provider", "local", "dir", cfg.Storage.LocalDir)
	}

	imageProcessor := imageproc.New(imageproc.Config{
		MaxWidth:        cfg.Image.MaxWidth,
		MaxHeight:       cfg.Image.MaxHeight,
		ThumbnailWidth:  cfg.Image.ThumbnailWidth,
		ThumbnailHeight: cfg.Image.ThumbnailHeight,
		JPEGQuality:     cfg.Image.JPEGQuality,
	})
	maxUploadBytes := cfg.Storage.MaxFileSizeMB * 1024 * 1024

	// --- dependency injection: each layer only knows the layer below it ---
	userRepo := repository.NewUserRepository(db, cfg.Database.QueryTimeout)
	tokenRepo := repository.NewRefreshTokenRepository(db, cfg.Database.QueryTimeout)
	itemRepo := repository.NewItemRepository(db, cfg.Database.QueryTimeout)
	outfitRepo := repository.NewOutfitRepository(db, cfg.Database.QueryTimeout)

	authSvc := service.NewAuthService(userRepo, tokenRepo, cfg.Auth)
	userSvc := service.NewUserService(userRepo)
	itemSvc := service.NewItemService(itemRepo,
		service.WithStorage(store, imageProcessor, maxUploadBytes, cfg.Storage.UploadTimeout),
		service.WithLogger(log),
	)
	outfitSvc := service.NewOutfitService(outfitRepo)

	// Phase 5 — pattern-service client. Same maxUploadBytes ceiling as
	// item image uploads; a fabric photo is not exempt from the size
	// limit just because it's not persisted.
	patternClient, err := patternproxy.New(context.Background(), cfg.Pattern.URL, cfg.Pattern.Timeout, cfg.Pattern.UseIDToken, cfg.Pattern.APIKey)
	if err != nil {
		log.Error("pattern service client init failed", "error", err)
		os.Exit(1)
	}

	// Bear's chat — see internal/companion. Deliberately never fatal if
	// GEMINI_API_KEY is unset (companion.Client.Enabled() is simply
	// false); the rest of the app has nothing to do with this feature and
	// shouldn't refuse to boot over it.
	companionClient := companion.New(cfg.Companion.APIKey, cfg.Companion.Model, cfg.Companion.Timeout)
	if !companionClient.Enabled() {
		log.Info("companion (Bear) chat disabled: GEMINI_API_KEY not set")
	}
	// Weather is keyless (Open-Meteo, see internal/weather) so it's always
	// constructed — it only ever gets called when a request includes
	// coordinates, and simply isn't used if Bear's chat itself is disabled.
	weatherClient := weather.New(cfg.Companion.Timeout)

	h := routes.Handlers{
		Auth:      handlers.NewAuthHandler(authSvc),
		User:      handlers.NewUserHandler(userSvc),
		Item:      handlers.NewItemHandler(itemSvc),
		Outfit:    handlers.NewOutfitHandler(outfitSvc),
		Health:    handlers.NewHealthHandler(db),
		Pattern:   handlers.NewPatternHandler(patternClient, maxUploadBytes),
		Companion: handlers.NewCompanionHandler(companionClient, itemSvc, weatherClient),
	}

	if cfg.Log.Level != "debug" {
		gin.SetMode(gin.ReleaseMode)
	}
	router := gin.New() // gin.New(), not gin.Default() — we install our own logger/recovery middleware
	routes.Register(router, h, cfg, db, log)

	srv := &http.Server{
		Addr:    ":" + cfg.Server.Port,
		Handler: router,
	}

	// run in a goroutine so we can listen for shutdown signals below
	go func() {
		log.Info("server starting", "port", cfg.Server.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("server failed", "error", err)
			os.Exit(1)
		}
	}()

	// --- graceful shutdown: Step 10 ---
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Info("shutdown signal received, draining in-flight requests")

	ctx, cancel := context.WithTimeout(context.Background(), cfg.Server.ShutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Error("forced shutdown", "error", err)
	}
	log.Info("server stopped cleanly")
}
