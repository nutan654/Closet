FROM python:3.12-slim

WORKDIR /srv

# Pillow needs these system libs to build/load image codecs (jpeg/webp/png)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg62-turbo libwebp7 zlib1g \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000
# Render (and most PaaS beyond Cloud Run) injects PORT at runtime and
# expects the process to bind to it — shell form so ${PORT:-8000} actually
# expands; exec form (the previous ["uvicorn", ...] array) can't do that.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
