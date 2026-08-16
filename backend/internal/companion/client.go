// Package companion is a thin HTTP client for the Google Gemini
// generateContent API, used to power Bear (the "Companion" tab's chat).
// Mirrors internal/patternproxy's shape deliberately — same "one method,
// one request shape, one response shape" style — except this proxies to
// a third-party API instead of an internal microservice, so the API key
// lives here (server-side) and is never sent to or seen by the frontend.
package companion

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

const defaultBaseURL = "https://generativelanguage.googleapis.com/v1beta/models"

type Client struct {
	apiKey     string
	model      string
	baseURL    string
	httpClient *http.Client
}

// New builds the Gemini client. apiKey may be empty — callers should
// check Enabled() and return a friendly "not configured" error rather
// than letting every chat request fail with a confusing 400 from
// Gemini itself.
func New(apiKey, model string, timeout time.Duration) *Client {
	if timeout <= 0 {
		timeout = 20 * time.Second
	}
	if model == "" {
		model = "gemini-2.5-flash"
	}
	return &Client{
		apiKey:     apiKey,
		model:      model,
		baseURL:    defaultBaseURL,
		httpClient: &http.Client{Timeout: timeout},
	}
}

// Enabled reports whether an API key was configured at all. The handler
// uses this to fail fast with a clear "Bear isn't set up yet" message
// instead of a raw upstream error.
func (c *Client) Enabled() bool { return c.apiKey != "" }

// Message is one turn of chat history, kept in the same "role" +
// "content" vocabulary the rest of this codebase (and the frontend's
// lib/api/companion.js) already uses. Chat() translates Role
// ("user"|"assistant") into Gemini's own vocabulary ("user"|"model")
// internally, so nothing above this package needs to know Gemini calls
// the assistant turn "model" instead of "assistant".
type Message struct {
	Role string `json:"role"`
	Text string `json:"content"`
}

// ErrNotConfigured is returned when no GEMINI_API_KEY was set —
// distinguishable from ErrUpstream so the handler can return a 503
// ("feature not configured") rather than a 502 ("feature is configured
// but the upstream call failed").
type ErrNotConfigured struct{}

func (e *ErrNotConfigured) Error() string { return "companion: GEMINI_API_KEY is not configured" }

// ErrUpstream wraps a non-2xx response Gemini returned.
type ErrUpstream struct {
	Status int
	Detail string
}

func (e *ErrUpstream) Error() string {
	return fmt.Sprintf("companion: gemini API returned %d: %s", e.Status, e.Detail)
}

// --- Gemini generateContent request/response shapes ---
// See https://ai.google.dev/api/generate-content for the full schema;
// only the fields Bear actually needs are modeled here.

type geminiRequest struct {
	SystemInstruction *geminiContent  `json:"systemInstruction,omitempty"`
	Contents          []geminiContent `json:"contents"`
	GenerationConfig  geminiGenConfig `json:"generationConfig"`
}

type geminiGenConfig struct {
	MaxOutputTokens int     `json:"maxOutputTokens"`
	Temperature     float64 `json:"temperature"`
}

type geminiContent struct {
	Role  string       `json:"role,omitempty"` // omitted for systemInstruction, "user"/"model" for turns
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text string `json:"text"`
}

type geminiResponse struct {
	Candidates []struct {
		Content geminiContent `json:"content"`
	} `json:"candidates"`
	PromptFeedback *struct {
		BlockReason string `json:"blockReason"`
	} `json:"promptFeedback"`
}

type geminiErrorBody struct {
	Error struct {
		Message string `json:"message"`
	} `json:"error"`
}

// Chat sends systemPrompt + history (oldest first, ending with the
// person's newest message already appended by the caller) and returns
// Bear's reply as plain text. Only the first candidate's first text part
// is used — Bear never needs multi-candidate or tool-call replies.
func (c *Client) Chat(ctx context.Context, systemPrompt string, history []Message) (string, error) {
	if !c.Enabled() {
		return "", &ErrNotConfigured{}
	}

	contents := make([]geminiContent, 0, len(history))
	for _, m := range history {
		role := "user"
		if m.Role == "assistant" {
			role = "model" // Gemini's name for the assistant turn
		}
		contents = append(contents, geminiContent{Role: role, Parts: []geminiPart{{Text: m.Text}}})
	}

	payload := geminiRequest{
		Contents: contents,
		GenerationConfig: geminiGenConfig{
			MaxOutputTokens: 500,
			Temperature:     0.7,
		},
	}
	if systemPrompt != "" {
		payload.SystemInstruction = &geminiContent{Parts: []geminiPart{{Text: systemPrompt}}}
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("companion: encoding request: %w", err)
	}

	endpoint := fmt.Sprintf("%s/%s:generateContent?key=%s", c.baseURL, c.model, url.QueryEscape(c.apiKey))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("companion: building request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("companion: calling gemini: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("companion: reading gemini response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errPayload geminiErrorBody
		_ = json.Unmarshal(respBody, &errPayload)
		detail := errPayload.Error.Message
		if detail == "" {
			detail = "unknown error"
		}
		return "", &ErrUpstream{Status: resp.StatusCode, Detail: detail}
	}

	var parsed geminiResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", fmt.Errorf("companion: decoding gemini response: %w", err)
	}

	if len(parsed.Candidates) == 0 {
		reason := "no candidates returned"
		if parsed.PromptFeedback != nil && parsed.PromptFeedback.BlockReason != "" {
			reason = "blocked: " + parsed.PromptFeedback.BlockReason
		}
		return "", fmt.Errorf("companion: gemini response had no text content (%s)", reason)
	}

	for _, part := range parsed.Candidates[0].Content.Parts {
		if part.Text != "" {
			return part.Text, nil
		}
	}
	return "", fmt.Errorf("companion: gemini response had no text content")
}
