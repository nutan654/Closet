-- Phase 5.1: persist Smart Garment Engine pattern styling on items.
--
-- Additive and fully backward compatible, same pattern as 0002: every
-- column is nullable with no default, so existing rows (and any item
-- that never gets a pattern applied) simply read back NULL, which the
-- frontend mapper (lib/api/mappers.js toFrontendItem) already coalesces
-- to the same solid-color defaults it always used
-- (patternUrl: null, patternScale: 1, patternOffsetX/Y: 0, patternRotation: 0,
-- patternTint: false). No backfill needed, no existing query touched.
--
-- pattern_tint is BOOLEAN, not TEXT. The frontend's "tint" control
-- (components/PatternControls.jsx) is a toggle meaning "recolor this
-- pattern using the item's own `color` column" — it is not a second,
-- independently-set color. Storing it as text (as an earlier, unapplied
-- draft of this migration described) would have invented a field the
-- frontend never sends and never reads.
--
-- pattern_url holds a data: URL (a seamlessly-tiled texture returned by
-- the Python pattern-service, see pattern-service/app/imaging.py) rather
-- than a storage key — unlike item photos (0002), these tiles are small
-- generated textures, not user-uploaded originals, so there is no
-- separate object-storage asset to track here.
ALTER TABLE items ADD COLUMN IF NOT EXISTS pattern_url      TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS pattern_scale    DOUBLE PRECISION;
ALTER TABLE items ADD COLUMN IF NOT EXISTS pattern_offset_x DOUBLE PRECISION;
ALTER TABLE items ADD COLUMN IF NOT EXISTS pattern_offset_y DOUBLE PRECISION;
ALTER TABLE items ADD COLUMN IF NOT EXISTS pattern_rotation DOUBLE PRECISION;
ALTER TABLE items ADD COLUMN IF NOT EXISTS pattern_tint     BOOLEAN;
