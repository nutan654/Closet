package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"closet-backend/internal/models"
)

var ErrNotFound = errors.New("not found")
var ErrDuplicate = errors.New("already exists")

// UserRepository is the interface the service layer depends on — Phase 1
// Step 4/3. Services never see *sql.DB directly, which is what makes them
// unit-testable with an in-memory fake instead of a real Postgres instance
// (see internal/service/auth_service_test.go).
type UserRepository interface {
	Create(ctx context.Context, u *models.User) error
	FindByEmail(ctx context.Context, email string) (*models.User, error)
	FindByID(ctx context.Context, id string) (*models.User, error)
	UpdateSettings(ctx context.Context, id string, settings models.Settings) error
}

type userRepository struct {
	db      *sql.DB
	timeout time.Duration
}

func NewUserRepository(db *sql.DB, timeout time.Duration) UserRepository {
	return &userRepository{db: db, timeout: timeout}
}

func (r *userRepository) Create(ctx context.Context, u *models.User) error {
	ctx, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()

	settings, _ := json.Marshal(u.Settings)
	err := r.db.QueryRowContext(ctx, `
		INSERT INTO users (name, email, password_hash, settings)
		VALUES ($1, $2, $3, $4)
		RETURNING id, created_at, updated_at`,
		u.Name, u.Email, u.PasswordHash, settings,
	).Scan(&u.ID, &u.CreatedAt, &u.UpdatedAt)

	if isUniqueViolation(err) {
		return ErrDuplicate
	}
	return err
}

func (r *userRepository) FindByEmail(ctx context.Context, email string) (*models.User, error) {
	ctx, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()

	u := &models.User{}
	var rawSettings []byte
	err := r.db.QueryRowContext(ctx, `
		SELECT id, name, email, password_hash, avatar, settings, created_at, updated_at
		FROM users WHERE email = $1`, email,
	).Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.Avatar, &rawSettings, &u.CreatedAt, &u.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal(rawSettings, &u.Settings)
	return u, nil
}

func (r *userRepository) FindByID(ctx context.Context, id string) (*models.User, error) {
	ctx, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()

	u := &models.User{}
	var rawSettings []byte
	err := r.db.QueryRowContext(ctx, `
		SELECT id, name, email, password_hash, avatar, settings, created_at, updated_at
		FROM users WHERE id = $1`, id,
	).Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.Avatar, &rawSettings, &u.CreatedAt, &u.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal(rawSettings, &u.Settings)
	return u, nil
}

func (r *userRepository) UpdateSettings(ctx context.Context, id string, settings models.Settings) error {
	ctx, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()

	raw, _ := json.Marshal(settings)
	_, err := r.db.ExecContext(ctx, `UPDATE users SET settings = $1, updated_at = now() WHERE id = $2`, raw, id)
	return err
}

// isUniqueViolation checks for Postgres error code 23505 without importing
// the full pq error-code table for one check.
func isUniqueViolation(err error) bool {
	return err != nil && (strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "23505"))
}
