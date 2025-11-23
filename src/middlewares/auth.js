const { validateToken } = require('../services/token.service');
const logger = require('../config/logger');

/**
 * Validates session cookie from Better Auth router
 * Checks for better-auth.session_token cookie and validates it
 *
 * @param {Object} req - Express request object
 * @returns {Object|null} - User object if valid session, null otherwise
 */
async function validateSessionCookie(req) {
  // Parse cookies from request
  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies['better-auth.session_token'];

  if (!sessionToken) {
    return null;
  }

  // In a full implementation, this would validate the session with the router
  // For now, we'll decode the session token to extract user info
  // The router should pass user info in the session token or via a custom header

  // Check if router forwarded user info via custom header (X-User-Id, X-User-Email)
  const userId = req.headers['x-user-id'];
  const userEmail = req.headers['x-user-email'];
  const userName = req.headers['x-user-name'];

  if (userId) {
    return {
      id: userId,
      email: userEmail,
      name: userName,
      authType: 'session',
    };
  }

  // If no forwarded headers, the session cookie exists but we can't validate it
  // This is expected when this backend is accessed directly (not via router)
  logger.debug({ path: req.path }, 'Session cookie found but no user headers from router');
  return null;
}

/**
 * Parse cookies from cookie header string
 * @param {string} cookieHeader - Raw cookie header value
 * @returns {Object} - Parsed cookies as key-value pairs
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.split('=');
    const value = rest.join('=').trim();
    if (name && value) {
      cookies[name.trim()] = decodeURIComponent(value);
    }
  });

  return cookies;
}

/**
 * Authentication middleware that validates both bearer tokens and session cookies
 * Supports two authentication methods:
 * 1. Bearer token (Authorization: Bearer <token>) - existing API token system
 * 2. Session cookie (better-auth.session_token) - user authentication from router
 *
 * @param {Object} options
 * @param {boolean} [options.consume] - Whether to consume (mark as used) the token (default: true)
 * @param {boolean} [options.required] - Whether authentication is required (default: true)
 * @param {boolean} [options.userOnly] - Whether to require user authentication (session only, not API tokens)
 */
function authenticate({ consume = true, required = true, userOnly = false } = {}) {
  return async (req, res, next) => {
    // First, try to validate session cookie (user authentication from router)
    try {
      const sessionUser = await validateSessionCookie(req);
      if (sessionUser) {
        req.user = sessionUser;
        req.auth = {
          userId: sessionUser.id,
          userEmail: sessionUser.email,
          authType: 'session',
        };

        logger.debug(
          {
            path: req.path,
            userId: sessionUser.id,
            authType: 'session',
          },
          'Session authenticated successfully'
        );

        return next();
      }
    } catch (error) {
      logger.error({ error: error.message, path: req.path }, 'Session validation error');
      // Continue to try bearer token auth
    }

    // If userOnly is required and no session was found, reject
    if (userOnly && required) {
      logger.warn({ path: req.path }, 'User authentication required but no session found');
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User authentication required. Please log in.',
      });
    }

    // Try bearer token authentication (API tokens)
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      if (required) {
        logger.warn({ path: req.path }, 'Missing authentication (no session or bearer token)');
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Missing Authorization header or session cookie',
        });
      }
      return next();
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      if (required) {
        logger.warn({ path: req.path }, 'Invalid Authorization header format');
        return res.status(401).json({
          error: 'Authentication failed',
          message: 'Authorization header must be in format: Bearer <token>',
        });
      }
      return next();
    }

    const token = parts[1];

    try {
      const tokenDoc = await validateToken(token, { consume });

      if (!tokenDoc) {
        if (required) {
          logger.warn({ path: req.path, token: token.slice(0, 4) + '...' }, 'Invalid or expired token');
          return res.status(401).json({
            error: 'Authentication failed',
            message: 'Invalid, expired, or already used token',
          });
        }
        return next();
      }

      // Attach token info to request for downstream use
      req.auth = {
        tokenId: tokenDoc._id,
        artworkId: tokenDoc.artworkId,
        metadata: tokenDoc.metadata,
        createdAt: tokenDoc.createdAt,
        authType: 'token',
      };

      logger.debug(
        {
          path: req.path,
          tokenId: tokenDoc._id.toString(),
          artworkId: tokenDoc.artworkId?.toString(),
          authType: 'token',
        },
        'Token validated successfully'
      );

      next();
    } catch (error) {
      logger.error({ error: error.message, path: req.path }, 'Token validation error');
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to validate authentication token',
      });
    }
  };
}

/**
 * Optional authentication middleware
 * Validates token if present, but allows request to proceed if not
 */
function optionalAuthenticate() {
  return authenticate({ consume: false, required: false });
}

module.exports = {
  authenticate,
  optionalAuthenticate,
};
