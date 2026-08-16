// Package logger wraps the stdlib structured logger (log/slog) so every
// part of the app logs consistent, greppable JSON instead of fmt.Println.
// One logger is built in main.go and threaded down through the DI chain;
// handlers pull the request-scoped copy (with request_id already attached)
// out of gin.Context — see middleware.RequestID and middleware.Logging.
package logger

import (
	"log/slog"
	"os"
)

func New(level string) *slog.Logger {
	var lvl slog.Level
	switch level {
	case "debug":
		lvl = slog.LevelDebug
	case "warn":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}

	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: lvl})
	return slog.New(handler)
}
