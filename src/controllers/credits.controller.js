const { getOrCreateCredits, deductCredits: deductCreditsService, getUsageHistory: getUsageHistoryService } = require('../services/credits.service');
const logger = require('../config/logger');

/**
 * Get credit balance for authenticated user
 * GET /credits/me
 */
async function getMyCredits(req, res) {
  try {
    const userId = req.headers['x-user-id'];

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User authentication required',
      });
    }

    const credits = await getOrCreateCredits(userId);

    logger.info(
      {
        userId,
        balance: credits.balance,
        tier: credits.tier,
      },
      'Credits retrieved'
    );

    res.status(200).json({
      userId: credits.userId,
      balance: credits.balance,
      tier: credits.tier,
      createdAt: credits.createdAt,
      updatedAt: credits.updatedAt,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get credits');
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve credit balance',
    });
  }
}

/**
 * Deduct credits from user balance
 * POST /credits/deduct
 */
async function deductCredits(req, res) {
  try {
    const userId = req.headers['x-user-id'];

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User authentication required',
      });
    }

    const { amount, metadata = {} } = req.body;

    const result = await deductCreditsService(userId, amount, metadata);

    if (!result.success) {
      logger.warn(
        {
          userId,
          requestedAmount: amount,
          currentBalance: result.balance,
        },
        'Insufficient credits'
      );

      return res.status(402).json({
        error: 'Insufficient credits',
        balance: result.balance,
        required: amount,
      });
    }

    logger.info(
      {
        userId,
        deducted: result.deducted,
        newBalance: result.balance,
      },
      'Credits deducted'
    );

    res.status(200).json({
      success: true,
      deducted: result.deducted,
      balance: result.balance,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to deduct credits');
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to deduct credits',
    });
  }
}

/**
 * Get usage history for authenticated user
 * GET /credits/usage
 */
async function getUsageHistory(req, res) {
  try {
    const userId = req.headers['x-user-id'];

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User authentication required',
      });
    }

    const limit = parseInt(req.query.limit, 10) || 20;

    const history = await getUsageHistoryService(userId, limit);

    res.status(200).json({
      userId,
      history,
      count: history.length,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get usage history');
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve usage history',
    });
  }
}

module.exports = {
  getMyCredits,
  deductCredits,
  getUsageHistory,
};
