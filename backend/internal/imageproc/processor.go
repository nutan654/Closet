// Package imageproc turns validated upload bytes into the two assets every
// wardrobe item image produces — a normalized "original" and a thumbnail
// — per Phase 3 Step 4. It knows nothing about storage or the database;
// ItemService wires this together with storage.Storage and the
// repository, keeping each concern in its own layer:
//
//	Handler -> Service -> ImageProcessor + Storage -> Repository -> Postgres
package imageproc

import (
	"bytes"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"

	"golang.org/x/image/webp"

	"closet-backend/internal/apperror"
)

// Config bounds what processing is allowed to do — Phase 3 Step 4's
// "use configurable limits" requirement. Populated from config.ImageConfig,
// never hardcoded here.
type Config struct {
	MaxWidth        int
	MaxHeight       int
	ThumbnailWidth  int
	ThumbnailHeight int
	JPEGQuality     int // 1-100
}

type Processor struct {
	cfg Config
}

func New(cfg Config) *Processor {
	if cfg.JPEGQuality <= 0 || cfg.JPEGQuality > 100 {
		cfg.JPEGQuality = 85
	}
	return &Processor{cfg: cfg}
}

// Processed is everything the item service needs to store two assets and
// record their metadata in Postgres.
type Processed struct {
	OriginalBytes    []byte
	OriginalMimeType string
	OriginalWidth    int
	OriginalHeight   int

	ThumbnailBytes  []byte
	ThumbnailWidth  int
	ThumbnailHeight int
}

// ThumbnailMimeType is fixed: thumbnails are always re-encoded as JPEG
// regardless of the source format. Go's standard library can decode WebP
// (via golang.org/x/image/webp) but has no WebP encoder, so JPEG is the
// one format guaranteed to round-trip for every accepted input type.
const ThumbnailMimeType = "image/jpeg"

// Process decodes raw upload bytes (already validated as mimeType by the
// upload package) and produces the original + thumbnail pair.
//
// Design decision — "do not destroy the original upload": if the decoded
// image is already within MaxWidth/MaxHeight, its bytes are stored
// completely untouched: no re-encode, no recompression, no quality loss.
// It's only resized (and, since resizing requires re-encoding, converted
// to JPEG) when it actually exceeds the configured maximum dimensions.
// The thumbnail is always freshly generated and always JPEG.
func (p *Processor) Process(raw []byte, mimeType string) (*Processed, error) {
	img, err := decode(raw, mimeType)
	if err != nil {
		return nil, err
	}

	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= 0 || h <= 0 {
		return nil, apperror.ErrInvalidImage
	}

	out := &Processed{
		OriginalBytes:    raw,
		OriginalMimeType: mimeType,
		OriginalWidth:    w,
		OriginalHeight:   h,
	}

	if (p.cfg.MaxWidth > 0 && w > p.cfg.MaxWidth) || (p.cfg.MaxHeight > 0 && h > p.cfg.MaxHeight) {
		resized := resizeToFit(img, p.cfg.MaxWidth, p.cfg.MaxHeight)
		buf := &bytes.Buffer{}
		if err := jpeg.Encode(buf, resized, &jpeg.Options{Quality: p.cfg.JPEGQuality}); err != nil {
			return nil, fmt.Errorf("imageproc: encode resized original: %w", err)
		}
		rb := resized.Bounds()
		out.OriginalBytes = buf.Bytes()
		out.OriginalMimeType = "image/jpeg"
		out.OriginalWidth = rb.Dx()
		out.OriginalHeight = rb.Dy()
		// Reuse the already-decoded (and already-resized, if applicable)
		// image for the thumbnail pass below instead of decoding twice.
		img = resized
	}

	thumb := resizeToFit(img, p.cfg.ThumbnailWidth, p.cfg.ThumbnailHeight)
	tbuf := &bytes.Buffer{}
	if err := jpeg.Encode(tbuf, thumb, &jpeg.Options{Quality: p.cfg.JPEGQuality}); err != nil {
		return nil, fmt.Errorf("imageproc: encode thumbnail: %w", err)
	}
	tb := thumb.Bounds()
	out.ThumbnailBytes = tbuf.Bytes()
	out.ThumbnailWidth = tb.Dx()
	out.ThumbnailHeight = tb.Dy()

	return out, nil
}

// decode wraps each accepted format's decoder and normalizes any
// truncated/corrupt/malformed file into apperror.ErrInvalidImage instead
// of leaking a raw library error to the client.
func decode(raw []byte, mimeType string) (image.Image, error) {
	var (
		img image.Image
		err error
	)
	switch mimeType {
	case "image/jpeg":
		img, err = jpeg.Decode(bytes.NewReader(raw))
	case "image/png":
		img, err = png.Decode(bytes.NewReader(raw))
	case "image/webp":
		img, err = webp.Decode(bytes.NewReader(raw))
	default:
		return nil, apperror.ErrUnsupportedFileType
	}
	if err != nil {
		return nil, apperror.ErrInvalidImage
	}
	return img, nil
}
