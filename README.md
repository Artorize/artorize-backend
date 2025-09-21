# Artscraper Backend Implementation Guide

This backend stores original artwork uploads, derived image variants, and JSON metadata using Node.js, Express, and MongoDB GridFS. No reverse proxy (NGINX) is required for functionality; you can add one later for TLS, caching, or rate limiting.

## Folder Structure

```
src/
  config/         # Environment, MongoDB, and app configuration helpers
  routes/         # Express routers (e.g., artworks.routes.js)
  controllers/    # Request handlers orchestrating service & storage layers
  services/       # Business logic (upload pipeline, metadata operations)
  storage/        # GridFS buckets, file streaming utilities
  middlewares/    # Shared Express middleware (errors, validation, auth hooks)
  utils/          # Small helpers (checksums, validation)
  app.js          # Express app wiring routes & middleware
  server.js       # Entry point bootstrapping app and Mongo connection
.env.example      # Sample environment variables (copy to .env for local use)
README.md         # You are here
```

Place new code in the matching folder so concerns remain separated (routes stay thin, heavy logic sits in services/storage, etc.).

## Implementation Roadmap

| Milestone | Scope | Owner | Target |
|-----------|-------|-------|--------|
| 1. Core Server & Mongo Wiring | Create Express app, connect to MongoDB, register health route | Backend | Day 1 |
| 2. Upload Pipeline | Add `/artworks` POST with Multer memory storage, checksum, variant generation | Backend | Day 2 |
| 3. Retrieval API | Stream originals & variants from GridFS, serve metadata | Backend | Day 3 |
| 4. Search & Filters | Implement artist/tag/text querying with indexes | Backend | Day 4 |
| 5. Hardening & Ops | Add validation, rate limits, logging, and deployment scripts | Backend | Day 5 |

Adjust cadence as your team bandwidth requires. Tackle one milestone at a time and verify with targeted tests before moving on.

## Working Notes

- Start by copying `.env.example` to `.env` and updating Mongo credentials.
- Keep upload-time transformations synchronous until throughput demands an async worker.
- Upload transforms run in parallel with Sharp auto-tuning concurrency based on available CPU cores.
- Log every file write with checksum, bytes, and elapsed time for observability.
- Add integration tests (Supertest/Jest) once endpoints stabilize.
