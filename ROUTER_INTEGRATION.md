# Router-Backend Integration Guide

This document describes the integration between the Artorize router (Fastify + Better Auth) and this storage backend (Express + MongoDB).

## Architecture Overview

```
┌─────────┐         ┌──────────┐         ┌─────────────┐         ┌─────────────┐
│  User   │────────▶│  Router  │────────▶│   Backend   │────────▶│  MongoDB    │
│         │         │ (Fastify)│         │  (Express)  │         │  GridFS     │
└─────────┘         └──────────┘         └─────────────┘         └─────────────┘
                          │
                          │
                          ▼
                   ┌──────────────┐
                   │  Better Auth │
                   │  (PostgreSQL)│
                   └──────────────┘
```

## Authentication Flow

### 1. User Authentication (Session-Based)

**Flow:**
1. User authenticates via router using Better Auth (Google/GitHub OAuth)
2. Better Auth creates session and stores in PostgreSQL
3. Better Auth sets `better-auth.session_token` cookie
4. Router validates session on subsequent requests
5. **Router forwards user information to backend via custom headers:**
   - `X-User-Id`: User's unique identifier
   - `X-User-Email`: User's email address
   - `X-User-Name`: User's display name
6. Backend validates headers and associates operations with user

**Backend Implementation:**
- Middleware: `src/middlewares/auth.js:validateSessionCookie()`
- Checks for `better-auth.session_token` cookie
- Extracts user info from `X-User-*` headers forwarded by router
- Creates `req.user` object for downstream controllers

**Router Requirements:**
- ✅ MUST forward `X-User-Id` header when user is authenticated
- ✅ MUST forward `X-User-Email` header when user is authenticated
- ✅ MUST forward `X-User-Name` header when user is authenticated
- ✅ Headers should only be sent when session is valid
- ✅ Use `optionalAuth` middleware for endpoints that support optional user context

### 2. Token-Based Authentication (Processor Integration)

**Flow:**
1. Router receives artwork submission request
2. **Router calls backend's `POST /tokens` endpoint to generate authentication token**
3. Router receives token response: `{ token: "abc123...", tokenId: "...", expiresAt: "..." }`
4. Router passes token to processor along with artwork
5. Processor generates variants (original, protected, mask, analysis, summary)
6. **Processor uploads directly to backend `POST /artworks` with `Authorization: Bearer <token>` header**
7. Backend validates and consumes token (single-use)
8. Backend returns `id` in response
9. Processor sends `id` to router in callback
10. Router uses `id` to retrieve files when needed

**Security Features:**
- ✅ One-time use tokens (consumed on first successful upload)
- ✅ Time-limited (default: 1 hour, configurable, max: 24 hours)
- ✅ Per-artwork isolation (compromised token affects only one artwork)
- ✅ Cryptographically random (16-character hex string)

**Backend Implementation:**
- Token generation: `POST /tokens` (src/routes/tokens.routes.js)
- Token validation: `src/middlewares/auth.js:authenticate()`
- Token service: `src/services/token.service.js`
- MongoDB collection: `auth_tokens`

**Router Requirements:**
- ✅ MUST call `POST /tokens` before sending artwork to processor
- ✅ MUST pass token to processor
- ✅ SHOULD set reasonable `expiresIn` based on expected processing time

## Integration Requirements

### Critical Requirements

1. **User Header Forwarding (CRITICAL)**
   - Router MUST forward `X-User-Id`, `X-User-Email`, `X-User-Name` headers when user is authenticated
   - Without these headers, session authentication will NOT work
   - Backend relies on router to validate session and forward user info
   - Backend does NOT validate `better-auth.session_token` cookie directly

2. **Token Generation for Processor Uploads**
   - Router MUST call `POST /tokens` to generate authentication tokens
   - Tokens MUST be passed to processor
   - Processor MUST include token in `Authorization: Bearer <token>` header

3. **Reverse Proxy Configuration**
   - Backend binds to `127.0.0.1` (localhost only) for security
   - Router MUST act as reverse proxy for external access
   - All external requests MUST go through the router

