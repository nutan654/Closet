package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"closet-backend/internal/dto"
	"closet-backend/internal/middleware"
	"closet-backend/internal/service"
	appvalidator "closet-backend/internal/validator"
)

type AuthHandler struct {
	auth *service.AuthService
}

func NewAuthHandler(auth *service.AuthService) *AuthHandler {
	return &AuthHandler{auth: auth}
}

// Signup godoc
// @Summary      Create an account
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body body dto.SignupRequest true "signup payload"
// @Success      201 {object} dto.Envelope{data=dto.AuthResponse}
// @Failure      400 {object} dto.Envelope
// @Failure      409 {object} dto.Envelope
// @Router       /api/v1/auth/signup [post]
func (h *AuthHandler) Signup(c *gin.Context) {
	var req dto.SignupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		msg, _ := appvalidator.Format(err)
		c.JSON(http.StatusBadRequest, dto.Fail(msg, "VALIDATION_ERROR"))
		return
	}

	resp, err := h.auth.Signup(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, service.ErrEmailTaken) {
			c.JSON(http.StatusConflict, dto.Fail(err.Error(), "EMAIL_TAKEN"))
			return
		}
		c.JSON(http.StatusInternalServerError, dto.Fail("could not create account", "INTERNAL_ERROR"))
		return
	}
	c.JSON(http.StatusCreated, dto.Ok("welcome home ✨", resp))
}

// Login godoc
// @Summary      Sign in
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body body dto.LoginRequest true "login payload"
// @Success      200 {object} dto.Envelope{data=dto.AuthResponse}
// @Failure      401 {object} dto.Envelope
// @Router       /api/v1/auth/login [post]
func (h *AuthHandler) Login(c *gin.Context) {
	var req dto.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		msg, _ := appvalidator.Format(err)
		c.JSON(http.StatusBadRequest, dto.Fail(msg, "VALIDATION_ERROR"))
		return
	}

	resp, err := h.auth.Login(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			c.JSON(http.StatusUnauthorized, dto.Fail(err.Error(), "INVALID_CREDENTIALS"))
			return
		}
		c.JSON(http.StatusInternalServerError, dto.Fail("could not sign in", "INTERNAL_ERROR"))
		return
	}
	c.JSON(http.StatusOK, dto.Ok("welcome back", resp))
}

// Refresh godoc
// @Summary      Exchange a refresh token for a new access token
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body body dto.RefreshRequest true "refresh payload"
// @Success      200 {object} dto.Envelope{data=dto.AuthResponse}
// @Failure      401 {object} dto.Envelope
// @Router       /api/v1/auth/refresh [post]
func (h *AuthHandler) Refresh(c *gin.Context) {
	var req dto.RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		msg, _ := appvalidator.Format(err)
		c.JSON(http.StatusBadRequest, dto.Fail(msg, "VALIDATION_ERROR"))
		return
	}

	resp, err := h.auth.Refresh(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusUnauthorized, dto.Fail("your session has expired, please sign in again", "TOKEN_INVALID"))
		return
	}
	c.JSON(http.StatusOK, dto.Ok("session refreshed", resp))
}

// Logout godoc
// @Summary      Revoke a refresh token
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body body dto.RefreshRequest true "the refresh token to revoke"
// @Success      200 {object} dto.Envelope
// @Router       /api/v1/auth/logout [post]
func (h *AuthHandler) Logout(c *gin.Context) {
	var req dto.RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		msg, _ := appvalidator.Format(err)
		c.JSON(http.StatusBadRequest, dto.Fail(msg, "VALIDATION_ERROR"))
		return
	}
	_ = h.auth.Logout(c.Request.Context(), req.RefreshToken)
	c.JSON(http.StatusOK, dto.Ok("signed out", nil))
}

// Me godoc
// @Summary      Get the current authenticated user
// @Tags         auth
// @Security     BearerAuth
// @Produce      json
// @Success      200 {object} dto.Envelope{data=dto.UserResponse}
// @Router       /api/v1/auth/me [get]
func (h *AuthHandler) Me(c *gin.Context) {
	userID, _ := middleware.UserID(c)
	resp, err := h.auth.Me(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, dto.Fail("user not found", "USER_NOT_FOUND"))
		return
	}
	c.JSON(http.StatusOK, dto.Ok("", resp))
}
