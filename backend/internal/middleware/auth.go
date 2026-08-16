package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"closet-backend/internal/dto"
	"closet-backend/internal/utils"
)

const UserIDKey = "user_id"
const UserEmailKey = "user_email"

// RequireAuth validates the "Authorization: Bearer <token>" header on every
// protected route and stores the authenticated user's ID/email on the gin
// context, so handlers never trust a userId/profileId the client sent in
// the body or URL — this is the "user A can never reach user B's wardrobe"
// requirement from the brief, enforced at the edge rather than
// per-handler.
func RequireAuth(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, dto.Fail("missing or malformed Authorization header", "UNAUTHORIZED"))
			return
		}

		tokenStr := strings.TrimPrefix(header, "Bearer ")
		claims, err := utils.ParseAccessToken(jwtSecret, tokenStr)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, dto.Fail("session expired, please sign in again", "TOKEN_INVALID"))
			return
		}

		c.Set(UserIDKey, claims.UserID)
		c.Set(UserEmailKey, claims.Email)
		c.Next()
	}
}

// UserID is a small helper so handlers don't repeat the same type
// assertion and never accidentally proceed with an empty string.
func UserID(c *gin.Context) (string, bool) {
	v, ok := c.Get(UserIDKey)
	if !ok {
		return "", false
	}
	id, ok := v.(string)
	return id, ok && id != ""
}
