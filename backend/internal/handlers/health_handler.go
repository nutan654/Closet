package handlers

import (
	"context"
	"database/sql"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"closet-backend/internal/dto"
)

type HealthHandler struct {
	db *sql.DB
}

func NewHealthHandler(db *sql.DB) *HealthHandler {
	return &HealthHandler{db: db}
}

// Health godoc
// @Summary      Liveness probe — is the process up at all
// @Tags         health
// @Produce      json
// @Success      200 {object} dto.Envelope
// @Router       /health [get]
func (h *HealthHandler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, dto.Ok("alive", gin.H{"status": "ok"}))
}

// Ready godoc
// @Summary      Readiness probe — can this instance actually serve traffic
// @Tags         health
// @Produce      json
// @Success      200 {object} dto.Envelope
// @Failure      503 {object} dto.Envelope
// @Router       /ready [get]
func (h *HealthHandler) Ready(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer cancel()

	if err := h.db.PingContext(ctx); err != nil {
		c.JSON(http.StatusServiceUnavailable, dto.Fail("database unreachable", "NOT_READY"))
		return
	}
	c.JSON(http.StatusOK, dto.Ok("ready", gin.H{"database": "connected"}))
}
