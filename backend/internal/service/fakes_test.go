package service

import (
	"context"
	"time"

	"closet-backend/internal/models"
	"closet-backend/internal/repository"
)

// fakeUserRepository is an in-memory stand-in for repository.UserRepository.
// This is the payoff of Phase 1's repository-pattern refactor: AuthService
// can be fully unit-tested without a real Postgres instance, because it
// only ever talks to the UserRepository *interface*.
type fakeUserRepository struct {
	byEmail map[string]*models.User
	byID    map[string]*models.User
	nextID  int
}

func newFakeUserRepository() *fakeUserRepository {
	return &fakeUserRepository{byEmail: map[string]*models.User{}, byID: map[string]*models.User{}}
}

func (f *fakeUserRepository) Create(ctx context.Context, u *models.User) error {
	if _, exists := f.byEmail[u.Email]; exists {
		return repository.ErrDuplicate
	}
	f.nextID++
	u.ID = itoaTest(f.nextID)
	f.byEmail[u.Email] = u
	f.byID[u.ID] = u
	return nil
}

func (f *fakeUserRepository) FindByEmail(ctx context.Context, email string) (*models.User, error) {
	u, ok := f.byEmail[email]
	if !ok {
		return nil, repository.ErrNotFound
	}
	return u, nil
}

func (f *fakeUserRepository) FindByID(ctx context.Context, id string) (*models.User, error) {
	u, ok := f.byID[id]
	if !ok {
		return nil, repository.ErrNotFound
	}
	return u, nil
}

func (f *fakeUserRepository) UpdateSettings(ctx context.Context, id string, settings models.Settings) error {
	u, ok := f.byID[id]
	if !ok {
		return repository.ErrNotFound
	}
	u.Settings = settings
	return nil
}

// fakeRefreshTokenRepository is an in-memory stand-in for
// repository.RefreshTokenRepository.
type fakeRefreshTokenRepository struct {
	byHash map[string]*models.RefreshToken
	nextID int
}

func newFakeRefreshTokenRepository() *fakeRefreshTokenRepository {
	return &fakeRefreshTokenRepository{byHash: map[string]*models.RefreshToken{}}
}

func (f *fakeRefreshTokenRepository) Store(ctx context.Context, t *models.RefreshToken) error {
	f.nextID++
	t.ID = itoaTest(f.nextID)
	f.byHash[t.TokenHash] = t
	return nil
}

func (f *fakeRefreshTokenRepository) FindByHash(ctx context.Context, hash string) (*models.RefreshToken, error) {
	t, ok := f.byHash[hash]
	if !ok {
		return nil, repository.ErrNotFound
	}
	return t, nil
}

func (f *fakeRefreshTokenRepository) Revoke(ctx context.Context, id string) error {
	for _, t := range f.byHash {
		if t.ID == id {
			now := time.Now()
			t.RevokedAt = &now
			return nil
		}
	}
	return repository.ErrNotFound
}

func (f *fakeRefreshTokenRepository) RevokeAllForUser(ctx context.Context, userID string) error {
	now := time.Now()
	for _, t := range f.byHash {
		if t.UserID == userID {
			t.RevokedAt = &now
		}
	}
	return nil
}

func itoaTest(i int) string {
	digits := "0123456789"
	if i == 0 {
		return "0"
	}
	buf := []byte{}
	for i > 0 {
		buf = append([]byte{digits[i%10]}, buf...)
		i /= 10
	}
	return "user_" + string(buf)
}
