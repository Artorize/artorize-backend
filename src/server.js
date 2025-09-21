const http = require('http');
const app = require('./app');
const config = require('./config/env');
const { connectMongo, disconnectMongo } = require('./config/mongo');
const { ensureIndexes } = require('./config/indexes');

let server;

async function start() {
  try {
    await connectMongo();
    await ensureIndexes();

    server = http.createServer(app);
    server.listen(config.port, () => {
      console.log(`artscraper backend listening on port ${config.port}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`);
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await disconnectMongo();
  process.exit(0);
}

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => {
    shutdown(signal).catch((err) => {
      console.error('Graceful shutdown failed:', err);
      process.exit(1);
    });
  });
});

start();