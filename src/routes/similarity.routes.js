const express = require('express');
const {
  findSimilar,
  batchLookup,
  invalidateCacheEndpoint,
  getCacheStatsEndpoint,
} = require('../controllers/similarity.controller');
const { similaritySearchLimiter } = require('../middlewares/rateLimit');
const { validateRequest } = require('../middlewares/validateRequest');
const {
  findSimilarSchema,
  batchHashLookupSchema,
} = require('../validators/similarity.validators');

const router = express.Router();

// Similarity search endpoints
router.post(
  '/find-similar',
  similaritySearchLimiter,
  validateRequest(findSimilarSchema),
  findSimilar
);

router.post(
  '/batch-hash-lookup',
  similaritySearchLimiter,
  validateRequest(batchHashLookupSchema),
  batchLookup
);

// Cache management endpoints
router.post(
  '/similarity-cache/invalidate',
  invalidateCacheEndpoint
);

router.get(
  '/similarity-cache/stats',
  getCacheStatsEndpoint
);

module.exports = router;
