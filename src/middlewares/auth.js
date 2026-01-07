const { validateToken } = require('../services/token.service');
const { getAuth } = require('../auth/betterAuth');
const logger = require('../config/logger');

async function validateSession(req) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: req.headers,
    });
    if (session?.user && session?.session) {
      return {
        user: session.user,
        session: session.session,
      };
    }
    return null;
  } catch (error) {
    logger.debug({ error: error.message }, 'Better Auth session validation failed');
    return null;
  }
}

function authenticate({ consume = true, required = true, userOnly = false } = {}) {
  return async (req, res, next) => {
    const sessionData = await validateSession(req);
    if (sessionData) {
      req.user = sessionData.user;
      req.auth = {
        userId: sessionData.user.id,
        userEmail: sessionData.user.email,
        authType: 'session',
      };
      return next();
    }

    if (userOnly && required) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User authentication required. Please log in.',
      });
    }

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
      const tokenDoc = await validateToken(token, { consume: false });

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

      if (consume) {
        const consumed = await validateToken(token, { consume: true });
        if (!consumed) {
          logger.warn({ path: req.path, token: token.slice(0, 4) + '...' }, 'Token already consumed');
          return res.status(401).json({
            error: 'Authentication failed',
            message: 'Invalid, expired, or already used token',
          });
        }
        req.auth = {
          tokenId: consumed._id,
          artworkId: consumed.artworkId,
          metadata: consumed.metadata,
          createdAt: consumed.createdAt,
          authType: 'token',
          userId: consumed.metadata?.userId || null,
          userEmail: consumed.metadata?.userEmail || null,
        };
      } else {
        req.auth = {
          tokenId: tokenDoc._id,
          artworkId: tokenDoc.artworkId,
          metadata: tokenDoc.metadata,
          createdAt: tokenDoc.createdAt,
          authType: 'token',
          userId: tokenDoc.metadata?.userId || null,
          userEmail: tokenDoc.metadata?.userEmail || null,
        };
      }

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

function optionalAuthenticate() {
  return authenticate({ consume: false, required: false });
}

module.exports = {
  authenticate,
  optionalAuthenticate,
};
