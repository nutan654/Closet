package handlers

import (
	"errors"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"

	"closet-backend/internal/apperror"
	"closet-backend/internal/dto"
	"closet-backend/internal/patternproxy"
	"closet-backend/internal/upload"
)

// PatternHandler exposes the Phase 5 pattern-processing feature. It does
// not touch the database and does not persist anything — a pattern only
// becomes durable once the user saves it onto an item/outfit, and (per the
// brief) pattern styling fields aren't in the Postgres schema yet, so this
// endpoint is purely: validate -> proxy to pattern-service -> return.
type PatternHandler struct {
	patterns       *patternproxy.Client
	maxUploadBytes int64
}

func NewPatternHandler(patterns *patternproxy.Client, maxUploadBytes int64) *PatternHandler {
	return &PatternHandler{patterns: patterns, maxUploadBytes: maxUploadBytes}
}

// Process godoc
// @Summary      Process a fabric/pattern image into a seamless tile + color palette
// @Tags         patterns
// @Security     BearerAuth
// @Accept       multipart/form-data
// @Produce      json
// @Param        image formData file true "fabric/pattern photo (jpeg/png/webp)"
// @Success      200 {object} dto.Envelope{data=dto.PatternProcessResponse}
// @Failure      400 {object} dto.Envelope
// @Failure      413 {object} dto.Envelope
// @Failure      415 {object} dto.Envelope
// @Failure      502 {object} dto.Envelope
// @Router       /api/v1/patterns/process [post]
//
// Process reuses the exact same validation the item-photo upload path
// uses (internal/upload: size ceiling + magic-byte content sniffing) —
// per the brief's "do not create a second image validation system" rule
// — before handing the bytes off to pattern-service.
func (h *PatternHandler) Process(c *gin.Context) {
	fileHeader, err := c.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, dto.Fail("no image file provided", "ERR_INVALID_IMAGE"))
		return
	}

	if err := upload.CheckSize(fileHeader.Size, h.maxUploadBytes); err != nil {
		writePatternError(c, err)
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, dto.Fail("could not read the uploaded image", "ERR_INVALID_IMAGE"))
		return
	}
	defer file.Close()

	raw, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusBadRequest, dto.Fail("could not read the uploaded image", "ERR_INVALID_IMAGE"))
		return
	}

	if err := upload.CheckSize(int64(len(raw)), h.maxUploadBytes); err != nil {
		writePatternError(c, err)
		return
	}

	if _, err := upload.DetectImageType(raw); err != nil {
		writePatternError(c, err)
		return
	}

	result, err := h.patterns.Process(c.Request.Context(), raw, fileHeader.Filename, 0, 0)
	if err != nil {
		writeProxyError(c, err)
		return
	}

	c.JSON(http.StatusOK, dto.Ok("", dto.PatternProcessResponse{
		TileDataURL: result.TileDataURL,
		Width:       result.Width,
		Height:      result.Height,
		Palette:     result.Palette,
	}))
}

func writePatternError(c *gin.Context, err error) {
	if appErr, ok := apperror.As(err); ok {
		c.JSON(appErr.Status, dto.Fail(appErr.Message, appErr.Code))
		return
	}
	c.JSON(http.StatusBadRequest, dto.Fail("invalid image", "ERR_INVALID_IMAGE"))
}

// writeProxyError distinguishes "pattern-service is down" (502 — a
// deployment/ops problem) from "pattern-service ran and rejected the
// image" (bubble its 4xx up as-is, since that's a real validation
// failure the user can act on).
func writeProxyError(c *gin.Context, err error) {
	var unavailable *patternproxy.ErrServiceUnavailable
	if errors.As(err, &unavailable) {
		c.JSON(http.StatusBadGateway, dto.Fail("pattern service is temporarily unavailable", "ERR_PATTERN_SERVICE_UNAVAILABLE"))
		return
	}

	var upstream *patternproxy.ErrUpstream
	if errors.As(err, &upstream) {
		status := upstream.Status
		if status < 400 || status >= 600 {
			status = http.StatusBadGateway
		}
		msg := upstream.Detail
		if msg == "" {
			msg = "pattern service could not process this image"
		}
		c.JSON(status, dto.Fail(msg, "ERR_PATTERN_PROCESSING_FAILED"))
		return
	}

	c.JSON(http.StatusBadGateway, dto.Fail("pattern processing failed", "ERR_PATTERN_PROCESSING_FAILED"))
}
