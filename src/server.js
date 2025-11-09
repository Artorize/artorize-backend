// Handle CLI arguments FIRST before loading any dependencies
// This allows --version and --help to work without installing dependencies
const args = process.argv.slice(2);

if (args.includes('--version') || args.includes('-v')) {
  const { formatVersionInfo } = require('./utils/version');
  console.log(formatVersionInfo());
  process.exit(0);
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Artorize Backend - Artwork Storage Service

Usage:
  npm start [options]
  node src/server.js [options]

Options:
  --version, -v     Show version information and exit
  --help, -h        Show this help message and exit
  --config <path>   Specify config file path (default: config/runtime.json)

Environment Variables:
  AUTO_UPDATE       Enable/disable self-update on startup (default: true)
  APP_CONFIG_PATH   Path to configuration file
  NODE_ENV          Environment mode (development, production)

Examples:
  npm start
  npm start -- --version
  node src/server.js --config config/custom.json
  `.trim());
  process.exit(0);
}

// Now load heavy dependencies only if we're actually starting the server
const http = require('http');
const app = require('./app');
const config = require('./config/env');
const { connectMongo, disconnectMongo } = require('./config/mongo');
const { ensureIndexes } = require('./config/indexes');
const { cleanupTokens } = require('./services/token.service');
const logger = require('./config/logger');
const { performSelfUpdate } = require('./utils/self-update');

let server;
let cleanupInterval;

async function start() {
  try {
    // Perform self-update if enabled
    const autoUpdate = process.env.AUTO_UPDATE !== 'false'; // Default to true
    if (autoUpdate) {
      logger.info('Self-update check enabled');
      try {
        const updateResult = await performSelfUpdate(logger, {
          skipIfDirty: true
        });

        if (updateResult.updated) {
          logger.warn(
            { oldCommit: updateResult.oldCommit, newCommit: updateResult.newCommit },
            'Application was updated. Please restart the service to apply changes.'
          );
          // Note: In production with systemd, the service should be restarted manually
          // or configured with Restart=always to auto-restart on exit
        }
      } catch (error) {
        logger.warn({ error: error.message }, 'Self-update check failed, continuing with startup');
      }
    } else {
      logger.info('Self-update check disabled via AUTO_UPDATE=false');
    }

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

// Start the server
start();
