"""
app/main.py

Pattern Service — a small FastAPI microservice dedicated to one job: turn
a user-uploaded fabric/pattern photo into (a) a seamlessly-tiling texture
and (b) a dominant color palette, per Phase 5 Steps 7-9 of the LifeCloset
brief.

Why a separate Python service instead of doing this in Go?
Pillow + numpy give a fast, well-tested path to median-cut palette
quantization and array-based seam blending that would mean reimplementing
(or badly approximating) real image-processing primitives in Go. The Go
backend stays the system of record (auth, Postgres, existing image
storage) and treats this service as a stateless internal tool it calls
over HTTP — same pattern you'd use to bolt on a real ML/CV service later
without touching the rest of the architecture.

This service is intentionally stateless: it does not touch Postgres, does
not know about users, and does not persist anything. It receives bytes,
returns bytes (as a data URL) + metadata.
"""

from __future__ import annotations

import logging
import os
import secrets

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.imaging import (
    DEFAULT_PALETTE_SIZE,
    DEFAULT_TILE_SIZE,
    InvalidImageError,
    process_pattern,
)

logger = logging.getLogger("pattern-service")

app = FastAPI(
    title="LifeCloset Pattern Service",
    description="Seamless-tiling + palette extraction for garment fabric patterns.",
    version="1.0.0",
)

# The Go API is the only intended caller (server-to-server, inside the
# docker-compose network), but CORS is left permissive-by-config for local
# dev convenience if someone wants to hit this directly from a browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB — mirrors the Go backend's default

# On Render's free tier this service can't be a private/internal-only
# service (that tier only exists on paid "pserv" plans) — it has to be a
# public "web" service instead. PATTERN_SERVICE_API_KEY closes that gap
# cheaply: if it's set, every /process call must present it via
# X-API-Key, so the endpoint isn't wide open to the internet. Leave it
# unset for local/docker-compose dev and nothing changes — the check is
# skipped entirely, same "optional feature, no forced setup" pattern as
# GEMINI_API_KEY on the Go side.
API_KEY = os.environ.get("PATTERN_SERVICE_API_KEY", "")


def _require_api_key(x_api_key: str | None) -> None:
    if not API_KEY:
        return
    if not x_api_key or not secrets.compare_digest(x_api_key, API_KEY):
        raise HTTPException(status_code=401, detail="missing or invalid X-API-Key")


class ProcessResponse(BaseModel):
    tileDataUrl: str
    width: int
    height: int
    palette: list[str]


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/process", response_model=ProcessResponse)
async def process(
    image: UploadFile = File(...),
    tileSize: int = Form(DEFAULT_TILE_SIZE),
    paletteSize: int = Form(DEFAULT_PALETTE_SIZE),
    x_api_key: str | None = Header(default=None),
) -> ProcessResponse:
    _require_api_key(x_api_key)
    raw = await image.read()

    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="file exceeds maximum allowed size")
    if not raw:
        raise HTTPException(status_code=400, detail="empty upload")

    try:
        result = process_pattern(raw, tile_size=tileSize, palette_size=paletteSize)
    except InvalidImageError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        logger.exception("pattern processing failed")
        raise HTTPException(status_code=500, detail="pattern processing failed") from None

    return ProcessResponse(
        tileDataUrl=result.tile_data_url,
        width=result.width,
        height=result.height,
        palette=result.palette,
    )
