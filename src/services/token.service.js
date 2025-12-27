const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const { getDb } = require('../config/mongo');

const TOKEN_COLLECTION = 'auth_tokens';
const DEFAULT_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generate a cryptographically secure random token
 * @param {number} length - Length of the token (default: 16)
 * @returns {string} Random hex string
 */
function generateSecureToken(length = 16) {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

/**
 * Create a new authentication token
 * @param {Object} options
 * @param {string} [options.artworkId] - Optional artwork ID this token is for
 * @param {number} [options.expiresIn] - Expiry time in milliseconds (default: 1 hour)
 * @param {Object} [options.metadata] - Additional metadata to store with token
 * @returns {Promise<Object>} Token document with token string
 */
async function createToken({ artworkId = null, expiresIn = DEFAULT_EXPIRY_MS, metadata = {} } = {}) {
  const db = getDb();
  const collection = db.collection(TOKEN_COLLECTION);

  const token = generateSecureToken(16);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresIn);

  const tokenDoc = {
    token,
    artworkId: artworkId ? new ObjectId(artworkId) : null,
    used: false,
    createdAt: now,
    expiresAt,
    usedAt: null,
    metadata,
  };

  const result = await collection.insertOne(tokenDoc);
  tokenDoc._id = result.insertedId;

  return tokenDoc;
}

/**
 * Validate and consume a token (marks it as used)
 * @param {string} token - The token string to validate
 * @param {Object} options
 * @param {boolean} [options.consume] - Whether to mark token as used (default: true)
 * @returns {Promise<Object|null>} Token document if valid, null otherwise
 */
async function validateToken(token, { consume = true } = {}) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const db = getDb();
  const collection = db.collection(TOKEN_COLLECTION);

  const now = new Date();

  const query = {
    token,
    used: false,
    expiresAt: { $gt: now },
  };

  if (consume) {
    // Atomically find and mark as used
    const result = await collection.findOneAndUpdate(
      query,
      {
        $set: {
          used: true,
          usedAt: now,
        },
      },
      {
        returnDocument: 'after',
      }
    );

    return result?.value || null;
  } else {
    // Just check if token is valid without consuming
    return await collection.findOne(query);
  }
}

/**
 * Revoke a token (marks it as used)
 * @param {string} token - The token string to revoke
 * @returns {Promise<boolean>} True if token was revoked, false otherwise
 */
async function revokeToken(token) {
  if (!token || typeof token !== 'string') {
    return false;
  }

  const db = getDb();
  const collection = db.collection(TOKEN_COLLECTION);

  const result = await collection.updateOne(
    { token },
    {
      $set: {
        used: true,
        usedAt: new Date(),
      },
    }
  );

  return result.modifiedCount > 0;
}

/**
 * Clean up expired and used tokens
 * @param {Object} options
 * @param {number} [options.olderThan] - Delete tokens older than this many milliseconds (default: 24 hours)
 * @returns {Promise<number>} Number of tokens deleted
 */
async function cleanupTokens({ olderThan = 24 * 60 * 60 * 1000 } = {}) {
  const db = getDb();
  const collection = db.collection(TOKEN_COLLECTION);

  const cutoffDate = new Date(Date.now() - olderThan);

  const result = await collection.deleteMany({
    $or: [
      { expiresAt: { $lt: new Date() } }, // Expired tokens
      { used: true, usedAt: { $lt: cutoffDate } }, // Used tokens older than cutoff
    ],
  });

  return result.deletedCount;
}

/**
 * Get token statistics
 * @returns {Promise<Object>} Token statistics
 */
async function getTokenStats() {
  const db = getDb();
  const collection = db.collection(TOKEN_COLLECTION);

  const now = new Date();

  const [total, active, used, expired] = await Promise.all([
    collection.countDocuments({}),
    collection.countDocuments({ used: false, expiresAt: { $gt: now } }),
    collection.countDocuments({ used: true }),
    collection.countDocuments({ expiresAt: { $lte: now } }),
  ]);

  return {
    total,
    active,
    used,
    expired,
  };
}

/**
 * Create indexes for the token collection
 */
async function createTokenIndexes() {
  const db = getDb();
  const collection = db.collection(TOKEN_COLLECTION);

  await Promise.all([
    collection.createIndex({ token: 1 }, { unique: true }),
    collection.createIndex({ expiresAt: 1 }),
    collection.createIndex({ used: 1, expiresAt: 1 }),
    collection.createIndex({ artworkId: 1 }, { sparse: true }),
  ]);
}

module.exports = {
  generateSecureToken,
  createToken,
  validateToken,
  revokeToken,
  cleanupTokens,
  getTokenStats,
  createTokenIndexes,
};
