const { validateToken } = require('../services/token.service');
const logger = require('../config/logger');

/**
 * Authentication middleware that validates bearer tokens
 * Expects Authorization header in format: "Bearer <token>"
 *
 * @param {Object} options
 * @param {boolean} [options.consume] - Whether to consume (mark as used) the token (default: true)
 * @param {boolean} [options.required] - Whether authentication is required (default: true)
 */
function authenticate({ consume = true, required = true } = {}) {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      if (required) {
        logger.warn({ path: req.path }, 'Missing Authorization header');
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Missing Authorization header',
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
      };

      logger.debug(
        {
          path: req.path,
          tokenId: tokenDoc._id.toString(),
          artworkId: tokenDoc.artworkId?.toString(),
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
