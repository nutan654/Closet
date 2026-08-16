package middleware

import (
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func CORS(allowedOrigins []string) gin.HandlerFunc {
	cfg := cors.DefaultConfig()
	cfg.AllowOrigins = allowedOrigins
	cfg.AllowHeaders = []string{"Origin", "Content-Type", "Authorization", "X-Request-ID"}
	cfg.ExposeHeaders = []string{"X-Request-ID"}
	cfg.AllowCredentials = true
	cfg.MaxAge = 12 * time.Hour
	return cors.New(cfg)
}
