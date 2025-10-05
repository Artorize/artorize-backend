#!/usr/bin/env node

const { MongoMemoryServer } = require('mongodb-memory-server');

const desiredPort = Number.parseInt(process.env.MONGO_MEMORY_PORT || '27017', 10);
const dbName = process.env.MONGO_MEMORY_DB || 'artgallery';

(async () => {
  const server = await MongoMemoryServer.create({
    instance: {
      port: desiredPort,
      dbName,
    },
    binary: {
      version: process.env.MONGO_MEMORY_VERSION || '7.0.14',
    },
  });

  const uri = server.getUri();
  // eslint-disable-next-line no-console
  console.log(`MongoDB memory server listening at ${uri}`);

  const shutdown = async (signal) => {
    // eslint-disable-next-line no-console
    console.log(`Stopping MongoDB memory server (${signal})`);
    try {
      await server.stop();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to stop Mongo memory server', error);
    } finally {
      process.exit(0);
    }
  };

  ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach((signal) => {
    process.on(signal, () => shutdown(signal));
  });

  // Keep the event loop alive
  setInterval(() => {}, 60_000);
})();
