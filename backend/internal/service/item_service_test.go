package service

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/jpeg"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"
	"time"

	"closet-backend/internal/apperror"
	"closet-backend/internal/dto"
	"closet-backend/internal/imageproc"
	"closet-backend/internal/models"
	"closet-backend/internal/repository"
	"closet-backend/internal/storage"
)

// --- fakes ---------------------------------------------------------------

type fakeItemRepository struct {
	items       map[string]*models.Item
	failCreate  bool
	createCalls int

	// lastUpdateFields captures the exact map passed to Update(), so tests
	// can assert on which columns a given ItemPatchRequest actually
	// produces without needing a real Postgres connection.
	lastUpdateFields map[string]interface{}
}

func newFakeItemRepository() *fakeItemRepository {
	return &fakeItemRepository{items: map[string]*models.Item{}}
}

func (f *fakeItemRepository) Create(ctx context.Context, it *models.Item) error {
	f.createCalls++
	if f.failCreate {
		return errors.New("simulated db failure")
	}
	cp := *it
	f.items[it.ID] = &cp
	return nil
}

func (f *fakeItemRepository) FindByID(ctx context.Context, id string) (*models.Item, error) {
	it, ok := f.items[id]
	if !ok {
		return nil, repository.ErrNotFound
	}
	cp := *it
	return &cp, nil
}

func (f *fakeItemRepository) List(ctx context.Context, userID, category string, page, perPage int) ([]models.Item, int, error) {
	return nil, 0, nil
}

func (f *fakeItemRepository) Update(ctx context.Context, id string, fields map[string]interface{}) error {
	f.lastUpdateFields = fields
	if it, ok := f.items[id]; ok {
		// Best-effort application so tests can also assert on FindByID
		// afterwards, not just on the raw fields map. Real column names
		// (snake_case) are intentionally not translated back to struct
		// fields here — tests that care about persisted values assert
		// against lastUpdateFields directly, matching what the real
		// repository actually receives.
		_ = it
	}
	return nil
}

func (f *fakeItemRepository) Delete(ctx context.Context, id string) error {
	if _, ok := f.items[id]; !ok {
		return repository.ErrNotFound
	}
	delete(f.items, id)
	return nil
}

func (f *fakeItemRepository) LogWear(ctx context.Context, id string) error { return nil }

func (f *fakeItemRepository) History(ctx context.Context, userID string, limit int) ([]models.WearLogEntry, error) {
	return nil, nil
}

// fakeStorage is an in-memory storage.Storage used so tests never touch a
// real filesystem.
type fakeStorage struct {
	objects map[string][]byte
	deleted []string
}

func newFakeStorage() *fakeStorage {
	return &fakeStorage{objects: map[string][]byte{}}
}

func (f *fakeStorage) Upload(ctx context.Context, in storage.UploadInput) (string, error) {
	data, err := io.ReadAll(in.Reader)
	if err != nil {
		return "", err
	}
	f.objects[in.Key] = data
	return "http://fake/" + in.Key, nil
}

func (f *fakeStorage) Delete(ctx context.Context, key string) error {
	f.deleted = append(f.deleted, key)
	delete(f.objects, key)
	return nil
}

func (f *fakeStorage) GetURL(key string) string { return "http://fake/" + key }

// thumbnailFailingStorage stores the original successfully but always
// fails to upload the thumbnail (identified by its "thumbnail" key
// segment) — used to test that storeImage rolls back the original when
// the thumbnail upload fails partway through.
type thumbnailFailingStorage struct {
	objects map[string][]byte
}

func (f *thumbnailFailingStorage) Upload(ctx context.Context, in storage.UploadInput) (string, error) {
	if strings.Contains(in.Key, "thumbnail") {
		return "", errors.New("simulated thumbnail storage failure")
	}
	data, err := io.ReadAll(in.Reader)
	if err != nil {
		return "", err
	}
	f.objects[in.Key] = data
	return "http://fake/" + in.Key, nil
}

func (f *thumbnailFailingStorage) Delete(ctx context.Context, key string) error {
	delete(f.objects, key)
	return nil
}

