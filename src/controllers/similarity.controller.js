const {
  findSimilarByHashesOptimized,
  batchHashLookupOptimized,
  invalidateCache,
  getCacheStats,
} = require('../services/similarity-search-optimized.service');
const { hexToBigInt } = require('../services/hash-storage.service');

/**
 * Converts hash hex strings to BigInt format for processing
 * @param {Object} hashes - Hash object with hex strings
 * @returns {Object} Hash object with BigInt values added
 */
function prepareHashesForSearch(hashes) {
  const prepared = { ...hashes };

  const hashTypes = [
    'perceptual_hash',
    'average_hash',
    'difference_hash',
    'wavelet_hash',
    'color_hash',
    'blockhash8',
    'blockhash16',
  ];

  for (const hashType of hashTypes) {
    if (hashes[hashType]) {
      try {
        prepared[`${hashType}_int`] = hexToBigInt(hashes[hashType]);
      } catch (error) {
        // Skip invalid hashes (validation should have caught this)
        req.log?.warn({ hashType, error: error.message }, 'Failed to convert hash to BigInt');
      }
    }
  }

  return prepared;
}

/**
 * Find similar artworks by perceptual hashes
 * POST /artworks/find-similar
 */
async function findSimilar(req, res, next) {
  try {
    const { hashes, threshold, limit, hash_weights, use_optimization } = req.body;

    // Prepare hashes for search (convert to BigInt)
    const preparedHashes = prepareHashesForSearch(hashes);

    // Perform optimized similarity search (VP-Tree)
    const results = await findSimilarByHashesOptimized(preparedHashes, {
      threshold,
      limit,
      hashWeights: hash_weights,
      useVPTree: use_optimization !== false, // Default to true
    });

    res.json(results);
  } catch (error) {
    req.log.error({ err: error, body: req.body }, 'Failed to find similar artworks');
    next(error);
  }
}

/**
 * Batch hash lookup for multiple queries
 * POST /artworks/batch-hash-lookup
 */
async function batchLookup(req, res, next) {
  try {
    const { queries, threshold, limit, use_optimization } = req.body;

    // Prepare all queries
    const preparedQueries = queries.map((query) => ({
      id: query.id,
      hashes: prepareHashesForSearch(query.hashes),
    }));

    // Perform optimized batch lookup
    const results = await batchHashLookupOptimized(preparedQueries, {
      threshold,
      limit,
      useVPTree: use_optimization !== false,
    });

    res.json(results);
  } catch (error) {
    req.log.error({ err: error, queryCount: req.body?.queries?.length }, 'Failed to perform batch hash lookup');
    next(error);
  }
}

/**
 * Invalidate VP-Tree cache
 * POST /artworks/similarity-cache/invalidate
 */
async function invalidateCacheEndpoint(req, res, next) {
  try {
    const { hash_type } = req.body;
    invalidateCache(hash_type);

    res.json({
      success: true,
      message: hash_type
        ? `Cache invalidated for ${hash_type}`
        : 'All caches invalidated',
    });
  } catch (error) {
    req.log.error({ err: error }, 'Failed to invalidate cache');
    next(error);
  }
}

/**
 * Get cache statistics
 * GET /artworks/similarity-cache/stats
 */
async function getCacheStatsEndpoint(req, res, next) {
  try {
    const stats = getCacheStats();
    res.json({ stats });
  } catch (error) {
    req.log.error({ err: error }, 'Failed to get cache stats');
    next(error);
  }
}

module.exports = {
  findSimilar,
  batchLookup,
  invalidateCacheEndpoint,
  getCacheStatsEndpoint,
};
