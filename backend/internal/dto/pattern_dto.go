package dto

// PatternProcessResponse is what POST /api/v1/patterns/process returns.
// Field names deliberately match patternproxy.ProcessResult /
// pattern-service's own response 1:1 — this endpoint is a thin proxy, not
// a transformation, so there's no reason for the shapes to diverge.
type PatternProcessResponse struct {
	TileDataURL string   `json:"tileDataUrl"`
	Width       int      `json:"width"`
	Height      int      `json:"height"`
	Palette     []string `json:"palette"`
}
