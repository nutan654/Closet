package utils

import (
	"testing"
	"time"
)

func TestPasswordHashRoundTrip(t *testing.T) {
	hash, err := HashPassword("Sup3r$ecret", 4)
	if err != nil {
		t.Fatalf("hash failed: %v", err)
	}
	if !CheckPassword("Sup3r$ecret", hash) {
		t.Error("expected correct password to check out")
	}
	if CheckPassword("wrong-password", hash) {
		t.Error("expected wrong password to fail")
	}
}

func TestAccessTokenRoundTrip(t *testing.T) {
	secret := "test-secret-at-least-16-chars"
	token, err := GenerateAccessToken(secret, "user_1", "priya@example.com", time.Minute)
	if err != nil {
		t.Fatalf("generate failed: %v", err)
	}

	claims, err := ParseAccessToken(secret, token)
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}
	if claims.UserID != "user_1" || claims.Email != "priya@example.com" {
		t.Errorf("unexpected claims: %+v", claims)
	}
}

func TestAccessToken_ExpiredIsRejected(t *testing.T) {
	secret := "test-secret-at-least-16-chars"
	token, _ := GenerateAccessToken(secret, "user_1", "priya@example.com", -time.Minute) // already expired

	if _, err := ParseAccessToken(secret, token); err != ErrInvalidToken {
		t.Errorf("expected expired token to be rejected, got %v", err)
	}
}

func TestAccessToken_WrongSecretIsRejected(t *testing.T) {
	token, _ := GenerateAccessToken("correct-secret-16-chars-plus", "user_1", "priya@example.com", time.Minute)

	if _, err := ParseAccessToken("a-different-secret-entirely", token); err != ErrInvalidToken {
		t.Errorf("expected token signed with a different secret to be rejected, got %v", err)
	}
}

func TestRefreshTokenHash_IsDeterministicAndUnique(t *testing.T) {
	a, _ := GenerateRefreshToken()
	b, _ := GenerateRefreshToken()
	if a == b {
		t.Error("expected two generated refresh tokens to differ")
	}
	if HashToken(a) != HashToken(a) {
		t.Error("expected hashing the same token twice to be deterministic")
	}
	if HashToken(a) == HashToken(b) {
		t.Error("expected different tokens to hash differently")
	}
}
