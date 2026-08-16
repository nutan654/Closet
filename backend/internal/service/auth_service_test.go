package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"closet-backend/internal/config"
	"closet-backend/internal/dto"
)

func newTestAuthService() (*AuthService, *fakeUserRepository, *fakeRefreshTokenRepository) {
	users := newFakeUserRepository()
	tokens := newFakeRefreshTokenRepository()
	auth := config.AuthConfig{
		JWTSecret:       "test-secret-at-least-16-chars",
		AccessTokenTTL:  15 * time.Minute,
		RefreshTokenTTL: 30 * 24 * time.Hour,
		BcryptCost:      4, // low cost in tests — bcrypt at cost 12 would make the suite slow for no benefit here
	}
	return NewAuthService(users, tokens, auth), users, tokens
}

func TestSignup_Success(t *testing.T) {
	svc, _, _ := newTestAuthService()

	resp, err := svc.Signup(context.Background(), dto.SignupRequest{
		Name: "Priya", Email: "priya@example.com", Password: "Sup3r$ecret",
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if resp.User.Email != "priya@example.com" {
		t.Errorf("expected email to round-trip, got %q", resp.User.Email)
	}
	if resp.AccessToken == "" || resp.RefreshToken == "" {
		t.Error("expected both tokens to be issued on signup")
	}
	if resp.ExpiresIn != 15*60 {
		t.Errorf("expected expiresIn 900s, got %d", resp.ExpiresIn)
	}
}

func TestSignup_DuplicateEmail(t *testing.T) {
	svc, _, _ := newTestAuthService()
	ctx := context.Background()
	req := dto.SignupRequest{Name: "Priya", Email: "priya@example.com", Password: "Sup3r$ecret"}

	if _, err := svc.Signup(ctx, req); err != nil {
		t.Fatalf("first signup should succeed: %v", err)
	}
	_, err := svc.Signup(ctx, req)
	if !errors.Is(err, ErrEmailTaken) {
		t.Errorf("expected ErrEmailTaken, got %v", err)
	}
}

func TestLogin_WrongPasswordAndUnknownEmail_SameError(t *testing.T) {
	// Deliberately asserts the two failure modes are indistinguishable to
	// the caller — a login endpoint that returns a different error for
	// "no such user" vs "wrong password" leaks which emails are
	// registered, which is a real (and commonly shipped) vulnerability.
	svc, _, _ := newTestAuthService()
	ctx := context.Background()
	_, _ = svc.Signup(ctx, dto.SignupRequest{Name: "Priya", Email: "priya@example.com", Password: "Sup3r$ecret"})

	_, err1 := svc.Login(ctx, dto.LoginRequest{Email: "priya@example.com", Password: "WrongPassword1!"})
	_, err2 := svc.Login(ctx, dto.LoginRequest{Email: "nobody@example.com", Password: "WrongPassword1!"})

	if !errors.Is(err1, ErrInvalidCredentials) || !errors.Is(err2, ErrInvalidCredentials) {
		t.Fatalf("expected both to be ErrInvalidCredentials, got %v / %v", err1, err2)
	}
}

func TestLogin_Success(t *testing.T) {
	svc, _, _ := newTestAuthService()
	ctx := context.Background()
	_, _ = svc.Signup(ctx, dto.SignupRequest{Name: "Priya", Email: "priya@example.com", Password: "Sup3r$ecret"})

	resp, err := svc.Login(ctx, dto.LoginRequest{Email: "priya@example.com", Password: "Sup3r$ecret"})
	if err != nil {
		t.Fatalf("expected login to succeed, got %v", err)
	}
	if resp.User.Name != "Priya" {
		t.Errorf("expected name Priya, got %q", resp.User.Name)
	}
}

func TestRefresh_RotatesTokenAndRejectsReuse(t *testing.T) {
	svc, _, tokens := newTestAuthService()
	ctx := context.Background()
	signup, _ := svc.Signup(ctx, dto.SignupRequest{Name: "Priya", Email: "priya@example.com", Password: "Sup3r$ecret"})

	refreshed, err := svc.Refresh(ctx, dto.RefreshRequest{RefreshToken: signup.RefreshToken})
	if err != nil {
		t.Fatalf("expected refresh to succeed, got %v", err)
	}
	if refreshed.RefreshToken == signup.RefreshToken {
		t.Error("expected a brand new refresh token, got the same one back")
	}

	// reusing the original (now-rotated-out) refresh token must fail —
	// this is the theft-detection property rotation buys us
	_, err = svc.Refresh(ctx, dto.RefreshRequest{RefreshToken: signup.RefreshToken})
	if !errors.Is(err, ErrTokenInvalid) {
		t.Errorf("expected reused refresh token to be rejected, got %v", err)
	}

	// and the new one should still work
	if _, err := svc.Refresh(ctx, dto.RefreshRequest{RefreshToken: refreshed.RefreshToken}); err != nil {
		t.Errorf("expected the newly-issued refresh token to work, got %v", err)
	}

	_ = tokens // exercised indirectly through svc; kept for readability of what's under test
}

func TestLogout_RevokesToken(t *testing.T) {
	svc, _, _ := newTestAuthService()
	ctx := context.Background()
	signup, _ := svc.Signup(ctx, dto.SignupRequest{Name: "Priya", Email: "priya@example.com", Password: "Sup3r$ecret"})

	if err := svc.Logout(ctx, signup.RefreshToken); err != nil {
		t.Fatalf("logout should not error: %v", err)
	}

	_, err := svc.Refresh(ctx, dto.RefreshRequest{RefreshToken: signup.RefreshToken})
	if !errors.Is(err, ErrTokenInvalid) {
		t.Errorf("expected a revoked token to be rejected on refresh, got %v", err)
	}
}
