package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/jpeg"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"closet-backend/internal/patternproxy"
)

func fixtureJPEGBytes(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	buf := &bytes.Buffer{}
	if err := jpeg.Encode(buf, img, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatalf("encode fixture jpeg: %v", err)
	}
	return buf.Bytes()
}

func multipartImageRequest(t *testing.T, fieldName, filename string, data []byte) (*http.Request, string) {
	t.Helper()
	body := &bytes.Buffer{}
	w := multipart.NewWriter(body)
	part, err := w.CreateFormFile(fieldName, filename)
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write(data); err != nil {
		t.Fatalf("write form file: %v", err)
	}
	if err := w.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/patterns/process", body)
	req.Header.Set("Content-Type", w.FormDataContentType())
	return req, w.FormDataContentType()
}

func TestPatternHandler_Process_Success(t *testing.T) {
	gin.SetMode(gin.TestMode)

	fakeService := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"tileDataUrl": "data:image/png;base64,xyz",
			"width":       256,
			"height":      256,
			"palette":     []string{"#111111"},
		})
	}))
	defer fakeService.Close()

	client, err := patternproxy.New(context.Background(), fakeService.URL, 5*time.Second, false, "")
	if err != nil {
		t.Fatalf("patternproxy.New: %v", err)
	}
	h := NewPatternHandler(client, 10*1024*1024)

	req, _ := multipartImageRequest(t, "image", "fabric.jpg", fixtureJPEGBytes(t, 40, 40))
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = req

	h.Process(c)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Success bool `json:"success"`
		Data    struct {
			Width   int      `json:"width"`
			Palette []string `json:"palette"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !resp.Success || resp.Data.Width != 256 || len(resp.Data.Palette) != 1 {
		t.Errorf("unexpected response body: %s", rec.Body.String())
	}
}

func TestPatternHandler_Process_RejectsNonImage(t *testing.T) {
	gin.SetMode(gin.TestMode)

	client, err := patternproxy.New(context.Background(), "http://127.0.0.1:1", 1*time.Second, false, "") // never actually called
	if err != nil {
		t.Fatalf("patternproxy.New: %v", err)
	}
	h := NewPatternHandler(client, 10*1024*1024)

	req, _ := multipartImageRequest(t, "image", "not-an-image.txt", []byte("hello world, definitely not a jpeg"))
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = req

	h.Process(c)

	if rec.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("status = %d, want 415; body=%s", rec.Code, rec.Body.String())
	}
}

func TestPatternHandler_Process_MissingFile(t *testing.T) {
	gin.SetMode(gin.TestMode)

	client, err := patternproxy.New(context.Background(), "http://127.0.0.1:1", 1*time.Second, false, "")
	if err != nil {
		t.Fatalf("patternproxy.New: %v", err)
	}
	h := NewPatternHandler(client, 10*1024*1024)

	body := &bytes.Buffer{}
	w := multipart.NewWriter(body)
	_ = w.Close() // no fields at all
	req := httptest.NewRequest(http.MethodPost, "/api/v1/patterns/process", body)
	req.Header.Set("Content-Type", w.FormDataContentType())

	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = req

	h.Process(c)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body=%s", rec.Code, rec.Body.String())
	}
}

func TestPatternHandler_Process_ServiceUnavailable(t *testing.T) {
	gin.SetMode(gin.TestMode)

	client, err := patternproxy.New(context.Background(), "http://127.0.0.1:1", 500*time.Millisecond, false, "") // nothing listens here
	if err != nil {
		t.Fatalf("patternproxy.New: %v", err)
	}
	h := NewPatternHandler(client, 10*1024*1024)

	req, _ := multipartImageRequest(t, "image", "fabric.jpg", fixtureJPEGBytes(t, 20, 20))
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = req

	h.Process(c)

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502; body=%s", rec.Code, rec.Body.String())
	}
}
