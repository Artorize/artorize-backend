# Artscraper Storage Backend

Node.js + Express service for ingesting original/protected artwork assets with associated mask layers and JSON summaries, storing media in MongoDB GridFS, and managing searchable metadata.

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

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run with in-memory MongoDB for testing:
   ```bash
   npm run mongo:memory  # In one terminal
   npm run dev          # In another terminal
   ```

3. Or connect to existing MongoDB:
   ```bash
   # Generate default config (if not exists)
   npm run deploy
   # Update config/runtime.json with your MongoDB credentials
   npm run dev
   ```

### Configuration file

Settings are loaded from `config/runtime.json`. The deployment helper will materialise this file with safe defaults if it does not exist.

| Key | Purpose | Default |
|-----|---------|---------|
| `environment` | Runtime environment label mirrored into `NODE_ENV`. | `production` |
| `port` | HTTP port for the Express server. | `3000` |
| `mongo.uri` | Mongo connection string (replica set or Atlas). | `mongodb://localhost:27017` |
| `mongo.dbName` | Database used to store metadata & GridFS buckets. | `artgallery` |
| `logLevel` | pino logging level (`debug`, `info`, etc.). | `info` |

## Deployment

### Local Development (Quick Start)

```bash
npm run deploy
```

This will:
- Create default `config/runtime.json` if missing
- Install dependencies
- Create MongoDB indexes
- Start the server

### Production Deployment

#### Option 1: Debian 12 Automated Deployment (Recommended)

For a complete Debian 12 server setup with all dependencies:

```bash
# Clone the repository
git clone https://github.com/Artorize/artorize-backend.git
cd artorize-backend

# Run the automated deployment script
sudo ./deploy-debian12.sh --production --domain your-domain.com
```

This script will:
- Install Node.js 20, MongoDB 7.0, and system dependencies
- Create dedicated application user
- Deploy to `/opt/artorize-backend`
- Setup systemd service with security hardening
- Configure Nginx reverse proxy with proper headers
- Setup firewall rules
- Start all services automatically

For more details, see `DEPLOY.md`.

**Common deployment options:**

```bash
# Production with custom port
sudo ./deploy-debian12.sh --production --port 3000

# Skip Nginx (use application port directly)
sudo ./deploy-debian12.sh --production --skip-nginx

# Update existing deployment (skip system deps)
sudo ./deploy-debian12.sh --production --skip-system-deps --skip-mongodb
```

#### Option 2: Generic Linux Deployment

For other Linux distributions or existing setups with dependencies already installed:

**Prerequisites:** Node.js 18+, MongoDB, and Git installed

```bash
# Clone and deploy
git clone https://github.com/Artorize/artorize-backend.git
cd artorize-backend
sudo npm run deploy:prod
```

This will:
- Deploy application to `/opt/artorize-storage-backend`
- Install dependencies and configure the application
- Setup systemd service for automatic startup
- Create MongoDB indexes
- Start the service immediately
- Create backups of existing deployments

**Configure MongoDB (if not using default localhost):**
```bash
sudo nano /opt/artorize-storage-backend/config/runtime.json
# Update mongo.uri and mongo.dbName as needed
```

**Restart service:**
```bash
sudo systemctl restart artorize-backend
```

### Service Management

```bash
# Check service status
sudo systemctl status artorize-backend

# View logs
sudo journalctl -u artorize-backend -f

# Restart service
sudo systemctl restart artorize-backend

# Stop service
sudo systemctl stop artorize-backend
```

### CI/CD Integration

For CI/CD pipelines, use environment variables:
```bash
# Skip dependency installation if already cached
SKIP_INSTALL=1 npm run deploy

# Skip server start for multi-step deployments
SKIP_INSTALL=1 SKIP_SERVER_START=1 npm run deploy
```

### Custom Configuration

Run with custom configuration path:
```bash
node src/server.js --config=/path/to/custom-runtime.json
```

### Sample data & local Mongo helper

Run the in-memory MongoDB shim for local smoke tests:

```bash
npm run mongo:memory
```

With the temporary database running, seed the bundled Mona Lisa dataset (original/protected variants, dual masks, and JSON metadata):

```bash
SKIP_INSTALL=1 SKIP_SERVER_START=1 npm run deploy  # optional: prepares indexes
npm run seed:inputdata
```

The seeder skips re-imports by checksum and populates the `artworks_meta` collection with references to the stored GridFS assets and embedded analysis/summary payloads.

## API Surface

### Core Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Returns service uptime and health flag. |
| `POST` | `/artworks` | Upload artwork with all variants and metadata. |
| `GET` | `/artworks` | Search/filter artworks by artist, tags, or free text. |
| `POST` | `/artworks/batch` | Retrieve multiple artworks by IDs with field selection. |