func (f *thumbnailFailingStorage) GetURL(key string) string { return "http://fake/" + key }

// --- test helpers ----------------------------------------------------------

func fakeImageUpload(t *testing.T, w, h int) (multipart.File, *multipart.FileHeader) {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	buf := &bytes.Buffer{}
	if err := jpeg.Encode(buf, img, nil); err != nil {
		t.Fatalf("encode fixture image: %v", err)
	}
	data := buf.Bytes()

	body := &bytes.Buffer{}
	mw := multipart.NewWriter(body)
	part, err := mw.CreatePart(textproto.MIMEHeader{
		"Content-Disposition": []string{`form-data; name="image"; filename="totally-not-suspicious.jpg"`},
		"Content-Type":        []string{"image/jpeg"},
	})
	if err != nil {
		t.Fatalf("create multipart part: %v", err)
	}
	if _, err := part.Write(data); err != nil {
		t.Fatalf("write multipart part: %v", err)
	}
	if err := mw.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}

	req := multipartRequest(t, body, mw.Boundary())
	if err := req.ParseMultipartForm(10 << 20); err != nil {
		t.Fatalf("parse multipart form: %v", err)
	}
	f, hdr, err := req.FormFile("image")
	if err != nil {
		t.Fatalf("FormFile: %v", err)
	}
	return f, hdr
}

// multipartRequest builds a fully-formed *http.Request with the given
// multipart body, so tests can exercise the exact FormFile()-based path
// item_service.go/handlers use, rather than reaching into multipart
// internals directly.
func multipartRequest(t *testing.T, body *bytes.Buffer, boundary string) *http.Request {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/items", body)
	req.Header.Set("Content-Type", "multipart/form-data; boundary="+boundary)
	return req
}

func newTestItemService(repo *fakeItemRepository, store *fakeStorage) *ItemService {
	proc := imageproc.New(imageproc.Config{MaxWidth: 100, MaxHeight: 100, ThumbnailWidth: 20, ThumbnailHeight: 20, JPEGQuality: 80})
	return NewItemService(repo, WithStorage(store, proc, 5<<20, 5*time.Second))
}

func baseItemRequest() dto.ItemRequest {
	return dto.ItemRequest{Category: "tops", Name: "Test Shirt", Color: "#FFFFFF"}
}

// --- tests -----------------------------------------------------------------

func TestCreate_WithImage_StoresOriginalAndThumbnailAndPersistsMetadata(t *testing.T) {
	repo := newFakeItemRepository()
	store := newFakeStorage()
	svc := newTestItemService(repo, store)

	file, hdr := fakeImageUpload(t, 50, 50)
	resp, err := svc.Create(context.Background(), "user-1", baseItemRequest(), file, hdr)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if resp.ImageURL == nil || resp.ThumbnailURL == nil {
		t.Fatal("expected ImageURL and ThumbnailURL to be set")
	}
	if len(store.objects) != 2 {
		t.Errorf("expected 2 objects stored (original + thumbnail), got %d", len(store.objects))
	}
	stored := repo.items[resp.ID]
	if stored.ImageStorageKey == nil || stored.ThumbnailStorageKey == nil {
		t.Error("expected storage keys to be persisted on the item for later cleanup")
	}
}

func TestCreate_WithoutImage_LeavesImageFieldsNil(t *testing.T) {
	repo := newFakeItemRepository()
	store := newFakeStorage()
	svc := newTestItemService(repo, store)

	resp, err := svc.Create(context.Background(), "user-1", baseItemRequest(), nil, nil)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if resp.ImageURL != nil {
		t.Error("expected no ImageURL when no file was uploaded")
	}
	if len(store.objects) != 0 {
		t.Errorf("expected no storage writes when no file was uploaded, got %d", len(store.objects))
	}
}

