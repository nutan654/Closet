package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"closet-backend/internal/dto"
	"closet-backend/internal/middleware"
	"closet-backend/internal/service"
	appvalidator "closet-backend/internal/validator"
)

type UserHandler struct {
	users *service.UserService
}

func NewUserHandler(users *service.UserService) *UserHandler {
	return &UserHandler{users: users}
}

// SetEquipped godoc
// @Summary      Equip or unequip an item on the doll
// @Tags         users
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body body dto.EquippedRequest true "slot + item id (omit itemId to unequip)"
// @Success      200 {object} dto.Envelope
// @Router       /api/v1/me/equipped [put]
func (h *UserHandler) SetEquipped(c *gin.Context) {
	userID, _ := middleware.UserID(c)

	var req dto.EquippedRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		msg, _ := appvalidator.Format(err)
		c.JSON(http.StatusBadRequest, dto.Fail(msg, "VALIDATION_ERROR"))
		return
	}

	equipped, err := h.users.SetEquipped(c.Request.Context(), userID, req.Slot, req.ItemID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, dto.Fail("could not update", "INTERNAL_ERROR"))
		return
	}
	c.JSON(http.StatusOK, dto.Ok("", equipped))
}
