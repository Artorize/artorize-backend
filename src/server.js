const http = require('http');
const app = require('./app');
const config = require('./config/env');
const { connectMongo, disconnectMongo } = require('./config/mongo');
const { ensureIndexes } = require('./config/indexes');
const logger = require('./config/logger');

let server;

async function start() {
  try {
    await connectMongo();
    await ensureIndexes();

    server = http.createServer(app);
    server.listen(config.port, () => {
      logger.info({ port: config.port }, 'artscraper backend listening');
    });
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
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
