// Package dto holds every request/response shape the API actually speaks —
// deliberately separate from internal/models so a database column can be
// renamed, added, or removed without silently changing the public API
// contract (and so password_hash, internal timestamps, etc. never leak).
package dto

// Envelope is the one response shape every endpoint returns — Phase 1
// Step 13. Success responses carry Data; error responses carry Error (a
// short machine-readable code, e.g. "ITEM_NOT_FOUND") on top of the
// human-readable Message. Data is `omitempty` so error responses don't
// show a stray `"data":null`, and Error is `omitempty` for the same reason
// on success responses.
type Envelope struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

func Ok(message string, data interface{}) Envelope {
	return Envelope{Success: true, Message: message, Data: data}
}

func Fail(message, code string) Envelope {
	return Envelope{Success: false, Message: message, Error: code}
}
