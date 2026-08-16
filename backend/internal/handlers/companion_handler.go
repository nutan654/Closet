package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"closet-backend/internal/companion"
	"closet-backend/internal/dto"
	"closet-backend/internal/middleware"
	"closet-backend/internal/service"
	"closet-backend/internal/weather"
)

// CompanionHandler powers Bear, the chat on the "Companion"/Bear tab
// (app/companion/page.js). Deliberately stateless server-side: the
// frontend keeps the visible message history in React state and resends
// it on every request (see lib/api/companion.js) rather than this handler
// persisting a chat session in Postgres — the brief never asked for chat
// history to survive a reload, and adding a new table/migration for it
// would be scope no one asked for. Each request is independently
// authenticated (middleware.RequireAuth), so Bear only ever sees the
// calling user's own wardrobe.
type CompanionHandler struct {
	ai      *companion.Client
	items   *service.ItemService
	weather *weather.Client
}

// NewCompanionHandler wires Bear's AI client and item lookup together.
// weatherClient may be nil — weather is a nice-to-have enrichment, never
// a requirement for Bear to respond (and req.Lat/Lon are simply zero if
// the frontend hasn't sent geolocation, in which case weather is skipped
// entirely without touching weatherClient).
func NewCompanionHandler(ai *companion.Client, items *service.ItemService, weatherClient *weather.Client) *CompanionHandler {
	return &CompanionHandler{ai: ai, items: items, weather: weatherClient}
}

type companionChatRequest struct {
	Message string                  `json:"message" binding:"required,min=1,max=2000"`
	History []companionHistoryEntry `json:"history"`

	// Lat/Lon are optional and come from the browser's geolocation (see
	// app/companion/page.js). When both are present and non-zero, Bear's
	// prompt is enriched with today's weather at that point so outfit
	// suggestions ("grab a raincoat") are grounded in something real
	// instead of guessed.
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
}

type companionHistoryEntry struct {
	Role string `json:"role" binding:"required,oneof=user assistant"`
	Text string `json:"text" binding:"required"`
}

type companionChatResponse struct {
	Reply string `json:"reply"`
}

// Chat godoc
// @Summary      Chat with Bear about the user's own wardrobe
// @Tags         companion
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body body companionChatRequest true "message + prior turns"
// @Success      200 {object} dto.Envelope{data=companionChatResponse}
// @Failure      400 {object} dto.Envelope
// @Failure      503 {object} dto.Envelope
// @Failure      502 {object} dto.Envelope
// @Router       /api/v1/companion/chat [post]
func (h *CompanionHandler) Chat(c *gin.Context) {
	userID, _ := middleware.UserID(c)

	var req companionChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, dto.Fail("message is required", "VALIDATION_ERROR"))
		return
	}

	if !h.ai.Enabled() {
		c.JSON(http.StatusServiceUnavailable, dto.Fail(
			"Bear isn't set up yet — ask whoever runs this to add a GEMINI_API_KEY.",
			"ERR_COMPANION_NOT_CONFIGURED",
		))
		return
	}

	systemPrompt := h.buildSystemPrompt(c, userID, req.Lat, req.Lon)

	history := make([]companion.Message, 0, len(req.History)+1)
	for _, turn := range req.History {
		history = append(history, companion.Message{Role: turn.Role, Text: turn.Text})
	}
	history = append(history, companion.Message{Role: "user", Text: req.Message})

	reply, err := h.ai.Chat(c.Request.Context(), systemPrompt, history)
	if err != nil {
		writeCompanionError(c, err)
		return
	}

	c.JSON(http.StatusOK, dto.Ok("", companionChatResponse{Reply: reply}))
}

// bearPersona is Bear's fixed voice: cozy, whimsical, a little playful,
// with a light sprinkle of bear-themed phrasing — never so much that it
// gets in the way of an actually useful answer.
const bearPersona = "You are Bear, the warm, whimsical, honey-loving closet " +
	"companion inside the LifeCloset app. You speak in a cozy, cute tone and " +
	"sprinkle in a little bear-themed phrasing here and there (things like " +
	"\"pawsitive\", \"bear-y good\", \"sweet as honey\") — naturally, not in " +
	"every sentence. You're an enthusiastic, practical fashion helper who " +
	"wants the person to feel confident and comfortable in what they already " +
	"own. Keep replies short (2-4 sentences), warm, and never pushy about " +
	"buying anything new. If you don't have enough information to answer " +
	"specifically, say so and ask one short clarifying question."

