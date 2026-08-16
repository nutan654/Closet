package handlers

import (
	"errors"
	"mime/multipart"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"closet-backend/internal/apperror"
	"closet-backend/internal/dto"
	"closet-backend/internal/middleware"
	"closet-backend/internal/service"
	appvalidator "closet-backend/internal/validator"
)

type ItemHandler struct {
	items *service.ItemService
}

func NewItemHandler(items *service.ItemService) *ItemHandler {
	return &ItemHandler{items: items}
}

// Create godoc
// @Summary      Add an item to the wardrobe
// @Tags         items
// @Security     BearerAuth
// @Accept       json
// @Accept       multipart/form-data
// @Produce      json
// @Param        body body dto.ItemRequest true "item payload"
// @Param        image formData file false "clothing photo (jpeg/png/webp, multipart only)"
// @Success      201 {object} dto.Envelope{data=dto.ItemResponse}
// @Failure      400 {object} dto.Envelope
// @Failure      413 {object} dto.Envelope
// @Failure      415 {object} dto.Envelope
// @Router       /api/v1/items [post]
//
// Create accepts either an application/json body (no image — the original
// Phase 2 shape, unchanged) or a multipart/form-data request with the same
// fields plus an optional `image` file part (Phase 3). gin's ShouldBind
// picks the right binder automatically based on Content-Type, since
// dto.ItemRequest carries both `json` and `form` struct tags.
func (h *ItemHandler) Create(c *gin.Context) {
	userID, _ := middleware.UserID(c)

	var req dto.ItemRequest
	if err := c.ShouldBind(&req); err != nil {
		msg, _ := appvalidator.Format(err)
		c.JSON(http.StatusBadRequest, dto.Fail(msg, "VALIDATION_ERROR"))
		return
	}

	var (
		imageFile   multipart.File
		imageHeader *multipart.FileHeader
	)
	if f, hdr, err := c.Request.FormFile("image"); err == nil {
		imageFile = f
		imageHeader = hdr
		defer f.Close()
	} else if err != http.ErrMissingFile && err != http.ErrNotMultipart {
		c.JSON(http.StatusBadRequest, dto.Fail("could not read the uploaded image", "ERR_INVALID_IMAGE"))
		return
	}

	item, err := h.items.Create(c.Request.Context(), userID, req, imageFile, imageHeader)
	if err != nil {
		writeCreateError(c, err)
		return
	}
	c.JSON(http.StatusCreated, dto.Ok("added to your closet ✨", item))
}

// writeCreateError maps the typed upload errors (apperror.Error — too
// large, wrong type, corrupt image) onto their intended HTTP status; any
// other error (DB failure, storage failure) falls back to the existing
// generic 500 response so behavior for the non-image path is unchanged.
func writeCreateError(c *gin.Context, err error) {
	if appErr, ok := apperror.As(err); ok {
		c.JSON(appErr.Status, dto.Fail(appErr.Message, appErr.Code))
		return
	}
	c.JSON(http.StatusInternalServerError, dto.Fail("could not add item", "INTERNAL_ERROR"))
}

// List godoc
// @Summary      List wardrobe items (paginated, optionally filtered by category)
// @Tags         items
// @Security     BearerAuth
// @Produce      json
// @Param        category query string false "filter by category"
// @Param        page query int false "page number, default 1"
// @Param        perPage query int false "items per page, default 20, max 100"
// @Success      200 {object} dto.Envelope{data=dto.PageResponse}
// @Router       /api/v1/items [get]
func (h *ItemHandler) List(c *gin.Context) {
	userID, _ := middleware.UserID(c)
	category := c.Query("category")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("perPage", "20"))

	result, err := h.items.List(c.Request.Context(), userID, category, page, perPage)
	if err != nil {
		c.JSON(http.StatusInternalServerError, dto.Fail("could not load wardrobe", "INTERNAL_ERROR"))
		return
	}
	c.JSON(http.StatusOK, dto.Ok("", result))
}

// Update godoc
// @Summary      Partially update an item
// @Tags         items
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id path string true "item id"
// @Param        body body dto.ItemPatchRequest true "fields to update"
// @Success      200 {object} dto.Envelope
// @Failure      403 {object} dto.Envelope
// @Failure      404 {object} dto.Envelope
// @Router       /api/v1/items/{id} [patch]
func (h *ItemHandler) Update(c *gin.Context) {
	userID, _ := middleware.UserID(c)
	id := c.Param("id")

	var req dto.ItemPatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		msg, _ := appvalidator.Format(err)
		c.JSON(http.StatusBadRequest, dto.Fail(msg, "VALIDATION_ERROR"))
		return
	}

	if err := h.items.Update(c.Request.Context(), userID, id, req); err != nil {
		writeOwnershipAwareError(c, err, "item")
		return
	}
	c.JSON(http.StatusOK, dto.Ok("updated", nil))
}

// Delete godoc
// @Summary      Remove an item from the wardrobe
// @Tags         items
// @Security     BearerAuth
// @Param        id path string true "item id"
// @Success      200 {object} dto.Envelope
// @Router       /api/v1/items/{id} [delete]
func (h *ItemHandler) Delete(c *gin.Context) {
	userID, _ := middleware.UserID(c)
	id := c.Param("id")

	if err := h.items.Delete(c.Request.Context(), userID, id); err != nil {
		writeOwnershipAwareError(c, err, "item")
		return
	}
	c.JSON(http.StatusOK, dto.Ok("removed", nil))
}

// LogWear godoc
// @Summary      Record that an item was worn today
// @Tags         items
// @Security     BearerAuth
// @Param        id path string true "item id"
// @Success      200 {object} dto.Envelope
// @Router       /api/v1/items/{id}/wear [post]
func (h *ItemHandler) LogWear(c *gin.Context) {
	userID, _ := middleware.UserID(c)
	id := c.Param("id")

	if err := h.items.LogWear(c.Request.Context(), userID, id); err != nil {
		writeOwnershipAwareError(c, err, "item")
		return
	}
	c.JSON(http.StatusOK, dto.Ok("logged ✨", nil))
}

// History godoc
// @Summary      Recent wear history for the current user
// @Tags         items
// @Security     BearerAuth
// @Produce      json
// @Success      200 {object} dto.Envelope
// @Router       /api/v1/history [get]
func (h *ItemHandler) History(c *gin.Context) {
	userID, _ := middleware.UserID(c)
	entries, err := h.items.History(c.Request.Context(), userID, 200)
	if err != nil {
		c.JSON(http.StatusInternalServerError, dto.Fail("could not load history", "INTERNAL_ERROR"))
		return
	}
	c.JSON(http.StatusOK, dto.Ok("", entries))
}

// writeOwnershipAwareError maps the service-layer sentinel errors
// (repository.ErrNotFound, service.ErrForbidden) onto the right HTTP
// status — shared between item and outfit handlers so a "not yours"
// response looks identical everywhere in the API.
func writeOwnershipAwareError(c *gin.Context, err error, resource string) {
	switch {
	case errors.Is(err, service.ErrForbidden):
		c.JSON(http.StatusForbidden, dto.Fail("you don't have access to this "+resource, "FORBIDDEN"))
	default:
		c.JSON(http.StatusNotFound, dto.Fail(resource+" not found", "NOT_FOUND"))
	}
}
