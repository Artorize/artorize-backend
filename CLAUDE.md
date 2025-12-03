# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Development
```bash
npm run dev              # Start development server with auto-reload (nodemon)
npm run mongo:memory     # Run in-memory MongoDB for local testing
npm run seed:inputdata   # Seed database with sample data from config/runtime.json
```

### Production
```bash
npm start                # Start production server
npm run deploy           # Production deployment (Debian 12, requires sudo)
npm run start:prod       # Start with NODE_ENV=production explicitly
```

### Testing & Linting
```bash
node tests/sac-encoder.test.js        # Test SAC encoder/decoder
node tests/sac-integration.test.js    # Generate test SAC files and sample data
```

### Version & Updates
```bash
npm run version          # Show version, commit, branch, and last update time
node src/server.js -v    # Alternative: show version information
node src/server.js --help # Show all available CLI options
```

**Self-Update on Startup:**
The application automatically checks for updates from the git repository on each startup. This can be controlled via:
- `AUTO_UPDATE=false npm start` - Disable automatic updates
- Default behavior: Updates are pulled automatically if available
- Updates are skipped if there are uncommitted local changes
- After update, the service should be restarted to apply changes

**Version Tracking:**
- Version number from `package.json`
- Git commit hash and branch
- Last update timestamp (stored in `.last-update` file)
- Use `npm run version` to see current version details

## Architecture Overview

This is a Node.js/Express backend service for artwork storage using MongoDB GridFS. The application follows a layered MVC architecture:

- **Entry Point**: `src/server.js` initializes the server and handles graceful shutdown
- **App Configuration**: `src/app.js` sets up Express middleware pipeline
- **Routes**: `src/routes/artworks.routes.js` defines API endpoints
- **Controllers**: `src/controllers/artworks.controller.js` handles requests and orchestrates operations
- **Services**: `src/services/artwork.service.js` contains core business logic
- **Storage Layer**: `src/storage/gridfs.js` manages GridFS buckets for file storage
- **Validation**: `src/validators/artwork.validators.js` uses Zod schemas for input validation
- **Authentication**: `src/middlewares/auth.js` handles dual authentication (tokens + sessions)
- **Token Management**: `src/services/token.service.js` manages authentication tokens

### Integration Architecture

This backend is designed to work with the Artorize router (Fastify + Better Auth):

```
┌─────────┐         ┌──────────┐         ┌─────────────┐         ┌─────────────┐
│  User   │────────▶│  Router  │────────▶│   Backend   │────────▶│  MongoDB    │
│         │         │ (Fastify)│         │  (Express)  │         │  GridFS     │
└─────────┘         └──────────┘         └─────────────┘         └─────────────┘
                          │
                          │ Better Auth
                          ▼
                   ┌──────────────┐
                   │  PostgreSQL  │
                   └──────────────┘
```

**Key Integration Points:**
- Router validates user sessions via Better Auth (PostgreSQL)
- Router forwards user context to backend via custom headers (`X-User-Id`, `X-User-Email`, `X-User-Name`)
- Backend trusts headers from router (router is the only client - localhost binding enforced)
- Router generates authentication tokens for processor uploads via `POST /tokens`
- Backend validates tokens for processor uploads via bearer token authentication

**For detailed integration requirements**, see `ROUTER_INTEGRATION.md`.

### Authentication Architecture

The backend supports **dual authentication**:

1. **Session-Based Authentication (User Operations)**:
   - Router validates user sessions via Better Auth
   - Router forwards user info via `X-User-Id`, `X-User-Email`, `X-User-Name` headers
   - Backend extracts user context from headers
   - Used for user-specific operations like `GET /artworks/me`
   - Artworks uploaded with session auth are associated with user (`userId` field)

2. **Token-Based Authentication (Processor Uploads)**:
   - Router generates one-time tokens via `POST /tokens`
   - Tokens are cryptographically random, single-use, time-limited (1 hour default)
   - Processor includes token in `Authorization: Bearer <token>` header
   - Backend validates and consumes token on upload
   - Artworks uploaded with tokens have `userId: null`

**IMPORTANT**: The backend does NOT validate `better-auth.session_token` cookies directly. It relies on the router to validate sessions and forward user information via headers. This architecture assumes the router is the only client (enforced by localhost binding).

**Better Auth Session Endpoint**: Better Auth provides a default `/auth/session` endpoint that validates session cookies and returns user and session information. The router should use this endpoint (not custom implementations) to validate user sessions before forwarding requests to protected backend endpoints.

### Security Architecture

**CRITICAL:** The application binds to `127.0.0.1` (localhost only) in `src/server.js:36-37`. This is a security-first design:

- Application listens on `127.0.0.1:<port>` (not accessible from outside the server)
- Designed to work behind the Artorize router (Fastify)
- **Never** modify the host binding to `0.0.0.0` in production
- All external access goes through the router

For local development, the service is accessible at `http://localhost:<port>`. For remote access during development, use SSH port forwarding rather than changing the binding.

