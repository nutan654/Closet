package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"time"

	"github.com/google/uuid"

	"closet-backend/internal/apperror"
	"closet-backend/internal/dto"
	"closet-backend/internal/imageproc"
	"closet-backend/internal/middleware"
	"closet-backend/internal/models"
	"closet-backend/internal/repository"
	"closet-backend/internal/storage"
	"closet-backend/internal/upload"
)

var ErrForbidden = errors.New("you don't have access to this resource")

type ItemService struct {
	items repository.ItemRepository

	// Phase 3 additions. store and images are nil-safe (image handling is
	// simply skipped if either is nil) so ItemService stays usable in
	// tests/contexts that don't care about uploads at all.
	store          storage.Storage
	images         *imageproc.Processor
	maxUploadBytes int64
	uploadTimeout  time.Duration
	log            *slog.Logger
}

// ItemServiceOption configures optional Phase 3 dependencies without
// forcing every existing call site (and every existing test) to pass nils
// for features they don't use.
type ItemServiceOption func(*ItemService)

func WithStorage(store storage.Storage, images *imageproc.Processor, maxUploadBytes int64, uploadTimeout time.Duration) ItemServiceOption {
	return func(s *ItemService) {
		s.store = store
		s.images = images
		s.maxUploadBytes = maxUploadBytes
		s.uploadTimeout = uploadTimeout
	}
}

func WithLogger(log *slog.Logger) ItemServiceOption {
	return func(s *ItemService) { s.log = log }
}

