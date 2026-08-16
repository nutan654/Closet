package dto

import "time"

// ItemRequest carries both `json` and `form` tags so gin's c.ShouldBind
// can bind the same struct from either an application/json body (the
// original create path) or a multipart/form-data request (Phase 3 —
// POST /api/v1/items with an attached image), selecting the right binder
// automatically based on Content-Type. See handlers.ItemHandler.Create.
type ItemRequest struct {
	Category         string  `json:"category" form:"category" binding:"required,oneof=tops bottoms dresses outerwear shoes bags accessories skincare makeup haircare fragrance jewelry supplements"`
	Name             string  `json:"name" form:"name" binding:"required,min=1,max=120"`
	Brand            string  `json:"brand" form:"brand" binding:"max=80"`
	Price            float64 `json:"price" form:"price" binding:"gte=0"`
	PurchaseDate     string  `json:"purchaseDate" form:"purchaseDate"`
	ExpiryDate       string  `json:"expiryDate" form:"expiryDate"`
	Consumable       bool    `json:"consumable" form:"consumable"`
	InventoryPercent int     `json:"inventoryPercent" form:"inventoryPercent" binding:"gte=0,lte=100"`
	Status           string  `json:"status" form:"status"`
	Notes            string  `json:"notes" form:"notes" binding:"max=500"`
	Color            string  `json:"color" form:"color" binding:"required,hexcolor"`
	// Photo is a legacy free-text photo URL, kept for the JSON-only create
	// path (e.g. a client that already hosts its own image somewhere).
	// It's ignored when an `image` file part is present — the uploaded
	// file always wins. See service.ItemService.Create.
	Photo     string `json:"photo" form:"photo"`
	Fit       string `json:"fit" form:"fit"`
	Season    string `json:"season" form:"season"`
	Occasion  string `json:"occasion" form:"occasion"`
	Material  string `json:"material" form:"material"`
	Size      string `json:"size" form:"size"`
	Shade     string `json:"shade" form:"shade"`
	Finish    string `json:"finish" form:"finish"`
	Subtype   string `json:"subtype" form:"subtype"`
	CardStyle string `json:"cardStyle" form:"cardStyle"`

	// Phase 5.1 — pattern styling is never sent on the JSON-only create
	// path today (AddItemSheet doesn't collect it — pattern editing only
	// happens post-creation via PATCH, see lib/StoreContext.jsx), but
	// accepted here too so a future create-with-pattern flow doesn't need
	// a second DTO. Bounds mirror lib/doll/pattern.js's PATTERN_SCALE_MIN/
	// MAX (0.25–4) and the -40..40 slider range in PatternControls.jsx.
	PatternURL      *string  `json:"patternUrl" form:"patternUrl"`
	PatternScale    *float64 `json:"patternScale" form:"patternScale" binding:"omitempty,gte=0.25,lte=4"`
	PatternOffsetX  *float64 `json:"patternOffsetX" form:"patternOffsetX" binding:"omitempty,gte=-100,lte=100"`
	PatternOffsetY  *float64 `json:"patternOffsetY" form:"patternOffsetY" binding:"omitempty,gte=-100,lte=100"`
	PatternRotation *float64 `json:"patternRotation" form:"patternRotation" binding:"omitempty,gte=-360,lte=360"`
	PatternTint     *bool    `json:"patternTint" form:"patternTint"`
}

// ItemPatchRequest mirrors ItemRequest but every field is optional (a
// pointer), so PATCH only touches fields the client actually sent — same
// intent as the old map[string]interface{} patch, but type-checked.
type ItemPatchRequest struct {
	Category         *string  `json:"category" binding:"omitempty,oneof=tops bottoms dresses outerwear shoes bags accessories skincare makeup haircare fragrance jewelry supplements"`
	Name             *string  `json:"name" binding:"omitempty,min=1,max=120"`
	Brand            *string  `json:"brand" binding:"omitempty,max=80"`
	Price            *float64 `json:"price" binding:"omitempty,gte=0"`
	Consumable       *bool    `json:"consumable"`
	InventoryPercent *int     `json:"inventoryPercent" binding:"omitempty,gte=0,lte=100"`
	Status           *string  `json:"status"`
	Notes            *string  `json:"notes" binding:"omitempty,max=500"`
	Color            *string  `json:"color" binding:"omitempty,hexcolor"`
	Photo            *string  `json:"photo"`
	Favorite         *bool    `json:"favorite"`
	Fit              *string  `json:"fit"`
	Season           *string  `json:"season"`
	Occasion         *string  `json:"occasion"`
	Material         *string  `json:"material"`
	Size             *string  `json:"size"`
	Shade            *string  `json:"shade"`
	Finish           *string  `json:"finish"`
	Subtype          *string  `json:"subtype"`
	CardStyle        *string  `json:"cardStyle"`

	// Phase 5.1 fix: these were present on ItemRequest (create) but missing
	// here, so PATCH — the only path PatternControls.jsx / StoreContext.jsx's
	// setPatternStyle-then-save flow actually uses — could never persist a
	// pattern edit. Same bounds as ItemRequest, same migration 0003 columns.
	PatternURL      *string  `json:"patternUrl"`
	PatternScale    *float64 `json:"patternScale" binding:"omitempty,gte=0.25,lte=4"`
	PatternOffsetX  *float64 `json:"patternOffsetX" binding:"omitempty,gte=-100,lte=100"`
	PatternOffsetY  *float64 `json:"patternOffsetY" binding:"omitempty,gte=-100,lte=100"`
	PatternRotation *float64 `json:"patternRotation" binding:"omitempty,gte=-360,lte=360"`
	PatternTint     *bool    `json:"patternTint"`
	// ClearPattern: a plain `*string` PatternURL can't tell "the client
	// didn't send this field" apart from "the client sent patternUrl: null"
	// — both decode to a nil pointer. PatternControls.jsx's "Remove" button
	// does the latter (see components/PatternControls.jsx: `patch({
	// patternUrl: null })`), so without an explicit flag that action would
	// silently no-op server-side instead of clearing the stored pattern.
	// The frontend sets this to true whenever it sends patternUrl: null.
	ClearPattern *bool `json:"clearPattern"`
}

