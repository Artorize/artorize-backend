/**
 * Similarity Search Service
 * Implements perceptual hash similarity search using Hamming distance
 */

const { getDb } = require('../config/mongo');
const { getHashesFromDocument, getHashBitLength, HASH_TYPES } = require('./hash-storage.service');
const config = require('../config/env');

/**
 * Calculates Hamming distance between two BigInt hash values
 * @param {bigint} hash1 - First hash
 * @param {bigint} hash2 - Second hash
 * @returns {number} Hamming distance (number of differing bits)
 */
function calculateHammingDistance(hash1, hash2) {
  let xor = hash1 ^ hash2;
  let distance = 0;

  while (xor > 0n) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }

  return distance;
}

/**
 * Converts Hamming distance to similarity score (0.0 - 1.0)
 * @param {number} distance - Hamming distance
 * @param {number} bitLength - Total bits in hash
 * @returns {number} Similarity score
 */
function distanceToSimilarity(distance, bitLength) {
  return 1.0 - distance / bitLength;
}

/**
 * Calculates weighted similarity score across multiple hash types
 * @param {Object} similarities - Object mapping hash type to similarity score
 * @param {Object} weights - Object mapping hash type to weight
 * @returns {number} Weighted average similarity score
 */
function calculateWeightedSimilarity(similarities, weights) {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const [hashType, similarity] of Object.entries(similarities)) {
    const weight = weights[hashType] || 0;
    if (weight > 0) {
      weightedSum += similarity * weight;
      totalWeight += weight;
    }
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Finds similar artworks based on perceptual hashes
 * @param {Object} queryHashes - Hash values to search for
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Array of similar artworks with similarity scores
 */
async function findSimilarByHashes(queryHashes, options = {}) {
  const {
    threshold = config.similarity?.defaultThreshold || 0.85,
    limit = config.similarity?.defaultLimit || 10,
    hashWeights = config.similarity?.hashWeights || getDefaultHashWeights(),
  } = options;

  const maxCandidates = config.similarity?.maxCandidates || 1000;
  const maxLimit = config.similarity?.maxLimit || 100;
  const effectiveLimit = Math.min(limit, maxLimit);

  // Determine which hash types we're searching with
  const searchHashTypes = HASH_TYPES.filter((type) => queryHashes[type]);

  if (searchHashTypes.length === 0) {
    return {
      matches: [],
      total_matches: 0,
      search_params: {
        threshold,
        limit: effectiveLimit,
        hash_types_used: [],
      },
    };
  }

  // Convert hex strings to BigInt for query hashes
  const queryHashInts = {};
  for (const hashType of searchHashTypes) {
    const intKey = `${hashType}_int`;
    if (queryHashes[intKey]) {
      queryHashInts[hashType] = queryHashes[intKey];
    }
  }

  const db = getDb();
  const collection = db.collection('artworks_meta');

  // Build query to find candidates with at least one matching hash type
  const candidateQuery = {
    $or: searchHashTypes.map((type) => ({
      [`hashes.${type}_int`]: { $exists: true },
    })),
  };

  // Fetch candidate artworks
  const candidates = await collection
    .find(candidateQuery)
    .limit(maxCandidates)
    .toArray();

  // Calculate similarity for each candidate
  const results = [];

  for (const candidate of candidates) {
    const candidateHashes = getHashesFromDocument(candidate);
    if (!candidateHashes) continue;

    const hashDistances = {};
    const hashSimilarities = {};

    // Calculate distance and similarity for each hash type
    for (const hashType of searchHashTypes) {
      const intKey = `${hashType}_int`;
      if (queryHashInts[hashType] && candidateHashes[intKey]) {
        const distance = calculateHammingDistance(
          queryHashInts[hashType],
          candidateHashes[intKey]
        );

        const bitLength = getHashBitLength(hashType);
        const similarity = distanceToSimilarity(distance, bitLength);

        hashDistances[hashType] = distance;
        hashSimilarities[hashType] = similarity;
      }
    }

    // Calculate weighted overall similarity
    const overallSimilarity = calculateWeightedSimilarity(hashSimilarities, hashWeights);

    // Filter by threshold
    if (overallSimilarity >= threshold) {
      results.push({
        _id: candidate._id,
        title: candidate.title,
        artist: candidate.artist,
        tags: candidate.tags || [],
        similarity_score: Math.round(overallSimilarity * 10000) / 10000, // 4 decimal places
        hash_distances: hashDistances,
        hash_similarities: Object.fromEntries(
          Object.entries(hashSimilarities).map(([k, v]) => [
            k,
            Math.round(v * 10000) / 10000,
          ])
        ),
        thumbnail_url: `/artworks/${candidate._id}?variant=protected`,
        uploaded_at: candidate.uploadedAt,
        created_at: candidate.createdAt,
      });
    }
  }

  // Sort by similarity score (descending) and limit
  results.sort((a, b) => b.similarity_score - a.similarity_score);
  const limitedResults = results.slice(0, effectiveLimit);

  return {
    matches: limitedResults,
    total_matches: results.length,
    search_params: {
      threshold,
      limit: effectiveLimit,
      hash_types_used: searchHashTypes,
    },
  };
}

/**
 * Performs batch hash lookup for multiple queries
 * @param {Array} queries - Array of query objects with id and hashes
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Results for each query
 */
async function batchHashLookup(queries, options = {}) {
  const results = [];

  for (const query of queries) {
    const searchResult = await findSimilarByHashes(query.hashes, options);

    results.push({
      query_id: query.id,
      matches: searchResult.matches,
      match_count: searchResult.total_matches,
    });
  }

  return { results };
}

/**
 * Gets default hash weights
 * @returns {Object} Default weights for each hash type
 */
function getDefaultHashWeights() {
  return {
    perceptual_hash: 1.0,
    average_hash: 0.8,
    difference_hash: 0.6,
    wavelet_hash: 0.5,
    color_hash: 0.3,
    blockhash8: 0.4,
    blockhash16: 0.7,
  };
}

module.exports = {
  calculateHammingDistance,
  distanceToSimilarity,
  calculateWeightedSimilarity,
  findSimilarByHashes,
  batchHashLookup,
  getDefaultHashWeights,
};
