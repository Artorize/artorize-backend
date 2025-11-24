const { MongoClient } = require('mongodb');

let client;
let database;
let configLoaded = false;

function getConfig() {
  if (!configLoaded) {
    configLoaded = true;
    return require('./env');
  }
  return require('./env');
}

async function connectMongo() {
  if (database) return database;

  const config = getConfig();

  if (!client) {
    client = new MongoClient(config.mongoUri, {
      maxPoolSize: 50,
    });
  }

  await client.connect();
  database = client.db(config.dbName);
  return database;
}

/**
 * Set database connection directly (for testing purposes)
 * @param {MongoClient} mongoClient - MongoDB client instance
 * @param {Db} db - MongoDB database instance
 */
function setConnection(mongoClient, db) {
  client = mongoClient;
  database = db;
}

function getDb() {
  if (!database) {
    throw new Error('MongoDB not initialised. Call connectMongo() first.');
  }
  return database;
}

function getClient() {
  if (!client) {
    throw new Error('MongoDB client not initialised.');
  }
  return client;
}

async function disconnectMongo() {
  if (client) {
    await client.close();
    client = undefined;
    database = undefined;
  }
}

module.exports = {
  connectMongo,
  getDb,
  getClient,
  disconnectMongo,
  setConnection,
};