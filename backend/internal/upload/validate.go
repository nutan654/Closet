// Package upload validates raw upload bytes before anything decodes them
// as an image or hands them to storage — Phase 3 Step 3. It only ever
// looks at the bytes themselves (size, magic-number content sniffing),
// never the client-supplied Content-Type header or filename, since both
// are trivially spoofable.
package upload

import (
	"net/http"
	"strings"

	"closet-backend/internal/apperror"
)

// AllowedImageTypes is the exact allowlist from the brief. Detected via
// content sniffing only — anything else (an .exe renamed to .jpg, an SVG
// with embedded script, a PDF, etc.) is rejected regardless of extension
// or the client's Content-Type header.
var AllowedImageTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/webp": true,
}

// CheckSize rejects an upload against a byte-count ceiling. Callers should
// call this twice: once against the client-reported size (cheap, before
// reading anything) and once against len(actual bytes read) (authoritative
// — a client can lie about Content-Length, so the first check alone is
// only an optimization, never the real guard).
func CheckSize(size, maxBytes int64) error {
	if maxBytes <= 0 {
		return nil
	}
	if size > maxBytes {
		return apperror.ErrFileTooLarge
	}
	return nil
}

// DetectImageType sniffs the real content type from the file's magic
// bytes and rejects anything outside AllowedImageTypes. It never trusts
// the Content-Type the client sent in the multipart part.
func DetectImageType(data []byte) (string, error) {
	if len(data) == 0 {
		return "", apperror.ErrInvalidImage
	}

	sniffed := http.DetectContentType(data)
	// http.DetectContentType can return a type with a parameter, e.g.
	// "text/plain; charset=utf-8" — none of the image types we allow
	// carry parameters, but strip defensively rather than assume.
	base := sniffed
	if i := strings.IndexByte(sniffed, ';'); i >= 0 {
		base = strings.TrimSpace(sniffed[:i])
	}

	if !AllowedImageTypes[base] {
		return "", apperror.ErrUnsupportedFileType
	}
	return base, nil
}