### Endpoint Mapping

#### Router → Backend API Calls

| Router Endpoint | Backend Endpoint | Purpose | Auth Required |
|----------------|------------------|---------|---------------|
| `POST /protect` | `GET /artworks/check-exists` | Check for duplicates | Optional (session) |
| `POST /protect` | `POST /tokens` | Generate upload token | No |
| `GET /jobs/:id` | `GET /artworks/:id/metadata` | Get job status | Optional (session) |
| `GET /jobs/:id/result` | `GET /artworks/:id/metadata` | Get artwork metadata | Optional (session) |
| `GET /jobs/:id/download/:variant` | `GET /artworks/:id?variant=...` | Stream artwork file | Optional (session) |

#### Processor → Backend API Calls

| Processor Action | Backend Endpoint | Auth Required |
|-----------------|------------------|---------------|
| Upload artwork | `POST /artworks` | Yes (Bearer token) |

### Authentication Middleware Usage

**Router's `optionalAuth` middleware should:**
1. Check if user is authenticated (session cookie present and valid)
2. If authenticated, forward user headers: `X-User-Id`, `X-User-Email`, `X-User-Name`
3. If not authenticated, continue without headers (backend will handle as unauthenticated request)

**Example Router Code:**
```typescript
// In router's middleware
fastify.addHook('preHandler', async (request, reply) => {
  // If user is authenticated
  if (request.user) {
    // Forward user headers to backend
    request.headers['X-User-Id'] = request.user.id;
    request.headers['X-User-Email'] = request.user.email;
    request.headers['X-User-Name'] = request.user.name;
  }
});
```

## Potential Issues and Solutions

### Issue 1: Missing User Headers

**Symptom:** Session cookie exists but backend doesn't recognize user

**Cause:** Router not forwarding `X-User-*` headers

**Solution:**
- Ensure router's authentication middleware forwards headers
- Check that headers are set before proxying requests to backend
- Verify headers aren't being stripped by reverse proxy

**Debug:**
```bash
# Check if headers are being forwarded
curl -H "Cookie: better-auth.session_token=..." \
     -H "X-User-Id: user123" \
     http://localhost:5001/artworks/me
```

### Issue 2: Token Not Found for Processor Upload

**Symptom:** Processor upload fails with 401 Unauthorized

**Cause:** Token not generated or expired

**Solution:**
- Verify router calls `POST /tokens` before sending to processor
- Check token hasn't expired (default: 1 hour)
- Ensure token is passed correctly to processor
- Verify processor includes token in `Authorization: Bearer <token>` header

**Debug:**
```bash
# Generate token
curl -X POST http://localhost:5001/tokens \
  -H "Content-Type: application/json" \
  -d '{"metadata": {"source": "router"}}'

# Use token
curl -X POST http://localhost:5001/artworks \
  -H "Authorization: Bearer <token>" \
  -F "original=@image.jpg" \
  ...
```

### Issue 3: CORS Errors

**Symptom:** Browser blocks requests from router to backend

**Cause:** CORS not configured for router origin

**Solution:**
- Configure CORS in backend to allow router's origin
- Ensure credentials are allowed for cookie forwarding
- Check preflight requests are handled correctly

### Issue 4: User ID Mismatch

**Symptom:** Artworks show wrong owner or no owner

**Cause:** User ID format mismatch between Better Auth and backend

**Solution:**
- Ensure `X-User-Id` header contains the exact user ID from Better Auth
- Verify backend stores user ID as-is (no transformation)
- Check database for correct `userId` field values

## Testing Integration

### Test 1: User Session Authentication

```bash
# 1. User authenticates via router (get session cookie)
# 2. Router forwards user headers
curl -H "Cookie: better-auth.session_token=xyz" \
     -H "X-User-Id: user_123" \
     -H "X-User-Email: user@example.com" \
     -H "X-User-Name: John Doe" \
     http://localhost:5001/artworks/me

# Expected: Returns user's artworks
```

### Test 2: Token Generation and Upload

