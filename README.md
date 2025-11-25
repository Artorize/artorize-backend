# Artorize Storage Backend

Node.js + Express service for ingesting original/protected artwork assets with associated mask layers and JSON summaries, storing media in MongoDB GridFS, and managing searchable metadata.

## Authentication (Better Auth + Mongo)

Better Auth runs in this service, backed by MongoDB via `mongodbAdapter`. Supported flows include email + username + password, Google, and GitHub OAuth.

**Session Management:**
- Session cookie: `better-auth.session_token` (HttpOnly, Secure in prod, SameSite=Lax)
- PII (`email`, `username`, `name`) and OAuth tokens are encrypted with AES-256-GCM
- Hashes (`emailHash`, `usernameHash`) enforce uniqueness
- Availability check: `GET /auth/check-availability?email=&username=` (hash-based, no auth required)
- Router proxies OAuth flows: `/auth/oauth/:provider/start` and `/auth/callback/:provider` routes are proxied through the router using `APP_BASE_URL` (defaults to `http://localhost:7000`)
- Router proxies all `/auth/*` endpoints with cookie passthrough for session management

**Router Integration:**
This backend mounts all auth routes under `/auth/*`. Your router (Fastify + Better Auth) must proxy these endpoints:
```
Router → /auth/* → Backend (this service)
```
The router validates user sessions and forwards user context via headers for non-OAuth endpoints.
- **OAuth Callback URLs** are proxied via the router at `APP_BASE_URL/auth/callback/*` (default: `http://localhost:7000`). Configure OAuth provider redirect URIs to point to the router, not this backend service.
- OAuth flows (`/auth/signin/google`, `/auth/signin/github`, and callbacks) are entirely proxied through the router; `APP_BASE_URL` defaults to `http://localhost:7000`.

**Required Environment Variables:**
| Variable | Purpose | Min Length | Example |
|----------|---------|-----------|---------|
| `BETTER_AUTH_SECRET` | Secret key for session signing | 32 chars | `your-32-char-secret-key-here` |
| `APP_ENCRYPTION_KEY` | Base64-encoded encryption key for PII | base64(32 bytes) | `dGVzdC1rZXktNDItY2hhcnMtYmFzZTY0LWVuY29kZWQtaGVyZQ==` |
| `APP_BASE_URL` | Base URL for callbacks and redirects | — | `http://localhost:7000` (dev), `https://yourdomain.com` (prod) |
| `GOOGLE_CLIENT_ID` | Google OAuth app ID | — | (from Google Cloud Console) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret | — | (from Google Cloud Console) |
| `GITHUB_CLIENT_ID` | GitHub OAuth app ID | — | (from GitHub Settings) |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth secret | — | (from GitHub Settings) |

## Feature Highlights

- [x] Core health endpoint, configuration loading, and graceful shutdown wiring.
- [x] Multer-based upload pipeline with checksuming, Sharp variants, and rollback on partial failures.
- [x] GridFS streaming for originals, variant selection, and structured metadata retrieval.
- [x] Artist/tag/text search backed by MongoDB indexes.
- [x] Production hardening: input validation (Zod), rate limiting, security headers (Helmet), structured logging (pino/pino-http), and deploy scripts.
- [x] Security-first design: binds to localhost only (127.0.0.1), designed to work behind the Artorize router.

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
| `mongo.dbName` | Database used to store metadata & GridFS buckets. | `artorize` |
| `logLevel` | pino logging level (`debug`, `info`, etc.). | `info` |

## Security Architecture

**IMPORTANT:** This application binds to `127.0.0.1` (localhost only) for security. It is designed to work behind the Artorize router (Fastify) which acts as the reverse proxy and handles authentication.

**Key Security Features:**
- Binds to localhost only - not directly accessible from the internet
- All external access goes through the router
- Rate limiting: 300 requests/15min general, 30 uploads/hour
- Helmet.js security headers
- Zod input validation

For local development, the service is accessible at `http://localhost:<port>`. For remote access during development, use SSH port forwarding.

## Deployment

### One-Line Deployment (Recommended)

Deploy to a fresh Debian 12 server with a single command:

```bash
curl -sSL https://raw.githubusercontent.com/Artorize/artorize-backend/main/deploy.sh | sudo bash -s -- --production
```

**What it does:**
- Installs Node.js 20, MongoDB 7.0, and system dependencies
- Clones repository to `/opt/artorize-backend`
- Creates dedicated application user
- Sets up systemd service with security hardening
- Sets up firewall rules
- Automatically starts all services
- Preserves existing configuration during updates

### Manual Deployment

If you prefer to clone first or customize the deployment:

```bash
git clone https://github.com/Artorize/artorize-backend.git
cd artorize-backend
sudo ./deploy.sh --production
```

**Deployment options:**

```bash
# Custom port
sudo ./deploy.sh --production --port 3000

# Update existing deployment (skip system dependencies)
sudo ./deploy.sh --production --skip-system-deps --skip-mongodb

# Custom repository or branch
REPO_URL=https://github.com/your-fork/artorize-backend.git REPO_BRANCH=develop sudo ./deploy.sh --production
```

For complete deployment documentation, see `DEPLOY.md`.

### Local Development

For local development without full system setup:

```bash
# Install dependencies
npm install

# Start in-memory MongoDB (optional)
npm run mongo:memory

# Start development server with auto-reload
npm run dev
```

Configuration will be loaded from `config/runtime.json`. Create it manually or let the deployment script generate a default one.

**Note for local development:** The service binds to `127.0.0.1` and is accessible at `http://localhost:<port>` on the machine where it runs. For remote access during development, use SSH port forwarding.

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

# Check version and last update
npm run version
# Or: node src/server.js --version
```

### Version Management & Self-Update

The application includes built-in version tracking and self-update functionality:

**Check Version:**
```bash
# Using npm script
npm run version

# Direct command
node src/server.js --version

# Sample output:
# Artorize Backend v1.0.0
#   Commit: ca63093
#   Branch: main
#   Last Update: 2025-11-09T10:30:00.000Z (2 hours ago)
```

**Auto-Update on Startup:**
By default, the application checks for updates from the git repository on each startup and automatically pulls new changes if available. This behavior can be controlled:

```bash
# Disable auto-update (one-time)
AUTO_UPDATE=false npm start

# Disable auto-update (systemd service)
# Edit /etc/systemd/system/artorize-backend.service
# Add: Environment="AUTO_UPDATE=false"
```

**Update Behavior:**
- Updates are pulled from the configured git remote (default: origin)
- Updates are skipped if there are uncommitted local changes
- After successful update, the service should be restarted to apply changes
- If `package.json` or `package-lock.json` changed, run `npm install`
- Update timestamp is stored in `.last-update` file

**Manual Update:**
```bash
# Update to latest version
cd /opt/artorize-backend
sudo git pull origin main
sudo npm install  # If dependencies changed
sudo systemctl restart artorize-backend
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
mongosh artorize
```

### Backup Strategy
```bash
# Backup MongoDB database
mongodump --db artorize --out /backup/artorize-$(date +%Y%m%d)

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

