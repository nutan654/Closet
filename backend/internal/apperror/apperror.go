// Package apperror defines the small set of typed errors the upload
// subsystem (internal/upload, internal/imageproc, internal/storage,
// internal/service) can return, so every layer surfaces the same
// {code, message, http status} shape instead of ad-hoc strings the
// handler has to guess at. Handlers use As() to turn one of these into the
// existing dto.Fail(message, code) envelope; anything that isn't an
// *apperror.Error falls back to a generic 500.
package apperror

import "net/http"

// Error is a machine-readable application error: Code is stable and safe
// to show clients (and to key metrics/alerts off of), Message is the
// human-readable string the API already returns in dto.Envelope.Message.
type Error struct {
	Code    string
	Message string
	Status  int
}

func (e *Error) Error() string { return e.Message }

func New(code, message string, status int) *Error {
	return &Error{Code: code, Message: message, Status: status}
}

// The exact three codes the brief calls out for file validation, plus one
// for the more general "something about this upload doesn't work"
// (missing file, DB write failed after storage succeeded, etc.) used
// elsewhere in the service layer.
var (
	ErrFileTooLarge        = New("ERR_FILE_TOO_LARGE", "image exceeds the maximum allowed file size", http.StatusRequestEntityTooLarge)
	ErrUnsupportedFileType = New("ERR_UNSUPPORTED_FILE_TYPE", "only JPEG, PNG, and WebP images are supported", http.StatusUnsupportedMediaType)
	ErrInvalidImage        = New("ERR_INVALID_IMAGE", "the uploaded file could not be read as a valid image", http.StatusBadRequest)
)

// As reports whether err is an *Error, mirroring the standard errors.As
// pattern without requiring callers to import errors just for this check.
func As(err error) (*Error, bool) {
	e, ok := err.(*Error)
	return e, ok
}
