// Package models holds the domain structs that map to database rows. These
// are what repositories return and what services operate on — but handlers
// never serialize a model straight to JSON (that's what dto is for), so a
// field like PasswordHash can exist here without any risk of ever leaking
// into an API response by accident.
package models

import "time"

type User struct {
	ID           string
	Name         string
	Email        string
	PasswordHash string
	Avatar       *string
	Settings     Settings
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type Settings struct {
	Equipped map[string]string `json:"equipped"`
}

type RefreshToken struct {
	ID        string
	UserID    string
	TokenHash string
	ExpiresAt time.Time
	RevokedAt *time.Time
	CreatedAt time.Time
}

type Item struct {
	ID               string
	UserID           string
	Category         string
	Name             string
	Brand            string
	Price            float64
	PurchaseDate     *string
	ExpiryDate       *string
	Consumable       bool
	InventoryPercent int
	TimesUsed        int
	Status           string
	Notes            string
	Color            string
	Photo            *string
	Worn             int
	Favorite         bool
	Fit              string
	Season           string
	Occasion         string
	Material         string
	Size             string
	Shade            string
	Finish           string
	Subtype          string
	CardStyle        string

	// Image metadata (Phase 3). Postgres stores only these — the actual
	// bytes live wherever storage.Storage put them (local disk in dev,
	// GCS in prod). All pointers because an item can exist with no
	// uploaded image at all (the pre-Phase-3 JSON-only create path still
	// works and simply leaves these nil).
	ImageURL             *string
	ThumbnailURL         *string
	ImageMimeType        *string
	ImageFileSize        *int64
	ImageWidth           *int
	ImageHeight          *int
	ImageStorageKey      *string // used internally to delete the object; never serialized to clients
	ThumbnailStorageKey  *string
	ImageUploadedAt      *time.Time

	// Smart Garment Engine pattern styling (Phase 5.1). All pointers/
	// nullable: an item that never had a pattern applied simply has nil
	// here and renders as a solid color (lib/doll/pattern.js's
	// resolveFillMode on the frontend already handles that fallback).
	// PatternTint is a bool, not a string — the frontend's "tint" toggle
	// means "recolor the pattern using this item's own Color field",
	// not a second independently-stored color.
	PatternURL      *string
	PatternScale    *float64
	PatternOffsetX  *float64
	PatternOffsetY  *float64
	PatternRotation *float64
	PatternTint     *bool

	CreatedAt time.Time
	UpdatedAt time.Time
}

type Outfit struct {
	ID        string
	UserID    string
	Name      string
	Emoji     string
	ItemIDs   []string
	CreatedAt time.Time
}

type WearLogEntry struct {
	ID     string
	ItemID string
	ItemName string
	WornAt time.Time
}
