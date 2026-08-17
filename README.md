# LifeCloset

A full-stack digital wardrobe application that combines interactive SVG rendering, real garment image processing, persistent wardrobe management, and personalized outfit tracking.


- **Vercel:** https://closet-ruddy.vercel.app
- **Render:** https://lifecloset-web.onrender.com

## Overview

LifeCloset lets users digitize their wardrobe, customize a virtual dressing doll with their own clothing, process fabric images into reusable textures, save outfits, and maintain a persistent wear history.

The application is built as a polyglot system where each technology is used for the part of the system it is best suited for:

* **Next.js + React** — interactive UI, SVG-based virtual dressing system, client-side pattern editing
* **Go + Gin** — REST API, authentication, validation, persistence, and business logic
* **PostgreSQL** — users, wardrobe items, outfits, and wear history
* **Python + FastAPI** — image processing and fabric pattern generation
* **Pillow + NumPy** — palette extraction and seamless texture generation
* **Docker** — isolated, reproducible service builds
* **Render / Vercel / Cloud infrastructure** — deployment-ready architecture

## Engineering Highlights

* JWT-based authentication with bcrypt password hashing
* Persistent per-user wardrobe and outfit data using PostgreSQL
* RESTful API organized around versioned `/api/v1` endpoints
* Storage abstraction supporting local development and cloud object storage
* Stateless Python image-processing service
* Seamless fabric texture generation using NumPy-based offset and blending
* Five-color fabric palette extraction using Pillow median-cut quantization
* SVG garment rendering with deterministic layer ordering
* Dynamic garment silhouettes and fit transformations
* Client-side pattern scaling, rotation, tinting, and live preview
* Wear-history tracking and outfit persistence
* Dockerized backend and pattern-processing services
* Accessibility-focused UI with keyboard navigation and screen-reader support
* Automated testing with Vitest and 90%+ reported coverage

## System Architecture

```text
                         ┌───────────────────────────┐
                         │       Next.js / React      │
                         │                           │
                         │  SVG Doll                 │
                         │  Wardrobe UI              │
                         │  Outfit Editor             │
                         │  Wear Journal              │
                         └─────────────┬─────────────┘
                                       │
                              REST / JSON API
                                       │
                                       ▼
                         ┌───────────────────────────┐
                         │       Go + Gin API        │
                         │                           │
                         │  Authentication           │
                         │  Validation               │
                         │  Business Logic           │
                         │  CRUD                     │
                         │  Storage Abstraction      │
                         └───────┬───────────┬───────┘
                                 │           │
                                 ▼           ▼
                         ┌────────────┐  ┌─────────────────┐
                         │ PostgreSQL │  │ Pattern Service │
                         │            │  │ Python/FastAPI  │
                         │ Users      │  │                 │
                         │ Items      │  │ Pillow          │
                         │ Outfits    │  │ NumPy           │
                         │ Wear Logs  │  │                 │
                         └────────────┘  └─────────────────┘
```

### Why a polyglot architecture?

Go acts as the system of record because it provides a strongly typed, efficient API layer for authentication, validation, persistence, and business logic.

Python is isolated to image processing, where Pillow and NumPy provide mature primitives for image manipulation, color quantization, and numerical operations.

The React frontend handles interactive SVG rendering and pattern manipulation entirely on the client, avoiding unnecessary API round trips during visual editing.

## Image Processing Pipeline

A clothing or fabric image follows this pipeline:

```text
User Upload
    │
    ▼
Go API
    │
    ▼
Python FastAPI Service
    │
    ├── Image normalization
    ├── Seamless texture generation
    └── 5-color palette extraction
    │
    ▼
Processed Texture + Palette
    │
    ▼
SVG <pattern>
    │
    ▼
Virtual Garment
```

The pattern generator creates seamless textures using NumPy-based offset-and-blend processing. Palette extraction uses Pillow's median-cut quantization to derive representative colors from the source image.

The resulting texture is applied directly to garment-specific SVG silhouettes, allowing the same fabric to be previewed across different clothing shapes.

## Virtual Dressing System

The virtual doll is implemented as a layered SVG rendering system.

