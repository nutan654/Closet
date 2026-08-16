package middleware

import (
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	"closet-backend/internal/dto"
)

// Recovery catches panics anywhere downstream and turns them into a clean
// 500 response instead of killing the process or (worse) leaking a Go
// stack trace to the client. The stack trace still goes to the structured
// logger, where it belongs.
func Recovery(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				log.Error("panic recovered",
					"request_id", c.GetString(RequestIDKey),
					"path", c.Request.URL.Path,
					"panic", r,
				)
				c.AbortWithStatusJSON(http.StatusInternalServerError, dto.Fail("something went wrong on our end", "INTERNAL_ERROR"))
			}
		}()
		c.Next()
	}
}
