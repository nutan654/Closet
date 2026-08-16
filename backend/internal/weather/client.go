// Package weather is a thin client for Open-Meteo's forecast API
// (https://open-meteo.com), used by Bear (internal/companion +
// CompanionHandler) to ground outfit suggestions in the caller's actual
// weather ("it's raining, grab a jacket") rather than guessing. Chosen
// deliberately over a commercial weather API because it needs no API key
// and no billing account — same "don't make the operator manage a
// secret for an optional feature" reasoning as Bear's own APIKey being
// allowed to stay empty (see config.CompanionConfig's doc comment).
//
// The caller (frontend) supplies latitude/longitude — usually from
// browser geolocation, see app/companion/page.js — because Open-Meteo
// needs coordinates, not a city name, and this backend never stores or
// infers the user's location itself.
package weather

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const defaultBaseURL = "https://api.open-meteo.com/v1/forecast"

// weatherCodeDescriptions maps Open-Meteo's WMO weather codes to short
// human-readable phrases — see
// https://open-meteo.com/en/docs#weathervariables for the full table.
// Only the codes worth distinguishing for outfit advice are named; the
// rest fall back to a generic description in Describe().
var weatherCodeDescriptions = map[int]string{
	0:  "clear sky",
	1:  "mostly clear",
	2:  "partly cloudy",
	3:  "overcast",
	45: "foggy",
	48: "foggy with frost",
	51: "light drizzle",
	53: "drizzle",
	55: "heavy drizzle",
	61: "light rain",
	63: "rain",
	65: "heavy rain",
	71: "light snow",
	73: "snow",
	75: "heavy snow",
	80: "rain showers",
	81: "heavy rain showers",
	82: "violent rain showers",
	95: "thunderstorm",
	96: "thunderstorm with hail",
	99: "severe thunderstorm with hail",
}

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func New(timeout time.Duration) *Client {
	if timeout <= 0 {
		timeout = 8 * time.Second
	}
	return &Client{baseURL: defaultBaseURL, httpClient: &http.Client{Timeout: timeout}}
}

// Snapshot is today's weather at a point, reduced to the fields Bear's
// prompt actually needs.
type Snapshot struct {
	TempC          float64
	FeelsLikeC     float64
	Description    string // e.g. "light rain" — see weatherCodeDescriptions
	PrecipitationP int    // chance of precipitation today, 0-100
}

type forecastResponse struct {
	Current struct {
		Temperature2m       float64 `json:"temperature_2m"`
		ApparentTemperature float64 `json:"apparent_temperature"`
		WeatherCode         int     `json:"weather_code"`
	} `json:"current"`
	Daily struct {
		PrecipitationProbabilityMax []int `json:"precipitation_probability_max"`
	} `json:"daily"`
}

// Current fetches today's conditions for a latitude/longitude. Returns
// an error on any failure (bad coordinates, network, timeout, malformed
// response) — callers should treat this as "no weather available" and
// fall back to a weather-free prompt rather than failing the whole chat
// request, same as buildSystemPrompt already does when the item lookup
// fails (see CompanionHandler.buildSystemPrompt's doc comment).
func (c *Client) Current(ctx context.Context, lat, lon float64) (*Snapshot, error) {
	url := fmt.Sprintf(
		"%s?latitude=%f&longitude=%f&current=temperature_2m,apparent_temperature,weather_code"+
			"&daily=precipitation_probability_max&forecast_days=1&timezone=auto",
		c.baseURL, lat, lon,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("weather: building request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("weather: calling open-meteo: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("weather: reading response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("weather: open-meteo returned %d: %s", resp.StatusCode, string(body))
	}

	var parsed forecastResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("weather: decoding response: %w", err)
	}

	precip := 0
	if len(parsed.Daily.PrecipitationProbabilityMax) > 0 {
		precip = parsed.Daily.PrecipitationProbabilityMax[0]
	}

	return &Snapshot{
		TempC:          parsed.Current.Temperature2m,
		FeelsLikeC:     parsed.Current.ApparentTemperature,
		Description:    describe(parsed.Current.WeatherCode),
		PrecipitationP: precip,
	}, nil
}

func describe(code int) string {
	if d, ok := weatherCodeDescriptions[code]; ok {
		return d
	}
	return "unsettled weather"
}
