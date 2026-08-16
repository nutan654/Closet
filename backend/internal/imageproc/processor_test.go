package imageproc

import (
	"bytes"
	"image"
	"image/jpeg"
	"testing"

	"closet-backend/internal/apperror"
)

func fixtureJPEG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	buf := &bytes.Buffer{}
	if err := jpeg.Encode(buf, img, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatalf("encode fixture: %v", err)
	}
	return buf.Bytes()
}

func testConfig() Config {
	return Config{MaxWidth: 100, MaxHeight: 100, ThumbnailWidth: 20, ThumbnailHeight: 20, JPEGQuality: 80}
}

func TestProcess_WithinLimits_OriginalBytesUntouched(t *testing.T) {
	p := New(testConfig())
	raw := fixtureJPEG(t, 50, 40)

	out, err := p.Process(raw, "image/jpeg")
	if err != nil {
		t.Fatalf("Process: %v", err)
	}

	if !bytes.Equal(out.OriginalBytes, raw) {
		t.Error("expected original bytes to be stored untouched when already within max dimensions")
	}
	if out.OriginalWidth != 50 || out.OriginalHeight != 40 {
		t.Errorf("dimensions = %dx%d, want 50x40", out.OriginalWidth, out.OriginalHeight)
	}
	if out.OriginalMimeType != "image/jpeg" {
		t.Errorf("mime type = %q, want image/jpeg", out.OriginalMimeType)
	}
}

func TestProcess_OversizedImage_IsResizedPreservingAspectRatio(t *testing.T) {
	p := New(testConfig())
	// 200x100 exceeds MaxWidth=100 — should scale to 100x50.
	raw := fixtureJPEG(t, 200, 100)

	out, err := p.Process(raw, "image/jpeg")
	if err != nil {
		t.Fatalf("Process: %v", err)
	}

	if out.OriginalWidth != 100 || out.OriginalHeight != 50 {
		t.Errorf("resized dimensions = %dx%d, want 100x50 (aspect ratio preserved)", out.OriginalWidth, out.OriginalHeight)
	}
	if bytes.Equal(out.OriginalBytes, raw) {
		t.Error("expected original bytes to be re-encoded after resize")
	}
}

func TestProcess_AlwaysGeneratesThumbnailWithinBounds(t *testing.T) {
	p := New(testConfig())
	raw := fixtureJPEG(t, 200, 100)

	out, err := p.Process(raw, "image/jpeg")
	if err != nil {
		t.Fatalf("Process: %v", err)
	}

	if out.ThumbnailWidth > 20 || out.ThumbnailHeight > 20 {
		t.Errorf("thumbnail = %dx%d, want within 20x20", out.ThumbnailWidth, out.ThumbnailHeight)
	}
	if len(out.ThumbnailBytes) == 0 {
		t.Error("expected non-empty thumbnail bytes")
	}
	// Decoding the thumbnail bytes back as JPEG confirms it round-trips.
	if _, err := jpeg.Decode(bytes.NewReader(out.ThumbnailBytes)); err != nil {
		t.Errorf("thumbnail bytes did not decode as JPEG: %v", err)
	}
}

func TestProcess_NeverUpscalesSmallImages(t *testing.T) {
	p := New(testConfig())
	raw := fixtureJPEG(t, 5, 5)

	out, err := p.Process(raw, "image/jpeg")
	if err != nil {
		t.Fatalf("Process: %v", err)
	}
	if out.ThumbnailWidth != 5 || out.ThumbnailHeight != 5 {
		t.Errorf("thumbnail of a 5x5 source = %dx%d, want 5x5 (no upscaling)", out.ThumbnailWidth, out.ThumbnailHeight)
	}
}

func TestProcess_RejectsMalformedImage(t *testing.T) {
	p := New(testConfig())
	_, err := p.Process([]byte("this is not a real jpeg file at all"), "image/jpeg")
	appErr, ok := apperror.As(err)
	if !ok || appErr.Code != "ERR_INVALID_IMAGE" {
		t.Errorf("expected ERR_INVALID_IMAGE for malformed data, got %v", err)
	}
}

func TestProcess_RejectsUnsupportedMimeType(t *testing.T) {
	p := New(testConfig())
	_, err := p.Process(fixtureJPEG(t, 10, 10), "image/gif")
	appErr, ok := apperror.As(err)
	if !ok || appErr.Code != "ERR_UNSUPPORTED_FILE_TYPE" {
		t.Errorf("expected ERR_UNSUPPORTED_FILE_TYPE for image/gif, got %v", err)
	}
}
