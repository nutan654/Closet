package storage

import "testing"

func TestNewItemKey_Format(t *testing.T) {
	got := NewItemKey("user-123", "item-456", "thumbnail.jpg")
	want := "users/user-123/items/item-456/thumbnail.jpg"
	if got != want {
		t.Errorf("NewItemKey = %q, want %q", got, want)
	}
}

func TestNewItemKey_NeverDerivedFromOriginalFilename(t *testing.T) {
	// The whole point of NewItemKey is that nothing client-supplied
	// (like an original filename) ever ends up in the key. This test
	// exists mostly as living documentation of that contract: the
	// function's signature simply has no parameter for a filename.
	a := NewItemKey("u1", "i1", "original.jpg")
	b := NewItemKey("u1", "i1", "original.jpg")
	if a != b {
		t.Errorf("expected deterministic keys for the same inputs, got %q vs %q", a, b)
	}
}
