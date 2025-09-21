# Artscraper Storage Backend

Node.js + Express service for ingesting original artworks, generating WebP + thumbnail variants with Sharp, storing media in MongoDB GridFS, and managing searchable metadata.

## Feature Highlights

- [x] Core health endpoint, configuration loading, and graceful shutdown wiring.
- [x] Multer-based upload pipeline with checksuming, Sharp variants, and rollback on partial failures.
- [x] GridFS streaming for originals, variant selection, and structured metadata retrieval.
- [x] Artist/tag/text search backed by MongoDB indexes.
- [x] Production hardening: input validation (Zod), rate limiting, security headers (Helmet), structured logging (pino/pino-http), and deploy scripts.

## Project Structure

```
src/
  config/         # Environment, MongoDB client, logger, index helpers
  controllers/    # Express handlers orchestrating services and streaming
  middlewares/    # Error handling, validation, and rate limiting
  routes/         # Express routers (artworks)
  services/       # Business logic (upload pipeline + metadata search)
  storage/        # GridFS helpers
  utils/          # Utility helpers (checksums)
scripts/          # Deployment utilities (ensure-indexes, deploy.sh)
```

## Getting Started

1. Copy `.env.example` to `.env` (or supply another file via `ENV_FILE`) and update MongoDB credentials.
2. Install dependencies and run the dev server:

   ```bash
   npm install
   npm run dev
   ```

   The API listens on the port from `PORT` (defaults to `3000`).

3. Start the API in production mode when ready to deploy:

   ```bash
   npm run start:prod
   ```

### Environment variables

| Key | Purpose | Default |
|-----|---------|---------|
| `MONGODB_URI` | Mongo connection string (replica set or Atlas) | – |
| `DB_NAME` | Database used to store metadata & GridFS buckets | – |
| `PORT` | HTTP port for the Express server | `3000` |
| `LOG_LEVEL` | pino logging level (`debug`, `info`, etc.) | `info` in production, `debug` otherwise |
| `ENV_FILE` | Optional path to env file consumed on boot | `.env` |

### Deployment helper

Use the baked-in deployment helper to install dependencies, apply indexes, and boot the API in production mode:

```bash
npm run deploy
```

Override behaviour via env exports when necessary:

```bash
ENV_FILE=.env.production LOG_LEVEL=warn npm run deploy
```

The script executes `npm ci`, runs `node scripts/ensure-indexes.js`, and finally launches `npm run start:prod` (which uses `cross-env` to set `NODE_ENV=production`).

## API Surface

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Returns service uptime and health flag. |
| `POST` | `/artworks` | Upload image, generate variants, persist metadata. |
| `GET` | `/artworks/:id` | Stream original/variant via `?variant=` query. |
| `GET` | `/artworks/:id/metadata` | Fetch JSON metadata for an artwork. |
| `GET` | `/artworks` | Search/filter by artist, tags, or free text. |

### Uploads

- Accepts `multipart/form-data` with `image` field plus optional metadata fields (`title`, `artist`, `description`, `tags`, `createdAt`, `extra`).
- Only JPEG, PNG, WebP, AVIF, and GIF inputs are accepted.
- The service returns the stored artwork id and variant file identifiers; metadata is persisted in `artworks_meta`.

### Streaming

- `variant` query defaults to `original`; accepted values: `original`, `webp`, `thumbnail`.
- Responses include `Cache-Control`/`ETag` headers for long-lived CDN caching.

### Search

- Filters available: `artist`, `tags` (comma-separated), `q` full-text search.
- Pagination via `limit` (1–100) and `skip` (>=0).
- Indexed on artist+createdAt, tags, and text to guarantee predictable latency.

## Operational Notes

- Rate limiting: global limiter (300 requests / 15 min per IP) with a tighter upload limiter (30 uploads / hour). Health checks are exempt.
- Validation: Zod schemas guard route params, bodies, and queries before controllers execute.
- Logging: pino-http injects `req.log` for request-scoped JSON logs; redacts `Authorization` headers and respects `LOG_LEVEL`.
- Security headers: Helmet applies safe defaults compatible with JSON APIs.
- Index provisioning: `scripts/ensure-indexes.js` connects using the configured env file, applies `artworks_meta` indexes, and exits.

## Roadmap Status

| Milestone | Status | Notes |
|-----------|--------|-------|
| Core Server & Mongo | Complete | Health endpoint, connection management, graceful shutdown. |
| Upload Pipeline | Complete | Multer memory storage, checksuming, Sharp-generated WebP & thumbnail variants. |
| Retrieval API | Complete | GridFS streaming with cache headers and dedicated metadata route. |
| Search & Filters | Complete | Artist/tag/text filters with supporting Mongo indexes. |
| Hardening & Ops | Complete | Validation, rate limiting, logging, helmet, deploy script, index helper. |

## Development Tips

- `scripts/ensure-indexes.js` can be run locally to build indexes against a dev database.
- Use `LOG_LEVEL=debug` when troubleshooting the upload pipeline; request logs include scoped ids and errors.
- The service trusts `X-Forwarded-For` headers once `app.set(''trust proxy'', 1)` is in effect—configure your load balancer accordingly.
