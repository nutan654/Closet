CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Phase 2: real accounts replace the old name-only "profiles" concept.
-- Every wardrobe item/outfit below belongs to exactly one user.
CREATE TABLE IF NOT EXISTS users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT NOT NULL,
    email          TEXT UNIQUE NOT NULL,
    password_hash  TEXT NOT NULL,
    avatar         TEXT,
    settings       JSONB NOT NULL DEFAULT '{"equipped": {}}',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Refresh tokens are stored hashed (never the raw token — same principle as
-- passwords) with an explicit revoked_at column, so logout / "log out of
-- all devices" / a detected token leak can actually invalidate a session
-- instead of just waiting out a stateless JWT's expiry. This is the one
-- place this implementation goes beyond the brief's "issue a refresh
-- token" — a purely stateless refresh token can't be revoked before it
-- expires, which is a real gap for anything handling real user accounts.
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category            TEXT NOT NULL DEFAULT 'tops',
    name                TEXT NOT NULL DEFAULT 'Untitled item',
    brand               TEXT NOT NULL DEFAULT '',
    price               NUMERIC(10,2) NOT NULL DEFAULT 0,
    purchase_date       DATE,
    expiry_date         DATE,
    consumable          BOOLEAN NOT NULL DEFAULT false,
    inventory_percent   INT NOT NULL DEFAULT 100,
    times_used          INT NOT NULL DEFAULT 0,
    status              TEXT NOT NULL DEFAULT 'clean',
    notes               TEXT NOT NULL DEFAULT '',
    color               TEXT NOT NULL DEFAULT '#FFD9BE',
    photo               TEXT,
    worn                INT NOT NULL DEFAULT 0,
    favorite            BOOLEAN NOT NULL DEFAULT false,
    fit                 TEXT NOT NULL DEFAULT 'Regular',
    season              TEXT NOT NULL DEFAULT '',
    occasion            TEXT NOT NULL DEFAULT '',
    material            TEXT NOT NULL DEFAULT '',
    size                TEXT NOT NULL DEFAULT '',
    shade               TEXT NOT NULL DEFAULT '',
    finish              TEXT NOT NULL DEFAULT '',
    subtype             TEXT NOT NULL DEFAULT '',
    card_style          TEXT NOT NULL DEFAULT 'classic',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outfits (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL DEFAULT 'New outfit',
    emoji       TEXT NOT NULL DEFAULT '✨',
    item_ids    UUID[] NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wear_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id     UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    worn_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_items_user_id          ON items(user_id);
CREATE INDEX IF NOT EXISTS idx_outfits_user_id         ON outfits(user_id);
CREATE INDEX IF NOT EXISTS idx_wear_log_item_id        ON wear_log(item_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id  ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash     ON refresh_tokens(token_hash);
