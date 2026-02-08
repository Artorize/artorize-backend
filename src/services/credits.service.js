const { getDb } = require('../config/mongo');

const CREDITS_COLLECTION = 'user_credits';
const USAGE_LOG_COLLECTION = 'credit_usage';
const DEFAULT_CREDITS = 50;
const COST_PER_PROTECTION = 1;

/**
 * Get or create credit record for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Credit record with userId, balance, tier, createdAt, updatedAt
 */
async function getOrCreateCredits(userId) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Invalid userId provided');
  }

  const db = getDb();
  const collection = db.collection(CREDITS_COLLECTION);

  let creditRecord = await collection.findOne({ userId });

  if (!creditRecord) {
    const now = new Date();
    creditRecord = {
      userId,
      balance: DEFAULT_CREDITS,
      tier: 'free',
      createdAt: now,
      updatedAt: now,
    };

    await collection.insertOne(creditRecord);
  }

  return creditRecord;
}

/**
 * Deduct credits from user balance atomically
 * @param {string} userId - User ID
 * @param {number} amount - Amount to deduct (default: COST_PER_PROTECTION)
 * @param {Object} metadata - Additional metadata to log
 * @returns {Promise<Object>} Result with success, balance, and deducted amount
 */
async function deductCredits(userId, amount = COST_PER_PROTECTION, metadata = {}) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Invalid userId provided');
  }

  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error('Invalid amount provided');
  }

  const db = getDb();
  const collection = db.collection(CREDITS_COLLECTION);
  const usageCollection = db.collection(USAGE_LOG_COLLECTION);

  // Try to atomically deduct credits if balance is sufficient
  let result = await collection.findOneAndUpdate(
    {
      userId,
      balance: { $gte: amount },
    },
    {
      $inc: { balance: -amount },
      $set: { updatedAt: new Date() },
    },
    {
      returnDocument: 'after',
    }
  );

  // If no document found, try to create record and retry
  if (!result) {
    await getOrCreateCredits(userId);

    result = await collection.findOneAndUpdate(
      {
        userId,
        balance: { $gte: amount },
      },
      {
        $inc: { balance: -amount },
        $set: { updatedAt: new Date() },
      },
      {
        returnDocument: 'after',
      }
    );

    // Still no document means insufficient balance
    if (!result) {
      const currentRecord = await collection.findOne({ userId });
      return {
        success: false,
        balance: currentRecord?.balance || 0,
        deducted: 0,
      };
    }
  }

  // Log the usage
  await usageCollection.insertOne({
    userId,
    type: 'deduction',
    amount: -amount,
    balanceAfter: result.balance,
    metadata,
    createdAt: new Date(),
  });

  return {
    success: true,
    balance: result.balance,
    deducted: amount,
  };
}

/**
 * Add credits to user balance
 * @param {string} userId - User ID
 * @param {number} amount - Amount to add
 * @param {Object} metadata - Additional metadata to log
 * @returns {Promise<Object>} Result with balance and added amount
 */
async function addCredits(userId, amount, metadata = {}) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Invalid userId provided');
  }

  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error('Invalid amount provided');
  }

  const db = getDb();
  const collection = db.collection(CREDITS_COLLECTION);
  const usageCollection = db.collection(USAGE_LOG_COLLECTION);

  // Ensure record exists
  await getOrCreateCredits(userId);

  // Add credits
  const result = await collection.findOneAndUpdate(
    { userId },
    {
      $inc: { balance: amount },
      $set: { updatedAt: new Date() },
    },
    {
      returnDocument: 'after',
    }
  );

  // Log the usage
  await usageCollection.insertOne({
    userId,
    type: 'addition',
    amount,
    balanceAfter: result.balance,
    metadata,
    createdAt: new Date(),
  });

  return {
    balance: result.balance,
    added: amount,
  };
}

/**
 * Get usage history for a user
 * @param {string} userId - User ID
 * @param {number} limit - Maximum number of records to return (default: 20)
 * @returns {Promise<Array>} Array of usage records
 */
async function getUsageHistory(userId, limit = 20) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Invalid userId provided');
  }

  const db = getDb();
  const collection = db.collection(USAGE_LOG_COLLECTION);

  const history = await collection
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return history;
}

/**
 * Create indexes for credit collections
 */
async function createCreditsIndexes() {
  const db = getDb();

  await Promise.all([
    db.collection(CREDITS_COLLECTION).createIndex({ userId: 1 }, { unique: true }),
    db.collection(USAGE_LOG_COLLECTION).createIndex({ userId: 1, createdAt: -1 }),
  ]);
}

module.exports = {
  getOrCreateCredits,
  deductCredits,
  addCredits,
  getUsageHistory,
  createCreditsIndexes,
  CREDITS_COLLECTION,
  USAGE_LOG_COLLECTION,
  DEFAULT_CREDITS,
  COST_PER_PROTECTION,
};
