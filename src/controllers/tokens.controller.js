const { createToken, revokeToken, getTokenStats } = require('../services/token.service');
const logger = require('../config/logger');

/**
 * Generate a new authentication token
 * POST /tokens
 */
async function generateToken(req, res) {
  try {
    const { artworkId, expiresIn, metadata } = req.body;

    const tokenDoc = await createToken({
      artworkId,
      expiresIn: expiresIn ? parseInt(expiresIn, 10) : undefined,
      metadata: metadata || {},
    });

    logger.info(
      {
        tokenId: tokenDoc._id.toString(),
        artworkId: tokenDoc.artworkId?.toString(),
        expiresAt: tokenDoc.expiresAt,
      },
      'Token generated'
    );

    res.status(201).json({
      token: tokenDoc.token,
      tokenId: tokenDoc._id,
      artworkId: tokenDoc.artworkId,
      expiresAt: tokenDoc.expiresAt,
      createdAt: tokenDoc.createdAt,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to generate token');
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to generate authentication token',
    });
  }
}

/**
 * Revoke an authentication token
 * DELETE /tokens/:token
 */
async function deleteToken(req, res) {
  try {
    const { token } = req.params;

    const revoked = await revokeToken(token);

    if (!revoked) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Token not found or already revoked',
      });
    }

    logger.info({ token: token.slice(0, 4) + '...' }, 'Token revoked');

    res.status(200).json({
      success: true,
      message: 'Token revoked successfully',
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to revoke token');
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to revoke token',
    });
  }
}

/**
 * Get token statistics
 * GET /tokens/stats
 */
async function getStats(req, res) {
  try {
    const stats = await getTokenStats();

    res.status(200).json({
      stats,
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get token stats');
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve token statistics',
    });
  }
}

module.exports = {
  generateToken,
  deleteToken,
  getStats,
};
