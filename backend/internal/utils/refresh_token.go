package utils

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
)

// GenerateRefreshToken returns a random opaque token — deliberately *not*
// a JWT. It carries no claims of its own; the server is the only place
// that knows which user it belongs to (via the refresh_tokens table),
// which is what makes it revocable.
func GenerateRefreshToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// HashToken is used for refresh tokens the same way HashPassword is used
// for passwords: the database only ever stores a hash, so a leaked DB
// backup doesn't hand out live sessions. SHA-256 (not bcrypt) is
// appropriate here — the token is already 256 bits of real entropy, not a
// human-memorable secret, so there's nothing for bcrypt's slow, salted
// hashing to protect against that a fast deterministic hash doesn't.
func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
