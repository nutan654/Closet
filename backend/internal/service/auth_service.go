package service

import (
	"context"
	"errors"
	"time"

	"closet-backend/internal/config"
	"closet-backend/internal/dto"
	"closet-backend/internal/models"
	"closet-backend/internal/repository"
	"closet-backend/internal/utils"
)

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrEmailTaken         = errors.New("an account with this email already exists")
	ErrTokenInvalid       = errors.New("refresh token is invalid or has expired")
)

type AuthService struct {
	users  repository.UserRepository
	tokens repository.RefreshTokenRepository
	auth   config.AuthConfig
}

func NewAuthService(users repository.UserRepository, tokens repository.RefreshTokenRepository, auth config.AuthConfig) *AuthService {
	return &AuthService{users: users, tokens: tokens, auth: auth}
}

func (s *AuthService) Signup(ctx context.Context, req dto.SignupRequest) (*dto.AuthResponse, error) {
	hash, err := utils.HashPassword(req.Password, s.auth.BcryptCost)
	if err != nil {
		return nil, err
	}

	user := &models.User{
		Name:         req.Name,
		Email:        req.Email,
		PasswordHash: hash,
		Settings:     models.Settings{Equipped: map[string]string{}},
	}
	if err := s.users.Create(ctx, user); err != nil {
		if errors.Is(err, repository.ErrDuplicate) {
			return nil, ErrEmailTaken
		}
		return nil, err
	}

	return s.issueTokenPair(ctx, user)
}

func (s *AuthService) Login(ctx context.Context, req dto.LoginRequest) (*dto.AuthResponse, error) {
	user, err := s.users.FindByEmail(ctx, req.Email)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			// Same error for "no such user" and "wrong password" — never let
			// a login endpoint reveal whether an email is registered.
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}

	if !utils.CheckPassword(req.Password, user.PasswordHash) {
		return nil, ErrInvalidCredentials
	}

	return s.issueTokenPair(ctx, user)
}

// Refresh rotates the refresh token on every use (the old one is revoked,
// a brand new one is issued) rather than reusing the same refresh token
// across its whole lifetime. This means a stolen-but-unused refresh token
// becomes worthless the moment the legitimate client refreshes again, and
// reuse of an already-rotated token is a strong signal of theft — a
// detail most tutorial JWT implementations skip.
func (s *AuthService) Refresh(ctx context.Context, req dto.RefreshRequest) (*dto.AuthResponse, error) {
	hash := utils.HashToken(req.RefreshToken)
	stored, err := s.tokens.FindByHash(ctx, hash)
	if err != nil {
		return nil, ErrTokenInvalid
	}
	if stored.RevokedAt != nil || time.Now().After(stored.ExpiresAt) {
		return nil, ErrTokenInvalid
	}

	user, err := s.users.FindByID(ctx, stored.UserID)
	if err != nil {
		return nil, ErrTokenInvalid
	}

	// rotate: revoke the one just used, issue a fresh pair
	_ = s.tokens.Revoke(ctx, stored.ID)
	return s.issueTokenPair(ctx, user)
}

func (s *AuthService) Logout(ctx context.Context, refreshToken string) error {
	hash := utils.HashToken(refreshToken)
	stored, err := s.tokens.FindByHash(ctx, hash)
	if err != nil {
		return nil // already gone/invalid — logout is idempotent either way
	}
	return s.tokens.Revoke(ctx, stored.ID)
}

func (s *AuthService) Me(ctx context.Context, userID string) (*dto.UserResponse, error) {
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	resp := toUserResponse(user)
	return &resp, nil
}

func (s *AuthService) issueTokenPair(ctx context.Context, user *models.User) (*dto.AuthResponse, error) {
	access, err := utils.GenerateAccessToken(s.auth.JWTSecret, user.ID, user.Email, s.auth.AccessTokenTTL)
	if err != nil {
		return nil, err
	}

	refresh, err := utils.GenerateRefreshToken()
	if err != nil {
		return nil, err
	}
	record := &models.RefreshToken{
		UserID:    user.ID,
		TokenHash: utils.HashToken(refresh),
		ExpiresAt: time.Now().Add(s.auth.RefreshTokenTTL),
	}
	if err := s.tokens.Store(ctx, record); err != nil {
		return nil, err
	}

	return &dto.AuthResponse{
		User:         toUserResponse(user),
		AccessToken:  access,
		RefreshToken: refresh,
		ExpiresIn:    int(s.auth.AccessTokenTTL.Seconds()),
	}, nil
}

func toUserResponse(u *models.User) dto.UserResponse {
	equipped := u.Settings.Equipped
	if equipped == nil {
		equipped = map[string]string{}
	}
	return dto.UserResponse{
		ID:        u.ID,
		Name:      u.Name,
		Email:     u.Email,
		Avatar:    u.Avatar,
		Equipped:  equipped,
		CreatedAt: u.CreatedAt,
	}
}
