const { getDb } = require('./mongo');

async function ensureIndexes() {
  const db = getDb();
  await Promise.all([
    db.collection('artworks_meta').createIndex({ artist: 1, createdAt: -1 }),
    db.collection('artworks_meta').createIndex({ tags: 1 }),
    db.collection('artworks_meta').createIndex({ title: 'text', description: 'text' }),
  ]);
}

module.exports = {
  ensureIndexes,
};