Garment layers are rendered in deterministic z-order so that elements such as hair, body, tops, bottoms, dresses, outerwear, and accessories compose correctly.

Garments support multiple silhouettes and fit variants rather than relying on a single generic shape.

Pattern manipulation is performed client-side, including:

* Scale
* Rotation
* Position
* Color tint
* Texture application
* Garment-specific clipping

This keeps interactive editing responsive without requiring a backend request for every visual adjustment.

## Backend

The Go backend exposes a versioned REST API under:

```text
/api/v1
```

Core responsibilities include:

* Authentication and session handling
* Password hashing
* User management
* Wardrobe item CRUD
* Outfit management
* Wear-history tracking
* Input validation
* PostgreSQL persistence
* Image-storage abstraction
* Communication with the pattern-processing service

The storage layer is provider-based, allowing local filesystem storage during development and cloud object storage in production without changing application-level business logic.

## Data Model

The PostgreSQL layer manages persistent entities including:

```text
Users
 ├── Wardrobe Items
 ├── Outfits
 └── Wear History
```

Database migrations are maintained inside:

```text
backend/internal/database/migrations/
```

## Project Structure

```text
Closet/
├── app/                         # Next.js application routes
├── components/                 # UI and SVG dressing components
├── lib/                        # Frontend utilities and API helpers
├── backend/
│   ├── cmd/api/                # Go API entrypoint
│   ├── internal/
│   │   ├── auth/               # Authentication
│   │   ├── config/             # Environment configuration
│   │   ├── database/            # PostgreSQL and migrations
│   │   ├── handlers/            # HTTP handlers
│   │   ├── storage/             # Storage abstraction
│   │   └── ...
│   ├── Dockerfile
│   ├── go.mod
│   └── go.sum
├── pattern-service/
│   ├── main.py                 # FastAPI service
│   └── ...
├── render.yaml                 # Render deployment configuration
├── package.json
└── README.md
```

## Local Development

### Frontend

```bash
npm install
npm run dev
```

The Next.js application runs on:

```text
http://localhost:3000
```

### Go API

```bash
cd backend
go mod download
go run ./cmd/api
```

### Pattern Service

```bash
cd pattern-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Create the required environment variables from the provided `.env.example` files before starting the services.

## Testing

Frontend tests use Vitest.

```bash
npm test
```

The project includes tests covering core application behavior, with reported coverage above 90%.

## Deployment

The repository is structured for independent deployment of the frontend, API, and image-processing service.

```text
Frontend      → Vercel
Go API        → Render / Cloud Run
Pattern API   → Render / Cloud Run
PostgreSQL    → Managed PostgreSQL / Cloud SQL
Image Storage → GCS / S3-compatible storage
```

Dockerfiles are provided for reproducible backend and service builds.

For production deployments, cloud object storage should be used instead of local container storage because local container filesystems are ephemeral.

## Technical Stack

| Layer            | Technologies                                   |
| ---------------- | ---------------------------------------------- |
| Frontend         | Next.js 14, React 18, JavaScript, Tailwind CSS |
| Animation        | Framer Motion                                  |
| Graphics         | SVG                                            |
| Backend          | Go 1.22, Gin                                   |
| Database         | PostgreSQL                                     |
| Authentication   | JWT, bcrypt                                    |
| Image Processing | Python, FastAPI, Pillow, NumPy                 |
| Testing          | Vitest                                         |
| Containers       | Docker                                         |
| Deployment       | Vercel, Render, Cloud Run                      |
| Cloud Storage    | GCS / S3-compatible storage                    |

## Engineering Focus

LifeCloset was designed around three principles:

1. **Separation of concerns** — UI rendering, API/business logic, persistence, and image processing are independently structured.
2. **Technology fit** — Go handles the core API and data layer, Python handles numerical image processing, and React/SVG handles interactive rendering.
3. **Production-oriented design** — authentication, persistent storage, migrations, provider-based storage, containerization, testing, and deployment configuration are treated as first-class parts of the application.

## Author

**Nutan Bisandre**

[GitHub](https://github.com/nutan654)
