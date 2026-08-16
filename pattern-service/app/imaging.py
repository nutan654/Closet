"""
app/imaging.py

Pure image-processing logic for LifeCloset's pattern engine. Deliberately
framework-free (no FastAPI, no I/O) so every function here is a plain
input -> output transform that can be unit tested with nothing but Pillow
and numpy — see tests/test_imaging.py.

Design goal (per the Phase 5 brief): a reliable, deterministic pipeline
beats a fancy unreliable one. This is classic image processing —
offset-and-blend seamless tiling, palette quantization — not machine
learning. No model weights, no GPU, no network calls.

Pipeline:
    raw bytes
        -> decode + normalize orientation
        -> crop to square
        -> resize to a bounded tile size
        -> make_seamless()   (offset/blend so edges tile cleanly)
        -> encode as base64 PNG data URL

    (independently, on the *original* crop, before the seam blend distorts
    color balance)
        -> extract_palette()  dominant colors for the tint/color system
"""

from __future__ import annotations

import base64
import io
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageOps

# Bounds mirror the spirit of the Go backend's ImageConfig (configurable
# limits, nothing hardcoded deep in the algorithm) — kept as module-level
# constants here since this service has exactly one job.
MIN_TILE_SIZE = 64
MAX_TILE_SIZE = 1024
DEFAULT_TILE_SIZE = 512
DEFAULT_PALETTE_SIZE = 6
MAX_PALETTE_SIZE = 12


class InvalidImageError(ValueError):
    """Raised when the input bytes can't be decoded as a supported image."""


@dataclass
class ProcessedPattern:
    tile_data_url: str
    width: int
    height: int
    palette: list[str]


def load_image(raw: bytes) -> Image.Image:
    """Decode raw bytes into a normalized RGB Pillow image.

    Applies EXIF-orientation correction (phones love to embed a rotation
    flag instead of rotating the pixels) and drops alpha/CMYK down to RGB
    so every downstream step can assume a consistent 3-channel image.
    """
    if not raw:
        raise InvalidImageError("empty file")
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except Exception as exc:  # Pillow raises several exception types here
        raise InvalidImageError(f"could not decode image: {exc}") from exc

    img = ImageOps.exif_transpose(img)
    if img.mode != "RGB":
        img = img.convert("RGB")
    return img


def crop_to_square(img: Image.Image) -> Image.Image:
    """Center-crop to a square, so the tile has no directional bias."""
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return img.crop((left, top, left + side, top + side))


def clamp_tile_size(size: int) -> int:
    return max(MIN_TILE_SIZE, min(MAX_TILE_SIZE, int(size)))


def make_seamless(img: Image.Image, feather_ratio: float = 0.18) -> Image.Image:
    """Turn an arbitrary crop into a tile that repeats without a visible seam.

    Classic "offset and blend" technique:
      1. Roll the image by half its width/height (numpy wrap-around), which
         moves the original edges into the *center* of the frame and puts
         two brand-new hard seams along the middle instead.
      2. Feather-blend a mirrored copy across those two new center seams,
         so the discontinuity is smoothed into a gradient instead of a
         hard line.

    This is O(w*h), fully deterministic, and doesn't require any content-
    aware inpainting — appropriate for "practical" per the brief rather
    than a research-grade seamless-texture-synthesis algorithm.
    """
    arr = np.asarray(img).astype(np.float32)
    h, w = arr.shape[:2]

    rolled = np.roll(arr, shift=(h // 2, w // 2), axis=(0, 1))

    feather = max(4, int(min(w, h) * feather_ratio))

    # Horizontal seam blend (around the center row)
    blended = rolled.copy()
    for i in range(feather):
        alpha = i / feather  # 0 at the seam -> 1 further away
        top_row = (h // 2 - feather // 2 + i) % h
        mirror_row = (h // 2 + feather // 2 - i) % h
        blended[top_row] = rolled[top_row] * alpha + rolled[mirror_row] * (1 - alpha)

    # Vertical seam blend (around the center column), applied on top of
    # the horizontally-blended array so corners get smoothed by both passes.
    result = blended.copy()
    for j in range(feather):
        alpha = j / feather
        left_col = (w // 2 - feather // 2 + j) % w
        mirror_col = (w // 2 + feather // 2 - j) % w
        result[:, left_col] = blended[:, left_col] * alpha + blended[:, mirror_col] * (1 - alpha)

    result = np.clip(result, 0, 255).astype(np.uint8)
    return Image.fromarray(result, mode="RGB")


def extract_palette(img: Image.Image, n_colors: int = DEFAULT_PALETTE_SIZE) -> list[str]:
    """Return up to n_colors dominant hex colors, most-frequent first.

    Uses Pillow's median-cut adaptive quantization (`Image.ADAPTIVE`) —
    fast, deterministic, no external ML dependency — then reads back the
    palette sorted by how many pixels map to each entry.
    """
    n_colors = max(1, min(MAX_PALETTE_SIZE, int(n_colors)))
    small = img.copy()
    small.thumbnail((150, 150))  # quantizing a huge image is wasted work

    quantized = small.convert("P", palette=Image.ADAPTIVE, colors=n_colors)
    palette = quantized.getpalette()  # flat [r,g,b, r,g,b, ...]
    color_counts = quantized.getcolors()  # [(count, paletteIndex), ...]
    if not color_counts:
        return []

    color_counts.sort(key=lambda c: c[0], reverse=True)

    hex_colors: list[str] = []
    for _count, idx in color_counts:
        r = palette[idx * 3]
        g = palette[idx * 3 + 1]
        b = palette[idx * 3 + 2]
        hex_colors.append("#{:02x}{:02x}{:02x}".format(r, g, b))
    return hex_colors


def encode_png_data_url(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def process_pattern(
    raw: bytes,
    tile_size: int = DEFAULT_TILE_SIZE,
    palette_size: int = DEFAULT_PALETTE_SIZE,
) -> ProcessedPattern:
    """Full pipeline: raw upload bytes -> seamless tile + palette."""
    img = load_image(raw)
    square = crop_to_square(img)

    palette = extract_palette(square, palette_size)

    size = clamp_tile_size(tile_size)
    resized = square.resize((size, size), Image.LANCZOS)
    tile = make_seamless(resized)

    return ProcessedPattern(
        tile_data_url=encode_png_data_url(tile),
        width=tile.width,
        height=tile.height,
        palette=palette,
    )
