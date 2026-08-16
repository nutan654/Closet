"""
tests/test_imaging.py

Deterministic unit tests for app/imaging.py. Written to run either under
pytest (`pytest tests/`) or directly (`python3 tests/test_imaging.py`) so
they're runnable in environments without pytest installed.
"""

import io
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
from PIL import Image

from app.imaging import (
    InvalidImageError,
    clamp_tile_size,
    crop_to_square,
    encode_png_data_url,
    extract_palette,
    load_image,
    make_seamless,
    process_pattern,
)


def _solid_png_bytes(color=(200, 50, 90), size=(80, 120)):
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _checker_png_bytes(size=(64, 64), n=8):
    arr = np.zeros((size[1], size[0], 3), dtype=np.uint8)
    step_y, step_x = size[1] // n, size[0] // n
    for i in range(n):
        for j in range(n):
            color = (230, 230, 230) if (i + j) % 2 == 0 else (40, 40, 60)
            arr[i * step_y:(i + 1) * step_y, j * step_x:(j + 1) * step_x] = color
    img = Image.fromarray(arr, mode="RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_load_image_valid():
    img = load_image(_solid_png_bytes())
    assert img.mode == "RGB"
    assert img.size == (80, 120)


def test_load_image_rejects_empty():
    try:
        load_image(b"")
        assert False, "expected InvalidImageError"
    except InvalidImageError:
        pass


def test_load_image_rejects_garbage():
    try:
        load_image(b"this is not an image, just plain text bytes")
        assert False, "expected InvalidImageError"
    except InvalidImageError:
        pass


def test_crop_to_square():
    img = Image.new("RGB", (200, 100), (10, 10, 10))
    square = crop_to_square(img)
    assert square.size == (100, 100)


def test_crop_to_square_already_square():
    img = Image.new("RGB", (50, 50), (10, 10, 10))
    square = crop_to_square(img)
    assert square.size == (50, 50)


def test_clamp_tile_size_bounds():
    assert clamp_tile_size(10) == 64          # below MIN clamps up
    assert clamp_tile_size(5000) == 1024       # above MAX clamps down
    assert clamp_tile_size(300) == 300         # within range untouched


def test_make_seamless_preserves_dimensions():
    img = Image.new("RGB", (128, 128), (100, 150, 200))
    tile = make_seamless(img)
    assert tile.size == img.size
    assert tile.mode == "RGB"


def test_make_seamless_edges_match_opposite_edges():
    # The whole point of "seamless": tiling the output next to a copy of
    # itself should not show a hard color jump at the boundary. We assert
    # this numerically — the pixel column at x=0 should be reasonably
    # close to the pixel column at x=width-1 (and same for rows), which
    # is what makes edge-to-edge tiling look continuous.
    checker = Image.open(io.BytesIO(_checker_png_bytes())).convert("RGB")
    tile = make_seamless(checker)
    arr = np.asarray(tile).astype(np.int16)

    left_edge = arr[:, 0, :]
    right_edge = arr[:, -1, :]
    top_edge = arr[0, :, :]
    bottom_edge = arr[-1, :, :]

    # Not pixel-perfect (feather blending is a smooth gradient, not a
    # mirror), but average brightness across the opposite edges should be
    # much closer post-blend than two random unrelated edges would be.
    left_right_diff = np.abs(left_edge.mean() - right_edge.mean())
    top_bottom_diff = np.abs(top_edge.mean() - bottom_edge.mean())
    assert left_right_diff < 40, f"left/right seam too harsh: {left_right_diff}"
    assert top_bottom_diff < 40, f"top/bottom seam too harsh: {top_bottom_diff}"


def test_extract_palette_solid_color():
    img = Image.new("RGB", (100, 100), (255, 0, 0))
    palette = extract_palette(img, n_colors=3)
    assert len(palette) >= 1
    assert palette[0].startswith("#")
    # Should be very close to pure red
    r = int(palette[0][1:3], 16)
    g = int(palette[0][3:5], 16)
    b = int(palette[0][5:7], 16)
    assert r > 200 and g < 40 and b < 40


def test_extract_palette_respects_n_colors_ceiling():
    img = Image.open(io.BytesIO(_checker_png_bytes())).convert("RGB")
    palette = extract_palette(img, n_colors=4)
    assert 1 <= len(palette) <= 4


def test_extract_palette_clamps_out_of_range_n():
    img = Image.new("RGB", (50, 50), (0, 200, 0))
    palette = extract_palette(img, n_colors=999)  # way above MAX_PALETTE_SIZE
    assert len(palette) <= 12


def test_encode_png_data_url_shape():
    img = Image.new("RGB", (10, 10), (1, 2, 3))
    url = encode_png_data_url(img)
    assert url.startswith("data:image/png;base64,")


def test_process_pattern_end_to_end():
    raw = _checker_png_bytes(size=(200, 140))  # non-square on purpose
    result = process_pattern(raw, tile_size=128, palette_size=5)
    assert result.width == 128
    assert result.height == 128
    assert result.tile_data_url.startswith("data:image/png;base64,")
    assert 1 <= len(result.palette) <= 5


def test_process_pattern_rejects_invalid_input():
    try:
        process_pattern(b"not an image")
        assert False, "expected InvalidImageError"
    except InvalidImageError:
        pass


def test_process_pattern_clamps_tile_size():
    raw = _solid_png_bytes(size=(300, 300))
    result = process_pattern(raw, tile_size=99999)
    assert result.width == 1024
    assert result.height == 1024


if __name__ == "__main__":
    # Allow `python3 tests/test_imaging.py` without pytest installed.
    failures = 0
    tests = [(name, fn) for name, fn in list(globals().items()) if name.startswith("test_")]
    for name, fn in tests:
        try:
            fn()
            print(f"PASS  {name}")
        except AssertionError as e:
            failures += 1
            print(f"FAIL  {name}: {e}")
        except Exception as e:
            failures += 1
            print(f"ERROR {name}: {e!r}")
    print(f"\n{len(tests) - failures}/{len(tests)} passed")
    sys.exit(1 if failures else 0)
