const { MongoClient } = require('mongodb');
const config = require('./env');

let client;
let database;

async function connectMongo() {
  if (database) return database;

  if (!client) {
    client = new MongoClient(config.mongoUri, {
      maxPoolSize: 50,
    });
  }

  await client.connect();
  database = client.db(config.dbName);
  return database;
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
};