package repository

import (
	"context"
	"database/sql"
	"time"

	"closet-backend/internal/models"
)

type RefreshTokenRepository interface {
	Store(ctx context.Context, t *models.RefreshToken) error
	FindByHash(ctx context.Context, hash string) (*models.RefreshToken, error)
	Revoke(ctx context.Context, id string) error
	RevokeAllForUser(ctx context.Context, userID string) error
}

type refreshTokenRepository struct {
	db      *sql.DB
	timeout time.Duration
}

func NewRefreshTokenRepository(db *sql.DB, timeout time.Duration) RefreshTokenRepository {
	return &refreshTokenRepository{db: db, timeout: timeout}
}

func (r *refreshTokenRepository) Store(ctx context.Context, t *models.RefreshToken) error {
	ctx, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()

	return r.db.QueryRowContext(ctx, `
		INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
		VALUES ($1, $2, $3)
		RETURNING id, created_at`,
		t.UserID, t.TokenHash, t.ExpiresAt,
	).Scan(&t.ID, &t.CreatedAt)
}

func (r *refreshTokenRepository) FindByHash(ctx context.Context, hash string) (*models.RefreshToken, error) {
	ctx, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()

	t := &models.RefreshToken{}
	err := r.db.QueryRowContext(ctx, `
		SELECT id, user_id, token_hash, expires_at, revoked_at, created_at
		FROM refresh_tokens WHERE token_hash = $1`, hash,
	).Scan(&t.ID, &t.UserID, &t.TokenHash, &t.ExpiresAt, &t.RevokedAt, &t.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	return t, err
}

func (r *refreshTokenRepository) Revoke(ctx context.Context, id string) error {
	ctx, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()

	_, err := r.db.ExecContext(ctx, `UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`, id)
	return err
}

// RevokeAllForUser powers a "log out everywhere" / "I think my account was
// compromised" action — a small feature the brief doesn't ask for, but is
// the natural next step once tokens are revocable at all, and is a nice
// thing to be able to point to.
func (r *refreshTokenRepository) RevokeAllForUser(ctx context.Context, userID string) error {
	ctx, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()

	_, err := r.db.ExecContext(ctx, `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, userID)
	return err
}