func NewItemService(items repository.ItemRepository, opts ...ItemServiceOption) *ItemService {
	s := &ItemService{items: items, uploadTimeout: 30 * time.Second, log: slog.Default()}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

// loggerFor returns a logger tagged with the request's correlation ID (see
// middleware.RequestID), so every "image upload started/completed",
// "storage failure", etc. line can be traced back to a single HTTP
// request without the service layer importing gin or anything else
// handler-specific — just the plain context.Context it already receives.
func (s *ItemService) loggerFor(ctx context.Context) *slog.Logger {
	if id := middleware.RequestIDFromContext(ctx); id != "" {
		return s.log.With("request_id", id)
	}
	return s.log
}

// Create adds a new wardrobe item. imageFile/imageHeader are nil for the
// original JSON-only create path; when present (multipart create with an
// `image` part), the file is validated, processed, and stored before the
// database row is written — see storeImage for the validate -> process ->
// store -> record-metadata pipeline and its rollback behavior.
func (s *ItemService) Create(ctx context.Context, userID string, req dto.ItemRequest, imageFile multipart.File, imageHeader *multipart.FileHeader) (*dto.ItemResponse, error) {
	it := &models.Item{
		ID:               uuid.NewString(), // generated up front so an image's storage key can embed it before the row exists
		UserID:           userID,
		Category:         req.Category,
		Name:             req.Name,
		Brand:            req.Brand,
		Price:            req.Price,
		Consumable:       req.Consumable,
		InventoryPercent: coalesceInt(req.InventoryPercent, 100),
		Status:           coalesceStr(req.Status, "clean"),
		Notes:            req.Notes,
		Color:            req.Color,
		Fit:              coalesceStr(req.Fit, "Regular"),
		Season:           req.Season,
		Occasion:         req.Occasion,
		Material:         req.Material,
		Size:             req.Size,
		Shade:            req.Shade,
		Finish:           req.Finish,
		Subtype:          req.Subtype,
		CardStyle:        coalesceStr(req.CardStyle, "classic"),
		// Phase 5.1 fix: ItemRequest already carried these (see dto.ItemRequest's
		// comment about a future create-with-pattern flow) but Create() never
		// actually copied them onto the model, so even direct-to-create-with-
		// pattern requests silently lost the styling. In practice today's UI
		// always creates the item first and applies a pattern via PATCH after
		// (see lib/StoreContext.jsx setPatternStyle), so these are nil on
		// every current create call — this just makes the field wiring correct
		// end-to-end rather than leaving a trap for whoever wires that up next.
		PatternURL:      req.PatternURL,
		PatternScale:    req.PatternScale,
		PatternOffsetX:  req.PatternOffsetX,
		PatternOffsetY:  req.PatternOffsetY,
		PatternRotation: req.PatternRotation,
		PatternTint:     req.PatternTint,
	}
	if req.PurchaseDate != "" {
		it.PurchaseDate = &req.PurchaseDate
	}
	if req.ExpiryDate != "" {
		it.ExpiryDate = &req.ExpiryDate
	}
	if req.Photo != "" {
		it.Photo = &req.Photo
	}

	var asset *storedImageAsset
	if imageFile != nil {
		var err error
		asset, err = s.storeImage(ctx, userID, it.ID, imageFile, imageHeader)
		if err != nil {
			return nil, err
		}
		it.ImageURL = &asset.ImageURL
		it.ThumbnailURL = &asset.ThumbnailURL
		it.ImageMimeType = &asset.MimeType
		it.ImageFileSize = &asset.FileSize
		it.ImageWidth = &asset.Width
		it.ImageHeight = &asset.Height
		it.ImageStorageKey = &asset.StorageKey
		it.ThumbnailStorageKey = &asset.ThumbnailStorageKey
		uploadedAt := time.Now().UTC()
		it.ImageUploadedAt = &uploadedAt
	}

	if err := s.items.Create(ctx, it); err != nil {
		if asset != nil {
			// The files are already durably stored but the row meant to
			// reference them never made it into Postgres — clean them up
			// rather than leaving orphaned objects behind. Delete uses a
			// fresh background context (ctx may already be canceled/expired
			// if that's *why* Create failed, and cleanup should still run)
			// but the logger still carries the original request's
			// correlation ID.
			s.cleanupAsset(context.Background(), s.loggerFor(ctx), asset, "db_insert_failed")
		}
		return nil, err
	}

	resp := toItemResponse(it)
	return &resp, nil
}

// storedImageAsset is the result of validating, processing, and storing
// one uploaded image — everything needed to either populate models.Item or
// roll the upload back.
type storedImageAsset struct {
	ImageURL            string
	ThumbnailURL        string
	MimeType            string
	FileSize            int64
	Width               int
	Height              int
	StorageKey          string
	ThumbnailStorageKey string
}

// storeImage runs the full upload pipeline described in the brief for item
// creation: validate size -> detect real MIME type -> validate/decode as
// an image -> generate a storage key -> store the (possibly resized)
// original -> generate + store a thumbnail. If storing the thumbnail
// fails after the original succeeded, the original is cleaned up too, so
// a failure here never leaves a half-uploaded item behind.
func (s *ItemService) storeImage(ctx context.Context, userID, itemID string, file multipart.File, header *multipart.FileHeader) (*storedImageAsset, error) {
	if s.store == nil || s.images == nil {
		return nil, apperror.New("ERR_UPLOAD_UNAVAILABLE", "image upload is not configured on this server", 500)
	}
	log := s.loggerFor(ctx)

	log.Info("image upload started", "user_id", userID, "item_id", itemID, "declared_size", header.Size)

	if err := upload.CheckSize(header.Size, s.maxUploadBytes); err != nil {
		return nil, err
	}

	// Read with a hard cap one byte past the limit: a client can lie about
	// Content-Length, so the declared-size check above is only a fast
	// path, not the real guard.
	raw, err := io.ReadAll(io.LimitReader(file, s.maxUploadBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read upload: %w", err)
	}
	if int64(len(raw)) > s.maxUploadBytes {
		return nil, apperror.ErrFileTooLarge
	}

	mimeType, err := upload.DetectImageType(raw)
	if err != nil {
		log.Warn("image upload rejected", "user_id", userID, "item_id", itemID, "reason", err)
		return nil, err
	}

	processed, err := s.images.Process(raw, mimeType)
	if err != nil {
		log.Warn("image upload rejected", "user_id", userID, "item_id", itemID, "reason", err)
		return nil, err
	}

	uploadCtx, cancel := context.WithTimeout(ctx, s.uploadTimeout)
	defer cancel()

	originalExt := extensionFor(processed.OriginalMimeType)
	originalKey := storage.NewItemKey(userID, itemID, "original"+originalExt)
	thumbnailKey := storage.NewItemKey(userID, itemID, "thumbnail.jpg")

	originalURL, err := s.store.Upload(uploadCtx, storage.UploadInput{
		Key:         originalKey,
		Reader:      bytes.NewReader(processed.OriginalBytes),
		ContentType: processed.OriginalMimeType,
		Size:        int64(len(processed.OriginalBytes)),
	})
	if err != nil {
		log.Error("storage failure", "user_id", userID, "item_id", itemID, "key", originalKey, "error", err)
		return nil, fmt.Errorf("store original image: %w", err)
	}

	thumbnailURL, err := s.store.Upload(uploadCtx, storage.UploadInput{
		Key:         thumbnailKey,
		Reader:      bytes.NewReader(processed.ThumbnailBytes),
		ContentType: imageproc.ThumbnailMimeType,
		Size:        int64(len(processed.ThumbnailBytes)),
	})
	if err != nil {
		log.Error("storage failure", "user_id", userID, "item_id", itemID, "key", thumbnailKey, "error", err)
		// Don't leave the original orphaned if the thumbnail upload fails.
		if delErr := s.store.Delete(context.Background(), originalKey); delErr != nil {
			log.Error("storage failure", "event", "rollback_delete_failed", "key", originalKey, "error", delErr)
		}
		return nil, fmt.Errorf("store thumbnail: %w", err)
	}

	log.Info("thumbnail generated", "user_id", userID, "item_id", itemID, "width", processed.ThumbnailWidth, "height", processed.ThumbnailHeight)
	log.Info("image upload completed", "user_id", userID, "item_id", itemID, "mime_type", processed.OriginalMimeType,
		"width", processed.OriginalWidth, "height", processed.OriginalHeight, "file_size", len(processed.OriginalBytes))

	return &storedImageAsset{
		ImageURL:            originalURL,
		ThumbnailURL:        thumbnailURL,
		MimeType:            processed.OriginalMimeType,
		FileSize:            int64(len(processed.OriginalBytes)),
		Width:               processed.OriginalWidth,
		Height:              processed.OriginalHeight,
		StorageKey:          originalKey,
		ThumbnailStorageKey: thumbnailKey,
	}, nil
}

func (s *ItemService) cleanupAsset(ctx context.Context, log *slog.Logger, asset *storedImageAsset, reason string) {
	if asset == nil || s.store == nil {
		return
	}
	if err := s.store.Delete(ctx, asset.StorageKey); err != nil {
		log.Error("storage failure", "event", "cleanup_delete_failed", "reason", reason, "key", asset.StorageKey, "error", err)
	}
	if err := s.store.Delete(ctx, asset.ThumbnailStorageKey); err != nil {
		log.Error("storage failure", "event", "cleanup_delete_failed", "reason", reason, "key", asset.ThumbnailStorageKey, "error", err)
	}
}

func extensionFor(mimeType string) string {
	switch mimeType {
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	default:
		return ".jpg"
	}
}

func (s *ItemService) List(ctx context.Context, userID, category string, page, perPage int) (*dto.PageResponse, error) {
	items, total, err := s.items.List(ctx, userID, category, page, perPage)
	if err != nil {
		return nil, err
	}
	resp := make([]dto.ItemResponse, len(items))
	for i := range items {
		resp[i] = toItemResponse(&items[i])
	}
	totalPages := (total + perPage - 1) / perPage
	if totalPages < 1 {
		totalPages = 1
	}
	return &dto.PageResponse{Items: resp, Total: total, Page: page, PerPage: perPage, TotalPages: totalPages}, nil
}

// assertOwnership is the authorization check the brief calls out explicitly
// ("user A must never reach user B's wardrobe"): every mutation on an item
// first confirms the caller actually owns it — including image deletion,
// which reuses this same check rather than adding a parallel one.
func (s *ItemService) assertOwnership(ctx context.Context, userID, itemID string) (*models.Item, error) {
	it, err := s.items.FindByID(ctx, itemID)
	if err != nil {
		return nil, err
	}
	if it.UserID != userID {
		return nil, ErrForbidden
	}
	return it, nil
}

func (s *ItemService) Update(ctx context.Context, userID, itemID string, req dto.ItemPatchRequest) error {
	if _, err := s.assertOwnership(ctx, userID, itemID); err != nil {
		return err
	}

	fields := map[string]interface{}{}
	setIf(fields, "category", req.Category)
	setIf(fields, "name", req.Name)
	setIf(fields, "brand", req.Brand)
	setIf(fields, "price", req.Price)
	setIf(fields, "consumable", req.Consumable)
	setIf(fields, "inventory_percent", req.InventoryPercent)
	setIf(fields, "status", req.Status)
	setIf(fields, "notes", req.Notes)
	setIf(fields, "color", req.Color)
	setIf(fields, "photo", req.Photo)
	setIf(fields, "favorite", req.Favorite)
	setIf(fields, "fit", req.Fit)
	setIf(fields, "season", req.Season)
	setIf(fields, "occasion", req.Occasion)
	setIf(fields, "material", req.Material)
	setIf(fields, "size", req.Size)
	setIf(fields, "shade", req.Shade)
	setIf(fields, "finish", req.Finish)
	setIf(fields, "subtype", req.Subtype)
	setIf(fields, "card_style", req.CardStyle)

	// Phase 5.1 fix: this is the actual persistence path PatternControls.jsx
	// relies on (pattern edits are saved via PATCH, not create — see
	// lib/StoreContext.jsx's setPatternStyle usage in app/wardrobe/page.js).
	// Column names match migration 0003_item_patterns.up.sql exactly.
	setIf(fields, "pattern_url", req.PatternURL)
	setIf(fields, "pattern_scale", req.PatternScale)
	setIf(fields, "pattern_offset_x", req.PatternOffsetX)
	setIf(fields, "pattern_offset_y", req.PatternOffsetY)
	setIf(fields, "pattern_rotation", req.PatternRotation)
	setIf(fields, "pattern_tint", req.PatternTint)

	// Explicit clear (see dto.ItemPatchRequest.ClearPattern doc comment):
	// a bare nil PatternURL can't be told apart from "field omitted", so
	// the frontend sends this flag instead when the user hits "Remove".
	// Resets the whole pattern group to nil rather than leaving a stale
	// scale/offset/tint attached to what's now a plain solid-color item.
	if req.ClearPattern != nil && *req.ClearPattern {
		fields["pattern_url"] = nil
		fields["pattern_scale"] = nil
		fields["pattern_offset_x"] = nil
		fields["pattern_offset_y"] = nil
		fields["pattern_rotation"] = nil
		fields["pattern_tint"] = nil
	}

	return s.items.Update(ctx, itemID, fields)
}

// Delete removes an item and, best-effort, its image files: verify
// ownership -> delete the database record -> delete the associated
// storage objects, in that order (Phase 3 Step 8). Postgres is the source
// of truth for "does this item exist", so once the row is gone the delete
// the caller asked for has already succeeded; a storage failure after that
// point is logged as an orphaned-file warning rather than returned as a
// request error, since there's no meaningful retry of "delete the row"
// left to do.
func (s *ItemService) Delete(ctx context.Context, userID, itemID string) error {
	it, err := s.assertOwnership(ctx, userID, itemID)
	if err != nil {
		return err
	}
	if err := s.items.Delete(ctx, itemID); err != nil {
		return err
	}
	s.deleteImageFiles(s.loggerFor(ctx), it)
	return nil
}

func (s *ItemService) deleteImageFiles(log *slog.Logger, it *models.Item) {
	if s.store == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), s.uploadTimeout)
	defer cancel()

	if it.ImageStorageKey != nil {
		if err := s.store.Delete(ctx, *it.ImageStorageKey); err != nil {
			log.Error("storage failure", "event", "image_delete_failed", "key", *it.ImageStorageKey, "error", err)
		} else {
			log.Info("image deleted", "key", *it.ImageStorageKey)
		}
	}
	if it.ThumbnailStorageKey != nil {
		if err := s.store.Delete(ctx, *it.ThumbnailStorageKey); err != nil {
			log.Error("storage failure", "event", "thumbnail_delete_failed", "key", *it.ThumbnailStorageKey, "error", err)
		} else {
			log.Info("image deleted", "event", "thumbnail_deleted", "key", *it.ThumbnailStorageKey)
		}
	}
}

