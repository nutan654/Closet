package repository

import (
	"context"
	"database/sql"
	"time"

	"github.com/lib/pq"

	"closet-backend/internal/models"
)

type OutfitRepository interface {
	Create(ctx context.Context, o *models.Outfit) error
	FindByID(ctx context.Context, id string) (*models.Outfit, error)
	ListByUser(ctx context.Context, userID string) ([]models.Outfit, error)
	Update(ctx context.Context, id string, name, emoji *string, itemIDs []string) error
	Delete(ctx context.Context, id string) error
}

type outfitRepository struct {
	db      *sql.DB
	timeout time.Duration
}

func NewOutfitRepository(db *sql.DB, timeout time.Duration) OutfitRepository {
	return &outfitRepository{db: db, timeout: timeout}
}

func (r *outfitRepository) Create(ctx context.Context, o *models.Outfit) error {
	ctx, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()

	return r.db.QueryRowContext(ctx, `
		INSERT INTO outfits (user_id, name, emoji, item_ids)
		VALUES ($1, $2, $3, $4)
		RETURNING id, created_at`,
		o.UserID, o.Name, o.Emoji, pq.Array(o.ItemIDs),
	).Scan(&o.ID, &o.CreatedAt)
}

func (r *outfitRepository) FindByID(ctx context.Context, id string) (*models.Outfit, error) {
	ctx, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()

	o := &models.Outfit{}
	var itemIDs pq.StringArray
	err := r.db.QueryRowContext(ctx, `SELECT id, user_id, name, emoji, item_ids, created_at FROM outfits WHERE id = $1`, id).
		Scan(&o.ID, &o.UserID, &o.Name, &o.Emoji, &itemIDs, &o.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	o.ItemIDs = []string(itemIDs)
	return o, nil
}

func (r *outfitRepository) ListByUser(ctx context.Context, userID string) ([]models.Outfit, error) {
	ctx, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()

	rows, err := r.db.QueryContext(ctx, `SELECT id, user_id, name, emoji, item_ids, created_at FROM outfits WHERE user_id = $1 ORDER BY created_at ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	outfits := []models.Outfit{}
	for rows.Next() {
		var o models.Outfit
		var itemIDs pq.StringArray
		if err := rows.Scan(&o.ID, &o.UserID, &o.Name, &o.Emoji, &itemIDs, &o.CreatedAt); err != nil {
			return nil, err
		}
		o.ItemIDs = []string(itemIDs)
		outfits = append(outfits, o)
	}
	return outfits, rows.Err()
}

func (r *outfitRepository) Update(ctx context.Context, id string, name, emoji *string, itemIDs []string) error {
	ctx, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()

	if name != nil {
		if _, err := r.db.ExecContext(ctx, `UPDATE outfits SET name = $1 WHERE id = $2`, *name, id); err != nil {
			return err
		}
	}
	if emoji != nil {
		if _, err := r.db.ExecContext(ctx, `UPDATE outfits SET emoji = $1 WHERE id = $2`, *emoji, id); err != nil {
			return err
		}
	}
	if itemIDs != nil {
		if _, err := r.db.ExecContext(ctx, `UPDATE outfits SET item_ids = $1 WHERE id = $2`, pq.Array(itemIDs), id); err != nil {
			return err
		}
	}
	return nil
}

func (r *outfitRepository) Delete(ctx context.Context, id string) error {
	ctx, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()

	_, err := r.db.ExecContext(ctx, `DELETE FROM outfits WHERE id = $1`, id)
	return err
}