```bash
# 1. Generate token
TOKEN=$(curl -X POST http://localhost:5001/tokens | jq -r '.token')

# 2. Upload with token
curl -X POST http://localhost:5001/artworks \
  -H "Authorization: Bearer $TOKEN" \
  -F "original=@test.jpg" \
  -F "protected=@test-protected.jpg" \
  -F "mask=@test-mask.sac" \
  -F "analysis=@test-analysis.json" \
  -F "summary=@test-summary.json" \
  -F "title=Test Artwork"

# Expected: Returns { "id": "...", "formats": {...} }
```

### Test 3: Optional Authentication

```bash
# Without authentication (should work for public endpoints)
curl http://localhost:5001/artworks?artist=Picasso

# With authentication (should include user context)
curl -H "X-User-Id: user_123" \
     http://localhost:5001/artworks?artist=Picasso
```

## Configuration

### Backend Environment Variables

```bash
# MongoDB connection
MONGODB_URI=mongodb://localhost:27017

# Server binding (MUST be localhost for security)
HOST=127.0.0.1
PORT=5001

# Token expiry (optional, default: 1 hour)
TOKEN_EXPIRY_MS=3600000

# Logging
LOG_LEVEL=info
```

### Router Configuration

The router should be configured to:
1. Proxy requests to backend at `http://127.0.0.1:5001`
2. Forward user headers when authenticated
3. Handle session cookies from Better Auth
4. Call backend's token generation endpoint

## Security Considerations

1. **Localhost Binding**: Backend binds to `127.0.0.1` only
   - NEVER change to `0.0.0.0` in production
   - All external access MUST go through reverse proxy

2. **Header Trust**: Backend trusts `X-User-*` headers
   - Only router should be able to reach backend
   - Configure firewall to block direct external access
   - Router should strip untrusted headers before forwarding

3. **Token Security**:
   - Tokens are single-use and time-limited
   - Tokens are cryptographically random
   - Expired/used tokens are automatically cleaned up

4. **Session Security**:
   - Backend does NOT validate session tokens directly
   - Router MUST validate sessions before forwarding headers
   - Session validation is router's responsibility

## Monitoring and Debugging

### Health Check

```bash
curl http://localhost:5001/health
```

**Returns:**
- MongoDB connection status
- GridFS bucket status
- Token statistics
- System metrics

### Token Statistics

```bash
curl http://localhost:5001/tokens/stats
```

**Returns:**
```json
{
  "stats": {
    "total": 150,
    "active": 5,
    "used": 120,
    "expired": 25
  }
}
```

### Logs

Backend uses structured logging (Pino):
- Session authentication: `Session authenticated successfully`
- Token validation: `Token validated successfully`
- Missing headers: `Session cookie found but no user headers from router`

**View logs:**
```bash
# Production
journalctl -u artorize-backend -f

# Development
npm run dev
```

## Migration and Updates

### Adding New Endpoints

1. Add route in `src/routes/*.routes.js`
2. Add controller in `src/controllers/*.controller.js`
3. Add validator in `src/validators/*.validators.js`
4. Update API.md documentation
5. Update this integration guide if router needs to call it

### Changing Authentication

If modifying authentication:
1. Update `src/middlewares/auth.js`
2. Test both session and token authentication
3. Update integration tests
4. Update this document

### Database Migrations

For schema changes:
1. Update service layer (`src/services/*.service.js`)
2. Add migration script if needed
3. Update indexes in `src/config/mongo.js`
4. Test with existing data

## Support and Troubleshooting

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `Missing Authorization header or session cookie` | No auth provided | Add token or session headers |
| `Invalid, expired, or already used token` | Token problem | Generate new token |
| `User ID not found in authentication context` | Missing X-User-Id | Ensure router forwards header |
| `Session cookie found but no user headers from router` | Headers not forwarded | Configure router to forward headers |

### Debug Mode

Enable debug logging:
```bash
LOG_LEVEL=debug npm run dev
```

### Contact

For integration issues:
- Check logs on both router and backend
- Verify headers are being forwarded
- Test endpoints individually
- Review this document for requirements