func TestCreate_CleansUpFilesWhenDBInsertFails(t *testing.T) {
	repo := newFakeItemRepository()
	repo.failCreate = true
	store := newFakeStorage()
	svc := newTestItemService(repo, store)

	file, hdr := fakeImageUpload(t, 50, 50)
	_, err := svc.Create(context.Background(), "user-1", baseItemRequest(), file, hdr)
	if err == nil {
		t.Fatal("expected an error when the database insert fails")
	}

	if len(store.objects) != 0 {
		t.Errorf("expected uploaded files to be cleaned up after a failed insert, %d objects remain", len(store.objects))
	}
	if len(store.deleted) != 2 {
		t.Errorf("expected both the original and thumbnail to be deleted during rollback, got %d deletes", len(store.deleted))
	}
}

func TestCreate_CleansUpOriginalWhenThumbnailUploadFails(t *testing.T) {
	repo := newFakeItemRepository()
	fs := &thumbnailFailingStorage{objects: map[string][]byte{}}
	proc := imageproc.New(imageproc.Config{MaxWidth: 100, MaxHeight: 100, ThumbnailWidth: 20, ThumbnailHeight: 20, JPEGQuality: 80})
	svc := NewItemService(repo, WithStorage(fs, proc, 5<<20, 5*time.Second))

	file, hdr := fakeImageUpload(t, 50, 50)
	_, err := svc.Create(context.Background(), "user-1", baseItemRequest(), file, hdr)
	if err == nil {
		t.Fatal("expected an error when the thumbnail upload fails")
	}
	if len(fs.objects) != 0 {
		t.Errorf("expected the original to be rolled back after the thumbnail upload failed, %d objects remain", len(fs.objects))
	}
}

