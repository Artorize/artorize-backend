/**
 * Health Check Controller
 * Provides detailed health status for all system components
 */

const { getClient, getDb } = require('../config/mongo');
const logger = require('../config/logger');

/**
 * Check MongoDB connection status
 * @returns {Object} MongoDB health status
 */
async function checkMongoHealth() {
  try {
    const client = getClient();
    const db = getDb();

    // Ping the database to verify connection
    await db.admin().ping();

    // Get server status for additional info
    const serverStatus = await db.admin().serverStatus();

    return {
      status: 'healthy',
      connected: true,
      database: db.databaseName,
      version: serverStatus.version,
      uptime: serverStatus.uptime,
      message: 'MongoDB connection active',
    };
  } catch (error) {
    logger.error({ err: error }, 'MongoDB health check failed');
    return {
      status: 'unhealthy',
      connected: false,
      error: error.message,
    };
  }
}

/**
 * Check GridFS buckets availability
 * @returns {Object} GridFS health status
 */
async function checkGridFSHealth() {
  try {
    const db = getDb();

    // Check if GridFS collections exist
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);

    const expectedBuckets = [
      'artwork_originals.files',
      'artwork_originals.chunks',
      'artwork_protected.files',
      'artwork_protected.chunks',
      'artwork_masks.files',
      'artwork_masks.chunks',
    ];

    const existingBuckets = expectedBuckets.filter(name =>
      collectionNames.includes(name)
    );

    const allBucketsExist = existingBuckets.length === expectedBuckets.length;

    // GridFS buckets are created on-demand, so missing buckets are not a problem
    // Only mark as unhealthy if we can't check collections at all
    return {
      status: 'healthy',
      bucketsFound: existingBuckets.length,
      bucketsExpected: expectedBuckets.length,
      bucketsReady: allBucketsExist,
      buckets: {
        originals: collectionNames.includes('artwork_originals.files'),
        protected: collectionNames.includes('artwork_protected.files'),
        masks: collectionNames.includes('artwork_masks.files'),
      },
      message: allBucketsExist
        ? 'All GridFS buckets initialized'
        : 'GridFS buckets will be created on first upload',
    };
  } catch (error) {
    logger.error({ err: error }, 'GridFS health check failed');
    return {
      status: 'unhealthy',
      error: error.message,
    };
  }
}

/**
 * Check hash storage and similarity search availability
 * @returns {Object} Hash storage health status
 */
async function checkHashStorageHealth() {
  try {
    const db = getDb();

    // Check if artworks_meta collection exists and has data
    const metaCollection = db.collection('artworks_meta');
    const count = await metaCollection.estimatedDocumentCount();

    // Check indexes on artworks_meta
    const indexes = await metaCollection.indexes();
    const hasHashIndexes = indexes.some(idx =>
      idx.name && idx.name.includes('hashes')
    );

    return {
      status: 'healthy',
      artworksCount: count,
      indexesConfigured: hasHashIndexes,
      message: count > 0
        ? `${count} artwork(s) stored`
        : 'Ready to store artworks',
    };
  } catch (error) {
    logger.error({ err: error }, 'Hash storage health check failed');
    return {
      status: 'unhealthy',
      error: error.message,
    };
  }
}

/**
 * Main health check endpoint handler
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 */
async function healthCheck(req, res) {
  const startTime = Date.now();

  try {
    // Run all health checks in parallel
    const [mongoHealth, gridfsHealth, hashStorageHealth] = await Promise.all([
      checkMongoHealth(),
      checkGridFSHealth(),
      checkHashStorageHealth(),
    ]);

    // Determine overall health status
    const allHealthy =
      mongoHealth.status === 'healthy' &&
      gridfsHealth.status === 'healthy' &&
      hashStorageHealth.status === 'healthy';

    const anyUnhealthy =
      mongoHealth.status === 'unhealthy' ||
      gridfsHealth.status === 'unhealthy' ||
      hashStorageHealth.status === 'unhealthy';

    const overallStatus = anyUnhealthy ? 'unhealthy' : (allHealthy ? 'healthy' : 'degraded');

    const responseTime = Date.now() - startTime;

    // Create component status summary
    const componentStatuses = {
      mongodb: mongoHealth.status,
      gridfs: gridfsHealth.status,
      hashStorage: hashStorageHealth.status,
    };

    const healthData = {
      status: overallStatus,
      message: overallStatus === 'healthy'
        ? 'All systems operational'
        : overallStatus === 'degraded'
        ? 'Some components degraded'
        : 'System unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      responseTime,
      summary: componentStatuses,
      components: {
        mongodb: mongoHealth,
        gridfs: gridfsHealth,
        hashStorage: hashStorageHealth,
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        memory: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        },
      },
    };

    // Set appropriate HTTP status code
    const httpStatus = overallStatus === 'unhealthy' ? 503 : 200;

    res.status(httpStatus).json(healthData);
  } catch (error) {
    logger.error({ err: error }, 'Health check failed');

    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      error: error.message,
      components: {
        mongodb: { status: 'unknown' },
        gridfs: { status: 'unknown' },
        hashStorage: { status: 'unknown' },
      },
    });
  }
}

module.exports = {
  healthCheck,
};
