const logger = require('../config/logger');

/**
 * Internal service authentication middleware
 * Validates requests from trusted internal services (e.g., router)
 * using a shared secret key
 */

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

/**
 * Require internal service authentication
 * Validates X-Internal-Key header against INTERNAL_API_KEY env var
 * @returns {Function} Express middleware
 */
function requireInternalAuth() {
  return (req, res, next) => {
    // Skip in test environment if no key configured
    if (process.env.NODE_ENV === 'test' && !INTERNAL_API_KEY) {
      return next();
    }

    if (!INTERNAL_API_KEY) {
      logger.error('INTERNAL_API_KEY not configured - internal endpoints are unprotected');
      return res.status(500).json({
        error: 'Configuration error',
        message: 'Internal authentication not configured',
      });
    }

    const providedKey = req.headers['x-internal-key'];

    if (!providedKey) {
      logger.warn({ path: req.path, ip: req.ip }, 'Missing internal API key');
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Internal service authentication required',
      });
    }

    // Constant-time comparison to prevent timing attacks
    if (!timingSafeEqual(providedKey, INTERNAL_API_KEY)) {
      logger.warn({ path: req.path, ip: req.ip }, 'Invalid internal API key');
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Invalid internal service credentials',
      });
    }

    // Mark request as internally authenticated
    req.internalAuth = true;
    next();
  };
}

/**
 * Constant-time string comparison to prevent timing attacks
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} True if strings are equal
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  const crypto = require('crypto');

  // Pad to same length to prevent length-based timing leaks
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  if (bufA.length !== bufB.length) {
    // Compare with self to maintain constant time even on length mismatch
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  requireInternalAuth,
};
