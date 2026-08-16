package upload

import (
	"bytes"
	"image"
	"image/jpeg"
	"image/png"
	"testing"

	"closet-backend/internal/apperror"
)

func jpegBytes(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	buf := &bytes.Buffer{}
	if err := jpeg.Encode(buf, img, nil); err != nil {
		t.Fatalf("encode jpeg fixture: %v", err)
	}
	return buf.Bytes()
}

func pngBytes(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	buf := &bytes.Buffer{}
	if err := png.Encode(buf, img); err != nil {
		t.Fatalf("encode png fixture: %v", err)
	}
	return buf.Bytes()
}

func TestDetectImageType_AcceptsAllowedFormats(t *testing.T) {
	cases := map[string][]byte{
		"image/jpeg": jpegBytes(t, 4, 4),
		"image/png":  pngBytes(t, 4, 4),
	}
	for want, data := range cases {
		got, err := DetectImageType(data)
		if err != nil {
			t.Errorf("%s: unexpected error: %v", want, err)
		}
		if got != want {
			t.Errorf("DetectImageType = %q, want %q", got, want)
		}
	}
}

func TestDetectImageType_RejectsDisallowedTypes(t *testing.T) {
	cases := map[string][]byte{
		"plain text":     []byte("hello world, this is not an image at all"),
		"fake extension": append([]byte("%PDF-1.4\n"), make([]byte, 32)...), // PDF magic bytes
	}
	for name, data := range cases {
		_, err := DetectImageType(data)
		if err == nil {
			t.Errorf("%s: expected an error, got nil", name)
			continue
		}
		appErr, ok := apperror.As(err)
		if !ok || appErr.Code != "ERR_UNSUPPORTED_FILE_TYPE" {
			t.Errorf("%s: expected ERR_UNSUPPORTED_FILE_TYPE, got %v", name, err)
		}
	}
}

func TestDetectImageType_RejectsEmpty(t *testing.T) {
	_, err := DetectImageType(nil)
	appErr, ok := apperror.As(err)
	if !ok || appErr.Code != "ERR_INVALID_IMAGE" {
		t.Errorf("expected ERR_INVALID_IMAGE for empty input, got %v", err)
	}
}

func TestCheckSize(t *testing.T) {
	if err := CheckSize(5, 10); err != nil {
		t.Errorf("5 <= 10 should pass, got %v", err)
	}
	if err := CheckSize(10, 10); err != nil {
		t.Errorf("10 == 10 should pass, got %v", err)
	}
	err := CheckSize(11, 10)
	appErr, ok := apperror.As(err)
	if !ok || appErr.Code != "ERR_FILE_TOO_LARGE" {
		t.Errorf("expected ERR_FILE_TOO_LARGE for 11 > 10, got %v", err)
	}
}
