package dto

import "time"

// --- requests ---

type SignupRequest struct {
	Name     string `json:"name" binding:"required,min=1,max=80"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,strongpassword"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refreshToken" binding:"required"`
}

// --- responses ---

// UserResponse is the *only* shape a User is ever allowed to leave the
// service layer as — no PasswordHash field exists here, so there's no way
// for a handler to accidentally serialize it even under refactor pressure.
//
// Equipped is included here (Phase 4.3) because there is no standalone
// GET /me/equipped endpoint — only PUT /me/equipped (see
// handlers.UserHandler.SetEquipped), which itself returns the updated map
// directly rather than a UserResponse. Without it here, a frontend client
// would have no way at all to learn the doll's equipped state after a
// fresh login/page load, only after the next equip action. Piggybacking
// on the same toUserResponse() mapping used by signup/login/refresh/me
// means every one of those already carries it for free.
type UserResponse struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	Email     string            `json:"email"`
	Avatar    *string           `json:"avatar,omitempty"`
	Equipped  map[string]string `json:"equipped"`
	CreatedAt time.Time         `json:"createdAt"`
}

type AuthResponse struct {
	User         UserResponse `json:"user"`
	AccessToken  string       `json:"accessToken"`
	RefreshToken string       `json:"refreshToken"`
	ExpiresIn    int          `json:"expiresIn"` // seconds, for the client to schedule a silent refresh
}
