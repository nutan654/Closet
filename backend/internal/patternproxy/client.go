// Package patternproxy is a thin HTTP client for the Phase 5 pattern
// microservice (pattern-service/, Python/FastAPI). It exists so the Go API
// stays the single entry point clients talk to — the frontend never calls
// the Python service directly — while the actual pixel work (seamless
// tiling, palette extraction) lives where Pillow/numpy make it easy.
//
// Deliberately minimal: one method, one request shape, one response
// shape. If a future phase adds more pattern operations, they get their
// own methods here rather than a generic "call any endpoint" helper —
// keeping the same explicit-over-clever style as the rest of the backend.
package patternproxy

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"time"

	"google.golang.org/api/idtoken"
)

type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

// New builds the pattern-service client. useIDToken should be false for
// local dev (docker-compose's plain-HTTP pattern-service needs no auth)
// and true only if the pattern service is deployed somewhere that issues
// Google ID tokens (e.g. Cloud Run with --no-allow-unauthenticated) — in
// that case every request is signed with a Google ID token scoped to
// baseURL, fetched via Application Default Credentials. If useIDToken is
// false, an ordinary *http.Client is used instead.
//
// apiKey is the free-tier alternative: on a host like Render, where the
// pattern service has no choice but to be a public URL (no private
// service on the free plan), apiKey is sent as X-API-Key on every
// request so the endpoint isn't open to the whole internet. Leave it
// empty when the pattern service isn't internet-reachable at all (e.g.
// docker-compose) — the header is simply omitted and the service accepts
// any caller, matching PATTERN_SERVICE_API_KEY being unset on that side.
func New(ctx context.Context, baseURL string, timeout time.Duration, useIDToken bool, apiKey string) (*Client, error) {
	if timeout <= 0 {
		timeout = 15 * time.Second
	}

	if !useIDToken {
		return &Client{baseURL: baseURL, apiKey: apiKey, httpClient: &http.Client{Timeout: timeout}}, nil
	}

	idClient, err := idtoken.NewClient(ctx, baseURL)
	if err != nil {
		return nil, fmt.Errorf("patternproxy: create ID-token client: %w", err)
	}
	idClient.Timeout = timeout
	return &Client{baseURL: baseURL, apiKey: apiKey, httpClient: idClient}, nil
}

// ProcessResult mirrors pattern-service's ProcessResponse JSON shape
// exactly (tileDataUrl/width/height/palette) so no field mapping is
// needed between the two services.
type ProcessResult struct {
	TileDataURL string   `json:"tileDataUrl"`
	Width       int      `json:"width"`
	Height      int      `json:"height"`
	Palette     []string `json:"palette"`
}

// ErrServiceUnavailable is returned when the pattern service can't be
// reached at all (connection refused, timeout) — distinct from a 4xx/5xx
// response it did manage to send back, so the handler can return the
// right HTTP status to the frontend (502 vs. bubbling up a validation
// error).
type ErrServiceUnavailable struct{ Err error }

func (e *ErrServiceUnavailable) Error() string {
	return fmt.Sprintf("pattern service unavailable: %v", e.Err)
}
func (e *ErrServiceUnavailable) Unwrap() error { return e.Err }

// ErrUpstream wraps a non-2xx response the pattern service *did* return,
// e.g. it rejected the image as undecodable (400).
type ErrUpstream struct {
	Status int
	Detail string
}

func (e *ErrUpstream) Error() string {
	return fmt.Sprintf("pattern service returned %d: %s", e.Status, e.Detail)
}

// Process uploads raw image bytes to POST /process and returns the
// resulting seamless tile + palette. filename/contentType are passed
// through as the multipart part's metadata only — pattern-service does
// its own decoding from the bytes, same "never trust the client label"
// posture as internal/upload on this side.
func (c *Client) Process(ctx context.Context, imageBytes []byte, filename string, tileSize, paletteSize int) (*ProcessResult, error) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	part, err := writer.CreateFormFile("image", filename)
	if err != nil {
		return nil, fmt.Errorf("building multipart request: %w", err)
	}
	if _, err := part.Write(imageBytes); err != nil {
		return nil, fmt.Errorf("writing image bytes: %w", err)
	}
	if tileSize > 0 {
		_ = writer.WriteField("tileSize", fmt.Sprintf("%d", tileSize))
	}
	if paletteSize > 0 {
		_ = writer.WriteField("paletteSize", fmt.Sprintf("%d", paletteSize))
	}
	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("closing multipart writer: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/process", body)
	if err != nil {
		return nil, fmt.Errorf("building request: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if c.apiKey != "" {
		req.Header.Set("X-API-Key", c.apiKey)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, &ErrServiceUnavailable{Err: err}
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading pattern service response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errPayload struct {
			Detail string `json:"detail"`
		}
		_ = json.Unmarshal(respBody, &errPayload)
		return nil, &ErrUpstream{Status: resp.StatusCode, Detail: errPayload.Detail}
	}

	var result ProcessResult
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("decoding pattern service response: %w", err)
	}
	return &result, nil
}
