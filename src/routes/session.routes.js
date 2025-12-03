const express = require('express');
const { getAuth } = require('../auth/betterAuth');
const logger = require('../config/logger');

const router = express.Router();

/**
 * GET /auth/get-session
 * Validates session cookie and returns user + session information
 * This endpoint is called by the router to validate user sessions
 */
router.get('/get-session', async (req, res) => {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user || !session?.session) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'No active session found',
      });
    }

    // Return user and session data
    return res.status(200).json({
      user: {
        id: session.user.id,
        email: session.user.email,
        username: session.user.username,
        name: session.user.name,
        emailVerified: session.user.emailVerified,
        image: session.user.image,
        createdAt: session.user.createdAt,
        updatedAt: session.user.updatedAt,
      },
      session: {
        id: session.session.id,
        expiresAt: session.session.expiresAt,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Session validation failed');
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Session validation failed',
    });
  }
});

module.exports = router;
