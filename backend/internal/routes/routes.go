// Package routes is the only place that knows the URL shape of the API —
// handlers don't know their own paths, which keeps versioning (Step 12) a
// one-file concern. Bump to /api/v2 by mounting a second group here
// without touching a single handler.
package routes

import (
	"database/sql"
	"log/slog"

	"github.com/gin-gonic/gin"

	"closet-backend/internal/config"
	"closet-backend/internal/handlers"
	"closet-backend/internal/middleware"
)

type Handlers struct {
	Auth      *handlers.AuthHandler
	User      *handlers.UserHandler
	Item      *handlers.ItemHandler
	Outfit    *handlers.OutfitHandler
	Health    *handlers.HealthHandler
	Pattern   *handlers.PatternHandler
	Companion *handlers.CompanionHandler
}

func Register(r *gin.Engine, h Handlers, cfg *config.Config, db *sql.DB, log *slog.Logger) {
	r.Use(middleware.RequestID())
	r.Use(middleware.Logging(log))
	r.Use(middleware.Recovery(log))
	r.Use(middleware.CORS(cfg.Server.AllowedOrigins))

	// unversioned — infra (load balancers, k8s, Cloud Run) probes these directly
	r.GET("/health", h.Health.Health)
	r.GET("/ready", h.Health.Ready)

	// Local dev only: serve uploaded files straight off disk at the same
	// path STORAGE_BASE_URL points to (see storage.LocalStorage). In
	// production (STORAGE_PROVIDER=gcs) this route isn't registered at
	// all — GCS serves the objects directly via their own public URLs.
	if cfg.Storage.Provider == "local" {
		r.Static("/uploads", cfg.Storage.LocalDir)
	}

	v1 := r.Group("/api/v1")

	auth := v1.Group("/auth")
	auth.Use(middleware.RateLimit(cfg.Auth.RateLimitPerMinute))
	{
		auth.POST("/signup", h.Auth.Signup)
		auth.POST("/login", h.Auth.Login)
		auth.POST("/refresh", h.Auth.Refresh)
		auth.POST("/logout", h.Auth.Logout)
	}

	// everything below requires a valid access token
	private := v1.Group("")
	private.Use(middleware.RequireAuth(cfg.Auth.JWTSecret))
	{
		private.GET("/auth/me", h.Auth.Me)

		private.PUT("/me/equipped", h.User.SetEquipped)

		private.POST("/items", h.Item.Create)
		private.GET("/items", h.Item.List)
		private.PATCH("/items/:id", h.Item.Update)
		private.DELETE("/items/:id", h.Item.Delete)
		private.POST("/items/:id/wear", h.Item.LogWear)
		private.GET("/history", h.Item.History)

		private.POST("/outfits", h.Outfit.Create)
		private.GET("/outfits", h.Outfit.List)
		private.GET("/outfits/:id", h.Outfit.Get)
		private.PATCH("/outfits/:id", h.Outfit.Update)
		private.DELETE("/outfits/:id", h.Outfit.Delete)

		// Phase 5 — proxies to the Python pattern-service; nothing here
		// touches Postgres (see handlers.PatternHandler doc comment).
		private.POST("/patterns/process", h.Pattern.Process)

		// Bear — proxies to the Gemini generateContent API with the caller's
		// own wardrobe as context (see handlers.CompanionHandler doc
		// comment). Same "requires auth, never trusts a client-supplied
		// user id" posture as every other private route in this group.
		private.POST("/companion/chat", h.Companion.Chat)
	}
}
