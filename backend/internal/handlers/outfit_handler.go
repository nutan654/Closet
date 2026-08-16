package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"closet-backend/internal/dto"
	"closet-backend/internal/middleware"
	"closet-backend/internal/service"
	appvalidator "closet-backend/internal/validator"
)

type OutfitHandler struct {
	outfits *service.OutfitService
}

func NewOutfitHandler(outfits *service.OutfitService) *OutfitHandler {
	return &OutfitHandler{outfits: outfits}
}

// Create godoc
// @Summary      Save a new outfit
// @Tags         outfits
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body body dto.OutfitRequest true "outfit payload"
// @Success      201 {object} dto.Envelope{data=dto.OutfitResponse}
// @Router       /api/v1/outfits [post]
func (h *OutfitHandler) Create(c *gin.Context) {
	userID, _ := middleware.UserID(c)

	var req dto.OutfitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		msg, _ := appvalidator.Format(err)
		c.JSON(http.StatusBadRequest, dto.Fail(msg, "VALIDATION_ERROR"))
		return
	}

	outfit, err := h.outfits.Create(c.Request.Context(), userID, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, dto.Fail("could not save outfit", "INTERNAL_ERROR"))
		return
	}
	c.JSON(http.StatusCreated, dto.Ok("outfit saved", outfit))
}

// List godoc
// @Summary      List the current user's saved outfits
// @Tags         outfits
// @Security     BearerAuth
// @Produce      json
// @Success      200 {object} dto.Envelope{data=[]dto.OutfitResponse}
// @Router       /api/v1/outfits [get]
func (h *OutfitHandler) List(c *gin.Context) {
	userID, _ := middleware.UserID(c)
	outfits, err := h.outfits.List(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, dto.Fail("could not load outfits", "INTERNAL_ERROR"))
		return
	}
	c.JSON(http.StatusOK, dto.Ok("", outfits))
}

// Get godoc
// @Summary      Get a single outfit
// @Tags         outfits
// @Security     BearerAuth
// @Param        id path string true "outfit id"
// @Success      200 {object} dto.Envelope{data=dto.OutfitResponse}
// @Router       /api/v1/outfits/{id} [get]
func (h *OutfitHandler) Get(c *gin.Context) {
	userID, _ := middleware.UserID(c)
	outfit, err := h.outfits.Get(c.Request.Context(), userID, c.Param("id"))
	if err != nil {
		writeOwnershipAwareError(c, err, "outfit")
		return
	}
	c.JSON(http.StatusOK, dto.Ok("", outfit))
}

// Update godoc
// @Summary      Update an outfit's name, emoji, or items
// @Tags         outfits
// @Security     BearerAuth
// @Accept       json
// @Param        id path string true "outfit id"
// @Param        body body dto.OutfitPatchRequest true "fields to update"
// @Success      200 {object} dto.Envelope
// @Router       /api/v1/outfits/{id} [patch]
func (h *OutfitHandler) Update(c *gin.Context) {
	userID, _ := middleware.UserID(c)

	var req dto.OutfitPatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		msg, _ := appvalidator.Format(err)
		c.JSON(http.StatusBadRequest, dto.Fail(msg, "VALIDATION_ERROR"))
		return
	}

	if err := h.outfits.Update(c.Request.Context(), userID, c.Param("id"), req); err != nil {
		writeOwnershipAwareError(c, err, "outfit")
		return
	}
	c.JSON(http.StatusOK, dto.Ok("updated", nil))
}

// Delete godoc
// @Summary      Delete an outfit
// @Tags         outfits
// @Security     BearerAuth
// @Param        id path string true "outfit id"
// @Success      200 {object} dto.Envelope
// @Router       /api/v1/outfits/{id} [delete]
func (h *OutfitHandler) Delete(c *gin.Context) {
	userID, _ := middleware.UserID(c)
	if err := h.outfits.Delete(c.Request.Context(), userID, c.Param("id")); err != nil {
		writeOwnershipAwareError(c, err, "outfit")
		return
	}
	c.JSON(http.StatusOK, dto.Ok("removed", nil))
}
