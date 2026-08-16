// Package storage is the one abstraction the brief asks for by name:
// everything above it (ItemService, handlers) depends only on the Storage
// interface, never on whether bytes end up on local disk or in Google
// Cloud Storage.
//
//	Handler -> ItemService -> Storage (interface) -> LocalStorage / GCSStorage
//
// Which concrete implementation gets injected is decided exactly once, in
// cmd/api/main.go, based on STORAGE_PROVIDER. Nothing below main.go
// branches on "am I local or cloud".
package storage

import (
	"context"
	"errors"
	"io"
)

// ErrNotFound is returned by Delete/GetURL-adjacent lookups when an
// implementation distinguishes "doesn't exist" from other failures. Delete
// itself does NOT return this — deleting a missing key is treated as
// success (idempotent), which is what makes it safe to call during
// rollback/cleanup without extra existence checks.
var ErrNotFound = errors.New("storage: object not found")

// UploadInput describes a single object to persist. Reader is read to
// completion and the object is stored under Key exactly as given —
// implementations never rename, sanitize, or derive Key from anything
// else, so key construction (see NewItemKey) is entirely the caller's
// responsibility and must never be built from client-supplied input.
type UploadInput struct {
	Key         string
	Reader      io.Reader
	ContentType string
	// Size is a hint for providers that benefit from knowing
	// Content-Length up front. -1 means unknown.
	Size int64
}

// Storage is the abstraction every layer above it depends on.
type Storage interface {
	// Upload persists the object at Key and returns the URL clients should
	// use to fetch it.
	Upload(ctx context.Context, in UploadInput) (url string, err error)

	// Delete removes the object at key. Deleting a key that no longer
	// exists is not an error, which is what makes it safe to call
	// unconditionally during upload-failure rollback and item deletion.
	Delete(ctx context.Context, key string) error

	// GetURL returns the URL for an already-known key without touching the
	// network or filesystem — pure string construction, used when
	// rendering a key that was already stored in Postgres.
	GetURL(key string) string
}

// NewItemKey builds the canonical, non-guessable storage key for one
// wardrobe item's image asset:
//
//	users/{userID}/items/{itemID}/{asset}
//
// userID comes from the authenticated JWT and itemID is a UUID generated
// server-side before the file is stored (see service.ItemService.Create) —
// neither ever comes from client-controlled input, and the key never
// incorporates the original filename. That combination is what rules out
// path traversal and filename-collision attacks without needing to
// sanitize anything: there's nothing user-supplied left to sanitize.
func NewItemKey(userID, itemID, asset string) string {
	return "users/" + userID + "/items/" + itemID + "/" + asset
}
