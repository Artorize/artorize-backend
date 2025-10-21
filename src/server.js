const http = require('http');
const app = require('./app');
const config = require('./config/env');
const { connectMongo, disconnectMongo } = require('./config/mongo');
const { ensureIndexes } = require('./config/indexes');
const { cleanupTokens } = require('./services/token.service');
const logger = require('./config/logger');

let server;
let cleanupInterval;

async function start() {
  try {
    await connectMongo();
    await ensureIndexes();

    // Start token cleanup scheduler (runs every hour)
    cleanupInterval = setInterval(async () => {
      try {
        const deleted = await cleanupTokens();
        if (deleted > 0) {
          logger.info({ deleted }, 'Cleaned up expired tokens');
        }
      } catch (err) {
        logger.error({ err }, 'Token cleanup failed');
      }
    }, 60 * 60 * 1000); // 1 hour

    // Run initial cleanup
    const deleted = await cleanupTokens();
    if (deleted > 0) {
      logger.info({ deleted }, 'Initial token cleanup completed');
    }

    server = http.createServer(app);
    server.listen(config.port, '127.0.0.1', () => {
      logger.info({ port: config.port, host: '127.0.0.1' }, 'artscraper backend listening');
    });
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await disconnectMongo();
  process.exit(0);
}

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => {
    shutdown(signal).catch((err) => {
      logger.error({ err, signal }, 'Graceful shutdown failed');
      process.exit(1);
    });
  });
});

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  shutdown('uncaughtException').catch(() => process.exit(1));
});

start();
