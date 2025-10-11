const { getDb } = require('./mongo');

async function ensureIndexes() {
  const db = getDb();
  await Promise.all([
    db.collection('artworks_meta').createIndex({ artist: 1, createdAt: -1 }),
    db.collection('artworks_meta').createIndex({ tags: 1 }),
    db.collection('artworks_meta').createIndex({ title: 'text', description: 'text' }),
    // Hash indexes for similarity search
    db.collection('artworks_meta').createIndex({ 'hashes.perceptual_hash_int': 1 }),
    db.collection('artworks_meta').createIndex({ 'hashes.average_hash_int': 1 }),
    db.collection('artworks_meta').createIndex({ 'hashes.difference_hash_int': 1 }),
    db.collection('artworks_meta').createIndex({ 'hashes.wavelet_hash_int': 1 }),
    db.collection('artworks_meta').createIndex({ 'hashes.color_hash_int': 1 }),
    db.collection('artworks_meta').createIndex({ 'hashes.blockhash8_int': 1 }),
    db.collection('artworks_meta').createIndex({ 'hashes.blockhash16_int': 1 }),
    // Token indexes for authentication
    db.collection('auth_tokens').createIndex({ token: 1 }, { unique: true }),
    db.collection('auth_tokens').createIndex({ expiresAt: 1 }),
    db.collection('auth_tokens').createIndex({ used: 1, expiresAt: 1 }),
    db.collection('auth_tokens').createIndex({ artworkId: 1 }, { sparse: true }),
  ]);
}

module.exports = {
  ensureIndexes,
};