### Artwork Access Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/artworks/:id` | Stream artwork file via `?variant=` query. |
| `GET` | `/artworks/:id/metadata` | Fetch complete JSON metadata for an artwork. |
| `GET` | `/artworks/:id/variants` | List all available variants with URLs and metadata. |
| `GET` | `/artworks/:id/download` | Download artwork file with attachment headers. |
| `GET` | `/artworks/:id/download-url` | Generate temporary download URLs with expiration. |

### Uploads

- Accepts `multipart/form-data` with the following required file parts:
  - `original`: source image (JPEG/PNG/WebP/AVIF/GIF).
  - `protected`: protected derivative matching the same image type rules.
  - `maskHi` / `maskLo`: high- and low-resolution masks (PNG).
  - `analysis` / `summary`: JSON documents describing the processing pipeline.
- Optional text form fields (`title`, `artist`, `description`, `tags`, `createdAt`, `extra`) are still supported.
- The service persists originals/protected/masks in dedicated GridFS buckets and embeds the parsed JSON payloads alongside other metadata in `artworks_meta`.

### Streaming

- `variant` query defaults to `original`; accepted values: `original`, `protected`, `mask_hi`, `mask_lo`.
- Responses include `Cache-Control`/`ETag` headers for long-lived CDN caching.

### Search

- Filters available: `artist`, `tags` (comma-separated), `q` full-text search.
- Pagination via `limit` (1–100) and `skip` (>=0).
- Indexed on artist+createdAt, tags, and text to guarantee predictable latency.

## Operational Notes

- Rate limiting: global limiter (300 requests / 15 min per IP) with a tighter upload limiter (30 uploads / hour). Health checks are exempt.
- Validation: Zod schemas guard route params, bodies, and queries before controllers execute.
- Logging: pino-http injects `req.log` for request-scoped JSON logs; redacts `Authorization` headers and respects the `logLevel` value from `config/runtime.json`.
- Security headers: Helmet applies safe defaults compatible with JSON APIs.
- Index provisioning: `scripts/ensure-indexes.js` consumes the JSON config, applies `artworks_meta` indexes, and exits.
- Formats persisted per artwork now include `original`, `protected`, `mask_hi`, and `mask_lo` entries with per-variant content types and checksums.

## Roadmap Status

| Milestone | Status | Notes |
|-----------|--------|-------|
| Core Server & Mongo | Complete | Health endpoint, connection management, graceful shutdown. |
| Upload Pipeline | Complete | Multer memory storage, checksuming, Sharp-generated WebP & thumbnail variants. |
| Retrieval API | Complete | GridFS streaming with cache headers and dedicated metadata route. |
| Search & Filters | Complete | Artist/tag/text filters with supporting Mongo indexes. |
| Hardening & Ops | Complete | Validation, rate limiting, logging, helmet, deploy script, index helper. |

## Monitoring & Maintenance

### Health Checks
```bash
# Check service health
curl http://localhost:3000/health

# Monitor with systemd
sudo systemctl status artorize-backend

# View error logs
sudo journalctl -u artorize-backend -p err -n 50
```

### Database Maintenance
```bash
# Rebuild indexes manually
node scripts/ensure-indexes.js --config=config/runtime.json

# Connect to MongoDB for maintenance
mongo artgallery
```

### Backup Strategy
```bash
# Backup MongoDB database
mongodump --db artgallery --out /backup/artgallery-$(date +%Y%m%d)

# Backup configuration
cp -r /opt/artorize-storage-backend/config /backup/config-$(date +%Y%m%d)
```

## Testing

### Running Tests

```bash
# Install test dependencies
npm install

# Generate test fixtures
npm run test:fixtures

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npx mocha tests/artworks.test.js
```

### Test Structure

- **Unit Tests** (`tests/artworks.test.js`): Tests individual API endpoints and error handling
- **Integration Tests** (`tests/integration.test.js`): End-to-end workflow testing
- **Fixtures** (`tests/fixtures/`): Generated test images and JSON data

### Test Coverage

The test suite covers:
- File upload with validation
- All read endpoints (stream, metadata, variants, download)
- Batch operations
- Search functionality
- Error handling and edge cases
- Data integrity (checksums)
- Concurrent operations
- Performance benchmarks

## Development Tips

- `scripts/ensure-indexes.js` can be run locally to build indexes against a dev database
- Set `logLevel` to `debug` in `config/runtime.json` when troubleshooting
- The service trusts `X-Forwarded-For` headers when behind a proxy—configure accordingly
- Use `npm run mongo:memory` for isolated local testing without MongoDB installation
- Rate limits: 300 requests/15min general, 30 uploads/hour per IP
- Run tests before committing: `npm test`