## Key Technical Details

### Configuration
The application uses a JSON-based configuration system (`config/runtime.json`):
- Config path can be set via `--config` flag or `APP_CONFIG_PATH` env var
- Config determines environment, port, MongoDB URI, database name, and log level

### Storage Architecture
GridFS is used with three separate buckets:
- `artwork_originals`: Original uploaded images
- `artwork_protected`: Protected derivative images
- `artwork_masks`: Grayscale mask files (SAC v1 binary format)

Files are stored in 1MB chunks with SHA256 checksums for integrity verification.

**SAC v1 Format**: Masks use the Simple Array Container protocol - a compact binary format for shipping two signed 16-bit arrays optimized for CDN delivery. See `sac_v_1_cdn_mask_transfer_protocol.md` for complete specification.

### Database Indexes
The following indexes are auto-created on startup:
- `{ artist: 1, createdAt: -1 }` on artworks_meta
- `{ tags: 1 }` on artworks_meta
- `{ title: 'text', description: 'text' }` for full-text search

### Security Features
- **Network binding**: Localhost only (`127.0.0.1`) - works behind the Artorize router
- Rate limiting: 300 requests/15min general, 30 uploads/hour
- Helmet.js for security headers
- Multer file size limit: 256MB per file
- Zod validation on all inputs
- Pino structured logging with auth header redaction

### API Endpoints

**Better Auth Endpoints (provided by Better Auth library):**
- `GET /auth/session` - Get current session and user information (validates session cookie)
- All other Better Auth endpoints are available at `/auth/*` (sign-in, sign-up, OAuth, etc.)

**Backend Authentication Endpoints:**
- `POST /tokens` - Generate authentication token (for processor uploads)
- `DELETE /tokens/:token` - Revoke authentication token
- `GET /tokens/stats` - Get token statistics (monitoring)

**Artwork Endpoints:**
- `POST /artworks` - Upload artwork with multiple file variants (requires auth: token or session)
- `GET /artworks/:id` - Stream artwork file (use `?variant=` query param)
- `GET /artworks/:id/mask` - Stream grayscale mask file in SAC v1 format
- `GET /artworks/:id/metadata` - Get artwork metadata
- `GET /artworks/:id/variants` - Get available variant information
- `GET /artworks/:id/download` - Download artwork with attachment headers
- `GET /artworks/:id/download-url` - Generate temporary download URLs
- `GET /artworks` - Search artworks (supports artist, tags, text queries, userId)
- `GET /artworks/me` - Get artworks uploaded by authenticated user (requires session auth)
- `GET /artworks/check-exists` - Check if artwork already exists (supports id, checksum, title+artist, tags)
- `POST /artworks/batch` - Retrieve multiple artworks by IDs

**System Endpoints:**
- `GET /health` - Comprehensive health check with component diagnostics (MongoDB, GridFS, hash storage, system metrics)

**Complete API Documentation**: See `API.md` for detailed endpoint specifications, examples, and usage patterns.

### File Upload Structure
When uploading artwork, the multipart form expects:
- `original`: Original image file (JPEG/PNG/WebP/AVIF/GIF)
- `protected`: Protected variant file (same formats)
- `mask`: Grayscale mask file (SAC v1 binary, .sac extension)
- `analysis`: Analysis JSON document
- `summary`: Summary JSON document
- Additional metadata fields: `title`, `artist`, `description`, `tags`, etc.

## Development Workflow

1. Ensure MongoDB is running (use `npm run mongo:memory` for local development)
2. Update `config/runtime.json` with appropriate settings
3. Run `npm run dev` for development with auto-reload
4. Use `npm run seed:inputdata` to populate test data if needed

## Deployment

The application uses a single deployment script (`deploy.sh`) that handles complete server setup:

- **One-line deployment**: `curl -sSL https://raw.githubusercontent.com/Artorize/artorize-backend/main/deploy.sh | sudo bash -s -- --production`
- **Manual deployment**: `sudo ./deploy.sh --production` (clones from GitHub to `/opt/artorize-backend`)
- **Via npm**: `sudo npm run deploy` (runs deploy.sh)

The deployment script:
- Installs Node.js 20, MongoDB 7.0, and system dependencies (Debian 12)
- Clones repository from GitHub to `/opt/artorize-backend`
- Creates dedicated application user
- Sets up systemd service with security hardening
- Configures firewall (UFW)
- Preserves existing configuration during updates

**Environment variables**:
- `REPO_URL`: Override repository URL (default: https://github.com/Artorize/artorize-backend.git)
- `REPO_BRANCH`: Override branch (default: main)
- `APP_DIR`: Override installation directory (default: /opt/artorize-backend)
- `APP_PORT`: Override application port (default: 5001)

**Common options**:
- `--production`: Enable production mode
- `--skip-system-deps`: Skip system package installation
- `--skip-mongodb`: Skip MongoDB installation
- `--port PORT`: Set custom application port
- `--app-dir DIR`: Set custom installation directory