func TestDelete_RemovesImageFiles(t *testing.T) {
	repo := newFakeItemRepository()
	store := newFakeStorage()
	svc := newTestItemService(repo, store)

	file, hdr := fakeImageUpload(t, 50, 50)
	resp, err := svc.Create(context.Background(), "user-1", baseItemRequest(), file, hdr)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := svc.Delete(context.Background(), "user-1", resp.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if len(store.objects) != 0 {
		t.Errorf("expected image files to be deleted along with the item, %d remain", len(store.objects))
	}
}

func TestDelete_RejectsOtherUsersItem(t *testing.T) {
	repo := newFakeItemRepository()
	store := newFakeStorage()
	svc := newTestItemService(repo, store)

	resp, err := svc.Create(context.Background(), "owner", baseItemRequest(), nil, nil)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	err = svc.Delete(context.Background(), "someone-else", resp.ID)
	if !errors.Is(err, ErrForbidden) {
		t.Errorf("expected ErrForbidden when a different user tries to delete the item, got %v", err)
	}
	if _, ok := repo.items[resp.ID]; !ok {
		t.Error("item should not have been deleted after an unauthorized attempt")
	}
}

func TestCreate_RejectsOversizedUpload(t *testing.T) {
	repo := newFakeItemRepository()
	store := newFakeStorage()
	proc := imageproc.New(imageproc.Config{MaxWidth: 100, MaxHeight: 100, ThumbnailWidth: 20, ThumbnailHeight: 20, JPEGQuality: 80})
	svc := NewItemService(repo, WithStorage(store, proc, 10 /* 10 bytes max */, 5*time.Second))

	file, hdr := fakeImageUpload(t, 50, 50)
	_, err := svc.Create(context.Background(), "user-1", baseItemRequest(), file, hdr)
	appErr, ok := apperror.As(err)
	if !ok || appErr.Code != "ERR_FILE_TOO_LARGE" {
		t.Errorf("expected ERR_FILE_TOO_LARGE, got %v", err)
	}
}

// --- Phase 5.1 pattern persistence -----------------------------------------
//
// These are the tests the fabricated "Phase 5.1" report claimed had been
// "architecturally validated" without actually running. They exercise the
// exact bug that existed: ItemPatchRequest had no pattern fields, Update()
// never added them to the fields map, and Create() never copied them from
// the request onto the model — so nothing ever reached the repository.

func TestCreate_CopiesPatternFieldsOntoModel(t *testing.T) {
	repo := newFakeItemRepository()
	store := newFakeStorage()
	svc := newTestItemService(repo, store)

	url := "data:image/png;base64,fake-tile"
	scale := 1.5
	offX, offY, rot := 10.0, -5.0, 90.0
	tint := true

	req := baseItemRequest()
	req.PatternURL = &url
	req.PatternScale = &scale
	req.PatternOffsetX = &offX
	req.PatternOffsetY = &offY
	req.PatternRotation = &rot
	req.PatternTint = &tint

	resp, err := svc.Create(context.Background(), "user-1", req, nil, nil)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	stored := repo.items[resp.ID]
	if stored.PatternURL == nil || *stored.PatternURL != url {
		t.Errorf("expected PatternURL to be persisted onto the model, got %v", stored.PatternURL)
	}
	if stored.PatternScale == nil || *stored.PatternScale != scale {
		t.Errorf("expected PatternScale %v, got %v", scale, stored.PatternScale)
	}
	if resp.PatternURL == nil || *resp.PatternURL != url {
		t.Error("expected ItemResponse to echo back PatternURL")
	}
}

func TestUpdate_WritesPatternFieldsToFieldsMap(t *testing.T) {
	repo := newFakeItemRepository()
	store := newFakeStorage()
	svc := newTestItemService(repo, store)

	created, err := svc.Create(context.Background(), "user-1", baseItemRequest(), nil, nil)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	url := "data:image/png;base64,another-tile"
	scale := 2.0
	patch := dto.ItemPatchRequest{PatternURL: &url, PatternScale: &scale}

	if err := svc.Update(context.Background(), "user-1", created.ID, patch); err != nil {
		t.Fatalf("Update: %v", err)
	}

	if repo.lastUpdateFields == nil {
		t.Fatal("expected Update to call repository Update with a fields map")
	}
	if got, ok := repo.lastUpdateFields["pattern_url"]; !ok || got != url {
		t.Errorf("expected fields[\"pattern_url\"] = %q, got %v (present=%v)", url, got, ok)
	}
	if got, ok := repo.lastUpdateFields["pattern_scale"]; !ok || got != scale {
		t.Errorf("expected fields[\"pattern_scale\"] = %v, got %v (present=%v)", scale, got, ok)
	}
	// Fields the client didn't send this time must not be touched.
	if _, ok := repo.lastUpdateFields["pattern_rotation"]; ok {
		t.Error("expected pattern_rotation to be absent from the update when not sent in the patch")
	}
}

func TestUpdate_ClearPatternNilsOutTheWholeGroup(t *testing.T) {
	repo := newFakeItemRepository()
	store := newFakeStorage()
	svc := newTestItemService(repo, store)

	created, err := svc.Create(context.Background(), "user-1", baseItemRequest(), nil, nil)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	clear := true
	if err := svc.Update(context.Background(), "user-1", created.ID, dto.ItemPatchRequest{ClearPattern: &clear}); err != nil {
		t.Fatalf("Update: %v", err)
	}

	for _, col := range []string{"pattern_url", "pattern_scale", "pattern_offset_x", "pattern_offset_y", "pattern_rotation", "pattern_tint"} {
		val, ok := repo.lastUpdateFields[col]
		if !ok {
			t.Errorf("expected ClearPattern to explicitly set fields[%q] to nil, key was absent", col)
			continue
		}
		if val != nil {
			t.Errorf("expected fields[%q] to be nil after ClearPattern, got %v", col, val)
		}
	}
}

func TestUpdate_RejectsOtherUsersItemBeforeTouchingPatternFields(t *testing.T) {
	repo := newFakeItemRepository()
	store := newFakeStorage()
	svc := newTestItemService(repo, store)

	created, err := svc.Create(context.Background(), "owner", baseItemRequest(), nil, nil)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	url := "data:image/png;base64,intruder-tile"
	err = svc.Update(context.Background(), "someone-else", created.ID, dto.ItemPatchRequest{PatternURL: &url})
	if !errors.Is(err, ErrForbidden) {
		t.Errorf("expected ErrForbidden, got %v", err)
	}
	if repo.lastUpdateFields != nil {
		t.Error("expected repository Update to never be called for a forbidden request")
	}
}
