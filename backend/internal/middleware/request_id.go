package middleware

import (
	"context"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const RequestIDKey = "request_id"
const RequestIDHeader = "X-Request-ID"

// requestIDCtxKey is a distinct type (not string) so this never collides
// with another package's context key, per the standard context.WithValue
// guidance.
type requestIDCtxKey struct{}

// RequestID assigns a correlation ID to every request (reusing one the
// client sent, if any — useful when this API sits behind a gateway that
// already generates one) and echoes it back in the response header. It's
// stored both on gin.Context (for handler/middleware code, as before) and
// on the underlying request's context.Context, so it's also available to
// service-layer code below the handler — e.g. ItemService's upload
// logging (Phase 3 Step 13) — via RequestIDFromContext(ctx), without the
// service layer needing to know about gin at all.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader(RequestIDHeader)
		if id == "" {
			id = uuid.NewString()
		}
		c.Set(RequestIDKey, id)
		c.Header(RequestIDHeader, id)
		c.Request = c.Request.WithContext(context.WithValue(c.Request.Context(), requestIDCtxKey{}, id))
		c.Next()
	}
}

// RequestIDFromContext retrieves the request ID set by RequestID() from a
// plain context.Context (e.g. c.Request.Context(), as passed into service
// methods). Returns "" if none is set.
func RequestIDFromContext(ctx context.Context) string {
	id, _ := ctx.Value(requestIDCtxKey{}).(string)
	return id
}
