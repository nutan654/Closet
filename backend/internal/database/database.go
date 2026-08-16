package database

import (
	"database/sql"
	"embed"
	"fmt"
	"log/slog"

	_ "github.com/lib/pq"

	"closet-backend/internal/config"
)

// go:embed can only reach files inside (or below) the directory the
// embedding .go file lives in — it can't use ".." — so migrations live at
// internal/database/migrations rather than the top-level migrations/ you'd
// see in a lot of folder-structure diagrams. Trade-off, deliberately made:
// this keeps the compiled binary self-contained (no separate migrate step
// needed in Docker/Cloud Run), at the cost of migrations not living at the
// repo root. If this ever needs to be a reversible, tool-driven migration
// history instead, swap this for golang-migrate/goose pointed at a
// top-level migrations/ folder.
//
//go:embed migrations/*.sql
var migrationsFS embed.FS

// Connect opens the pool and tunes it explicitly rather than trusting
// database/sql's defaults (which are effectively "unlimited connections"
// and can take a production Postgres instance down under load).
func Connect(cfg config.DatabaseConfig) (*sql.DB, error) {
	db, err := sql.Open("postgres", cfg.URL)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	db.SetMaxOpenConns(cfg.MaxOpenConns)
	db.SetMaxIdleConns(cfg.MaxIdleConns)
	db.SetConnMaxLifetime(cfg.ConnMaxLifetime)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}
	return db, nil
}

// RunMigrations applies every *.sql file under migrations/, in filename
// order. Deliberately simple (no down-migrations, no schema_migrations
// table) — fine for a solo/portfolio-scale project; swap for
// golang-migrate or goose once the schema has real production data riding
// on it and migrations need to be reversible.
func RunMigrations(db *sql.DB, log *slog.Logger) error {
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return err
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		contents, err := migrationsFS.ReadFile("migrations/" + e.Name())
		if err != nil {
			return err
		}
		if _, err := db.Exec(string(contents)); err != nil {
			return fmt.Errorf("migration %s failed: %w", e.Name(), err)
		}
		log.Info("applied migration", "file", e.Name())
	}
	return nil
}
