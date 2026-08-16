package imageproc

import (
	"image"
	"math"

	"golang.org/x/image/draw"
)

// resizeToFit scales img down to fit within maxW x maxH while preserving
// aspect ratio, using a high-quality Catmull-Rom filter. It never
// upscales — an image already smaller than the target box is returned
// unchanged, so a small source photo doesn't get blown up into a blurry
// thumbnail.
func resizeToFit(img image.Image, maxW, maxH int) image.Image {
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	if maxW <= 0 || maxH <= 0 || (w <= maxW && h <= maxH) {
		return img
	}

	scale := math.Min(float64(maxW)/float64(w), float64(maxH)/float64(h))
	newW := int(math.Round(float64(w) * scale))
	newH := int(math.Round(float64(h) * scale))
	if newW < 1 {
		newW = 1
	}
	if newH < 1 {
		newH = 1
	}

	dst := image.NewRGBA(image.Rect(0, 0, newW, newH))
	draw.CatmullRom.Scale(dst, dst.Bounds(), img, b, draw.Src, nil)
	return dst
}
