package patternproxy

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestProcess_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/process" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Fatalf("parse multipart: %v", err)
		}
		file, _, err := r.FormFile("image")
		if err != nil {
			t.Fatalf("missing image part: %v", err)
		}
		defer file.Close()

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"tileDataUrl": "data:image/png;base64,abc123",
			"width":       512,
			"height":      512,
			"palette":     []string{"#ff0000", "#00ff00"},
		})
	}))
	defer srv.Close()

	client, err := New(context.Background(), srv.URL, 5*time.Second, false)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	result, err := client.Process(context.Background(), []byte{0xFF, 0xD8, 0xFF}, "fabric.jpg", 512, 5)
	if err != nil {
		t.Fatalf("Process: %v", err)
	}
	if result.Width != 512 || result.Height != 512 {
		t.Errorf("dimensions = %dx%d, want 512x512", result.Width, result.Height)
	}
	if len(result.Palette) != 2 {
		t.Errorf("palette length = %d, want 2", len(result.Palette))
	}
	if !strings.HasPrefix(result.TileDataURL, "data:image/png;base64,") {
		t.Errorf("unexpected tile data url: %s", result.TileDataURL)
	}
}

func TestProcess_UpstreamRejects(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"detail": "could not decode image"})
	}))
	defer srv.Close()

	client, err := New(context.Background(), srv.URL, 5*time.Second, false)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	_, err = client.Process(context.Background(), []byte("garbage"), "bad.jpg", 0, 0)
	if err == nil {
		t.Fatal("expected an error, got nil")
	}
	var upstream *ErrUpstream
	if !asErrUpstream(err, &upstream) {
		t.Fatalf("expected *ErrUpstream, got %T: %v", err, err)
	}
	if upstream.Status != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", upstream.Status)
	}
	if upstream.Detail != "could not decode image" {
		t.Errorf("detail = %q, want %q", upstream.Detail, "could not decode image")
	}
}

func TestProcess_ServiceUnreachable(t *testing.T) {
	// Point at a URL nothing is listening on.
	client, err := New(context.Background(), "http://127.0.0.1:1", 1*time.Second, false)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	_, err = client.Process(context.Background(), []byte("data"), "fabric.jpg", 0, 0)
	if err == nil {
		t.Fatal("expected an error, got nil")
	}
	var unavailable *ErrServiceUnavailable
	if !asErrServiceUnavailable(err, &unavailable) {
		t.Fatalf("expected *ErrServiceUnavailable, got %T: %v", err, err)
	}
}

// small local helpers so this file doesn't need to import "errors" just
// for two one-off type assertions in tests.
func asErrUpstream(err error, target **ErrUpstream) bool {
	if e, ok := err.(*ErrUpstream); ok {
		*target = e
		return true
	}
	return false
}

func asErrServiceUnavailable(err error, target **ErrServiceUnavailable) bool {
	if e, ok := err.(*ErrServiceUnavailable); ok {
		*target = e
		return true
	}
	return false
}
