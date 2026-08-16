package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"closet-backend/internal/dto"
)

// RateLimit is a small in-memory, per-IP sliding-window limiter — not
// asked for in the brief, but /login and /signup are exactly the
// endpoints that get hammered by credential-stuffing bots the moment a
// service is public, and it's a cheap, honest thing to point to in an
// interview ("I rate-limited auth endpoints because that's where brute
// force actually happens").
//
// It's intentionally in-process rather than Redis-backed: fine for a
// single instance, and the honest trade-off to name if this ever needs to
// run behind a load balancer with multiple replicas — the fix at that
// point is swapping the map below for a Redis INCR + TTL, not a redesign.
func RateLimit(maxPerMinute int) gin.HandlerFunc {
	type bucket struct {
		count     int
		windowEnd time.Time
	}

	var mu sync.Mutex
	buckets := map[string]*bucket{}

	return func(c *gin.Context) {
		key := c.ClientIP()
		now := time.Now()

		mu.Lock()
		b, ok := buckets[key]
		if !ok || now.After(b.windowEnd) {
			b = &bucket{count: 0, windowEnd: now.Add(time.Minute)}
			buckets[key] = b
		}
		b.count++
		blocked := b.count > maxPerMinute
		mu.Unlock()

		if blocked {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, dto.Fail("too many attempts — please wait a moment and try again", "RATE_LIMITED"))
			return
		}
		c.Next()
	}
}