type ItemResponse struct {
	ID               string    `json:"id"`
	Category         string    `json:"category"`
	Name             string    `json:"name"`
	Brand            string    `json:"brand"`
	Price            float64   `json:"price"`
	PurchaseDate     *string   `json:"purchaseDate,omitempty"`
	ExpiryDate       *string   `json:"expiryDate,omitempty"`
	Consumable       bool      `json:"consumable"`
	InventoryPercent int       `json:"inventoryPercent"`
	TimesUsed        int       `json:"timesUsed"`
	Status           string    `json:"status"`
	Notes            string    `json:"notes"`
	Color            string    `json:"color"`
	Photo            *string   `json:"photo,omitempty"`
	Worn             int       `json:"worn"`
	Favorite         bool      `json:"favorite"`
	Fit              string    `json:"fit"`
	Season           string    `json:"season"`
	Occasion         string    `json:"occasion"`
	Material         string    `json:"material"`
	Size             string    `json:"size"`
	Shade            string    `json:"shade"`
	Finish           string    `json:"finish"`
	Subtype          string    `json:"subtype"`
	CardStyle        string    `json:"cardStyle"`

	// Image fields (Phase 3). Omitted entirely when the item has no
	// uploaded image. Note there's no storage key here — that's an
	// internal detail the service layer needs to delete the right object
	// later, not something clients should see or depend on.
	ImageURL        *string    `json:"imageUrl,omitempty"`
	ThumbnailURL    *string    `json:"thumbnailUrl,omitempty"`
	ImageMimeType   *string    `json:"imageMimeType,omitempty"`
	ImageFileSize   *int64     `json:"imageFileSize,omitempty"`
	ImageWidth      *int       `json:"imageWidth,omitempty"`
	ImageHeight     *int       `json:"imageHeight,omitempty"`
	ImageUploadedAt *time.Time `json:"imageUploadedAt,omitempty"`

	// Phase 5.1 fix: these existed on the Item model and the migration
	// since Phase 5.1 landed, but were never added here — so even a
	// successfully-stored pattern was invisible to every GET /items call,
	// meaning the frontend had nothing to hydrate on reload regardless of
	// what the database actually held. Not `omitempty`: the frontend
	// mapper (lib/api/mappers.js toFrontendItem) treats a present-but-null
	// patternUrl as "no pattern, render solid color" — an explicit null is
	// the correct, unambiguous signal, not an absent key.
	PatternURL      *string  `json:"patternUrl"`
	PatternScale    *float64 `json:"patternScale,omitempty"`
	PatternOffsetX  *float64 `json:"patternOffsetX,omitempty"`
	PatternOffsetY  *float64 `json:"patternOffsetY,omitempty"`
	PatternRotation *float64 `json:"patternRotation,omitempty"`
	PatternTint     *bool    `json:"patternTint,omitempty"`

	CreatedAt time.Time `json:"createdAt"`
}

// PageResponse wraps any list endpoint with pagination metadata — my own
// addition beyond the brief; the original endpoints returned bare arrays
// with no way for a client to know if there's more to fetch.
type PageResponse struct {
	Items      interface{} `json:"items"`
	Total      int         `json:"total"`
	Page       int         `json:"page"`
	PerPage    int         `json:"perPage"`
	TotalPages int         `json:"totalPages"`
}

type OutfitRequest struct {
	Name    string   `json:"name" binding:"required,min=1,max=80"`
	Emoji   string   `json:"emoji" binding:"max=8"`
	ItemIDs []string `json:"itemIds"`
}

type OutfitPatchRequest struct {
	Name    *string  `json:"name" binding:"omitempty,min=1,max=80"`
	Emoji   *string  `json:"emoji" binding:"omitempty,max=8"`
	ItemIDs []string `json:"itemIds"`
}

type OutfitResponse struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Emoji     string    `json:"emoji"`
	ItemIDs   []string  `json:"itemIds"`
	CreatedAt time.Time `json:"createdAt"`
}

type EquippedRequest struct {
	Slot   string  `json:"slot" binding:"required"`
	ItemID *string `json:"itemId"`
}
