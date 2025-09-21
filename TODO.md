# TODO

## Near-Term Enhancements
- Add request authentication/authorization (API keys or JWT) and enforce per-tenant quotas.
- Implement integration tests (Jest + Supertest) covering uploads, variant streaming, and search edge cases.
- Introduce structured validation errors in OpenAPI/Swagger format for client tooling.
- Capture metrics (Prometheus or OpenTelemetry) for upload latency, variant generation timing, and storage usage.

## Performance & Scaling
- Offload heavy transforms to a background worker queue (BullMQ/SQS) once upload volume grows.
- Add CDN integration with signed URLs and cache busting strategy.
- Implement deduplication across users by reusing existing GridFS files when checksums collide.
- Add warm caches for frequent metadata queries (e.g., Redis) and rate-limit bursts per artwork id.

## Operational Hardening
- Provision infrastructure-as-code templates (Terraform/Pulumi) covering Mongo, bucket indexes, and CI secrets.
- Create production-ready Dockerfile + compose/k8s manifests with health probes and log shipping.
- Wire structured audit logs for admin actions and access tracing.
- Add backup & archival policies for GridFS buckets and metadata snapshots.

## Developer Experience
- Publish an OpenAPI spec and generated SDK stubs for consumers.
- Add linting (ESLint), Prettier, and Husky pre-commit hooks.
- Provide seed scripts to bulk import sample artworks for local testing.
