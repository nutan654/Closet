-- Phase 3: image metadata for wardrobe item uploads. Binary image bytes
-- never live in Postgres — only the storage key/URL and enough metadata
-- (dimensions, mime type, size, when it was uploaded) to render and manage
-- the asset. The storage.Storage abstraction decides whether image_url
-- resolves to a local file or a GCS object; this table doesn't know or
-- care which.
--
-- image_storage_key / thumbnail_storage_key are not exposed in API
-- responses (see dto.ItemResponse) — they exist purely so the service
-- layer can delete the right objects on item deletion or upload-rollback
-- without reconstructing the key from scratch.
ALTER TABLE items ADD COLUMN IF NOT EXISTS image_url             TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS thumbnail_url         TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS image_mime_type       TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS image_file_size       BIGINT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS image_width           INT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS image_height          INT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS image_storage_key     TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS thumbnail_storage_key TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS image_uploaded_at     TIMESTAMPTZ;
