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
npm run deploy           # Full deployment pipeline (config, deps, indexes, server)
npm run start:prod       # Start with NODE_ENV=production explicitly
```

### Testing & Linting
```bash
node tests/sac-encoder.test.js        # Test SAC encoder/decoder
node tests/sac-integration.test.js    # Generate test SAC files and sample data
```

## Architecture Overview

This is a Node.js/Express backend service for artwork storage using MongoDB GridFS. The application follows a layered MVC architecture:

- **Entry Point**: `src/server.js` initializes the server and handles graceful shutdown
- **App Configuration**: `src/app.js` sets up Express middleware pipeline
- **Routes**: `src/routes/artworks.routes.js` defines API endpoints
- **Controllers**: `src/controllers/artworks.controller.js` handles requests and orchestrates operations
- **Services**: `src/services/artwork.service.js` contains core business logic
- **Storage Layer**: `src/storage/gridfs.js` manages GridFS buckets for file storage
- **Validation**: `src/validators/artwork.validators.js` uses Zod schemas for input validation

## Key Technical Details

### Configuration
The application uses a JSON-based configuration system (`config/runtime.json`):
- Config path can be set via `--config` flag or `APP_CONFIG_PATH` env var
- Config determines environment, port, MongoDB URI, database name, and log level

### Storage Architecture
GridFS is used with three separate buckets:
- `artwork_originals`: Original uploaded images
- `artwork_protected`: Protected derivative images
- `artwork_masks`: High/low resolution mask files (SAC v1 binary format)

Files are stored in 1MB chunks with SHA256 checksums for integrity verification.

**SAC v1 Format**: Masks use the Simple Array Container protocol - a compact binary format for shipping two signed 16-bit arrays optimized for CDN delivery. See `sac_v_1_cdn_mask_transfer_protocol.md` for complete specification.

### Database Indexes
The following indexes are auto-created on startup:
- `{ artist: 1, createdAt: -1 }` on artworks_meta
- `{ tags: 1 }` on artworks_meta
- `{ title: 'text', description: 'text' }` for full-text search

### Security Features
- Rate limiting: 300 requests/15min general, 30 uploads/hour
- Helmet.js for security headers
- Multer file size limit: 256MB per file
- Zod validation on all inputs
- Pino structured logging with auth header redaction

### API Endpoints
- `POST /artworks` - Upload artwork with multiple file variants
- `GET /artworks/:id` - Stream artwork file (use `?variant=` query param)
- `GET /artworks/:id/mask` - Stream mask file in SAC v1 format (use `?resolution=hi|lo`)
- `GET /artworks/:id/metadata` - Get artwork metadata
- `GET /artworks` - Search artworks (supports artist, tags, text queries)
- `GET /artworks/check-exists` - Check if artwork already exists (supports id, checksum, title+artist, tags)
- `GET /health` - Health check endpoint

**📖 Complete API Documentation**: See `API.md` for detailed endpoint specifications, examples, and usage patterns.

### File Upload Structure
When uploading artwork, the multipart form expects:
- `original`: Original image file (JPEG/PNG/WebP/AVIF/GIF)
- `protected`: Protected variant file (same formats)
- `maskHi`: High-resolution mask (SAC v1 binary, .sac extension)
- `maskLo`: Low-resolution mask (SAC v1 binary, .sac extension)
- `analysis`: Analysis JSON document
- `summary`: Summary JSON document
- Additional metadata fields: `title`, `artist`, `description`, `tags`, etc.

## Development Workflow

1. Ensure MongoDB is running (use `npm run mongo:memory` for local development)
2. Update `config/runtime.json` with appropriate settings
3. Run `npm run dev` for development with auto-reload
4. Use `npm run seed:inputdata` to populate test data if needed

For production deployment, use `npm run deploy` which handles configuration setup, dependency installation, index creation, and server startup.
