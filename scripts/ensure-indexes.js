#!/usr/bin/env node

const logger = require('../src/config/logger');
const { connectMongo, disconnectMongo } = require('../src/config/mongo');
const { ensureIndexes } = require('../src/config/indexes');

(async () => {
  try {
    await connectMongo();
    await ensureIndexes();
    logger.info('MongoDB indexes ensured successfully');
    await disconnectMongo();
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Failed to ensure MongoDB indexes');
    await disconnectMongo();
    process.exit(1);
  }
})();