// buildSystemPrompt gives Bear real context about the caller's own
// wardrobe (up to 40 items, name/category/inventory only — never photos,
// prices, or anything not needed for styling chat), which of those items
// are expiring soon, and — when coordinates were supplied — today's
// weather, so answers like "what should I wear today" or "do I need to
// toss anything" aren't generic. Falls back gracefully at each step: a
// failed item lookup or weather call makes the prompt a little less
// personalized, never a hard failure that blocks the whole feature.
func (h *CompanionHandler) buildSystemPrompt(c *gin.Context, userID string, lat, lon float64) string {
	var b strings.Builder
	b.WriteString(bearPersona)

	page, err := h.items.List(c.Request.Context(), userID, "", 1, 40)
	var items []dto.ItemResponse
	if err == nil {
		items, _ = page.Items.([]dto.ItemResponse)
	}

	if len(items) > 0 {
		b.WriteString("\n\nHere is what's currently in their closet (name — category, color" +
			", and, for consumables, how full it is):\n")
		for _, it := range items {
			fmt.Fprintf(&b, "- %s — %s, %s", it.Name, it.Category, it.Color)
			if it.Consumable {
				fmt.Fprintf(&b, ", %d%% left", it.InventoryPercent)
			}
			b.WriteString("\n")
		}

		if expiring := expiringSoon(items, 30); expiring != "" {
			b.WriteString("\n⏰ Items expiring within 30 days — gently mention these if the " +
				"conversation touches on cosmetics, skincare, or what to use up next, " +
				"so nothing gets used past its expiry:\n")
			b.WriteString(expiring)
		}
	}

	if h.weather != nil && (lat != 0 || lon != 0) {
		if snap, err := h.weather.Current(c.Request.Context(), lat, lon); err == nil {
			fmt.Fprintf(&b, "\n\n🌤️ Today's weather where they are: %s, %.0f°C (feels like %.0f°C), "+
				"%d%% chance of rain. Use this to inform outfit suggestions when relevant "+
				"(e.g. a raincoat if it's wet, breathable fabrics if it's hot).\n",
				snap.Description, snap.TempC, snap.FeelsLikeC, snap.PrecipitationP)
		}
	}

	return b.String()
}

// expiringSoon returns a "- Name (expires Jan 2, 2026)" line per item
// whose ExpiryDate falls within windowDays of today, oldest expiry
// first. Items with no expiry date, or a date the app couldn't parse
// (should never happen given the date-input on the item form, but a bad
// value shouldn't crash the prompt), are silently skipped.
func expiringSoon(items []dto.ItemResponse, windowDays int) string {
	type expiring struct {
		name string
		date time.Time
	}

	now := time.Now()
	cutoff := now.AddDate(0, 0, windowDays)

	var soon []expiring
	for _, it := range items {
		if it.ExpiryDate == nil || *it.ExpiryDate == "" {
			continue
		}
		d, err := time.Parse("2006-01-02", *it.ExpiryDate)
		if err != nil {
			continue
		}
		if d.After(now) && d.Before(cutoff) {
			soon = append(soon, expiring{name: it.Name, date: d})
		}
	}
	if len(soon) == 0 {
		return ""
	}

	for i := 1; i < len(soon); i++ {
		for j := i; j > 0 && soon[j].date.Before(soon[j-1].date); j-- {
			soon[j], soon[j-1] = soon[j-1], soon[j]
		}
	}

	var b strings.Builder
	for _, e := range soon {
		fmt.Fprintf(&b, "- %s (expires %s)\n", e.name, e.date.Format("Jan 2, 2006"))
	}
	return b.String()
}

func writeCompanionError(c *gin.Context, err error) {
	var notConfigured *companion.ErrNotConfigured
	if errors.As(err, &notConfigured) {
		c.JSON(http.StatusServiceUnavailable, dto.Fail(
			"Bear isn't set up yet — ask whoever runs this to add a GEMINI_API_KEY.",
			"ERR_COMPANION_NOT_CONFIGURED",
		))
		return
	}

	var upstream *companion.ErrUpstream
	if errors.As(err, &upstream) {
		c.JSON(http.StatusBadGateway, dto.Fail("Bear is having trouble thinking right now — try again in a moment.", "ERR_COMPANION_UPSTREAM"))
		return
	}

	c.JSON(http.StatusBadGateway, dto.Fail("Bear is having trouble thinking right now — try again in a moment.", "ERR_COMPANION_UPSTREAM"))
}