func (s *ItemService) LogWear(ctx context.Context, userID, itemID string) error {
	if _, err := s.assertOwnership(ctx, userID, itemID); err != nil {
		return err
	}
	return s.items.LogWear(ctx, itemID)
}

func (s *ItemService) History(ctx context.Context, userID string, limit int) ([]models.WearLogEntry, error) {
	return s.items.History(ctx, userID, limit)
}

func toItemResponse(it *models.Item) dto.ItemResponse {
	return dto.ItemResponse{
		ID: it.ID, Category: it.Category, Name: it.Name, Brand: it.Brand, Price: it.Price,
		PurchaseDate: it.PurchaseDate, ExpiryDate: it.ExpiryDate, Consumable: it.Consumable,
		InventoryPercent: it.InventoryPercent, TimesUsed: it.TimesUsed, Status: it.Status,
		Notes: it.Notes, Color: it.Color, Photo: it.Photo, Worn: it.Worn, Favorite: it.Favorite,
		Fit: it.Fit, Season: it.Season, Occasion: it.Occasion, Material: it.Material, Size: it.Size,
		Shade: it.Shade, Finish: it.Finish, Subtype: it.Subtype, CardStyle: it.CardStyle,
		ImageURL: it.ImageURL, ThumbnailURL: it.ThumbnailURL, ImageMimeType: it.ImageMimeType,
		ImageFileSize: it.ImageFileSize, ImageWidth: it.ImageWidth, ImageHeight: it.ImageHeight,
		ImageUploadedAt: it.ImageUploadedAt,
		PatternURL:      it.PatternURL, PatternScale: it.PatternScale,
		PatternOffsetX: it.PatternOffsetX, PatternOffsetY: it.PatternOffsetY,
		PatternRotation: it.PatternRotation, PatternTint: it.PatternTint,
		CreatedAt: it.CreatedAt,
	}
}

func coalesceStr(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}

func coalesceInt(v, fallback int) int {
	if v == 0 {
		return fallback
	}
	return v
}

func setIf[T any](fields map[string]interface{}, col string, v *T) {
	if v != nil {
		fields[col] = *v
	}
}
