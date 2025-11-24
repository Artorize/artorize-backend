const { describe, it, before, after } = require('mocha');
const { expect } = require('chai');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoClient, ObjectId } = require('mongodb');
const sharp = require('sharp');
const { encodeSAC } = require('../src/services/sac-encoder.service');

const crypto = require('crypto');

// Import app after setting test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY || crypto.randomBytes(32).toString('base64');
process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || crypto.randomBytes(32).toString('hex');
process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'test-internal-api-key-123456789012';

describe('Artwork Duplication Check API', () => {
  let app;
  let mongoServer;
  let mongoClient;
  let db;
  let testArtworkId1;
  let testArtworkId2;
  let testChecksum1;
  let testChecksum2;

  // Test data
  const testImages = {};

  const testJsonData = {
    analysis: {
      processedAt: new Date().toISOString(),
      dimensions: { width: 100, height: 100 },
      format: 'jpeg',
      quality: 95,
    },
    summary: {
      title: 'Test Summary',
      description: 'A test summary',
    },
  };

  before(async function() {
    this.timeout(60000);

    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create({
      instance: {
        port: 27019,
      },
    });

    const mongoUri = mongoServer.getUri();

    // Create temporary test config
    const fs = require('fs');
    const path = require('path');
    const configDir = path.join(__dirname, '..', 'config');
    const configPath = path.join(configDir, 'runtime.json');

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const testConfig = {
      environment: 'test',
      port: 3002,
      mongo: {
        uri: mongoUri,
        dbName: 'test_check_exists'
      },
      logLevel: 'silent'
    };

    fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2));

    // Connect to MongoDB
    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
    db = mongoClient.db('test_check_exists');

    // Clear any cached config and set the connection for all services
    delete require.cache[require.resolve('../src/config/env.js')];
    delete require.cache[require.resolve('../src/config/mongo.js')];

    const { setConnection } = require('../src/config/mongo');
    setConnection(mongoClient, db);

    // Ensure database indexes
    const { ensureIndexes } = require('../src/config/indexes');
    await ensureIndexes();

    // Create test images
    testImages.original1 = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    testImages.original2 = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 0, g: 0, b: 255 },
      },
    })
      .jpeg()
      .toBuffer();

    testImages.protected = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 0, g: 255, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    // Create test mask in SAC v1 format
    const width = 100;
    const height = 100;
    const hiResX = new Int16Array(width * height);
    const hiResY = new Int16Array(width * height);
    for (let i = 0; i < width * height; i++) {
      hiResX[i] = Math.floor(Math.random() * 1000) - 500;
      hiResY[i] = Math.floor(Math.random() * 1000) - 500;
    }
    testImages.mask = encodeSAC(hiResX, hiResY);

    // Import and initialize app with Better Auth
    const { createAuth } = require('../src/auth/betterAuth');
    const createApp = require('../src/app');

    // Create Better Auth instance
    const auth = await createAuth(db, mongoClient);

    // Create the Express app
    app = await createApp(auth);

    // Create test artworks
    const res1 = await request(app)
      .post('/artworks')
      .attach('original', testImages.original1, 'test1.jpg')
      .attach('protected', testImages.protected, 'protected1.jpg')
      .attach('mask', testImages.mask, 'mask1.sac')
      .attach('analysis', Buffer.from(JSON.stringify(testJsonData.analysis)), 'analysis.json')
      .attach('summary', Buffer.from(JSON.stringify(testJsonData.summary)), 'summary.json')
      .field('title', 'Mona Lisa')
      .field('artist', 'Leonardo da Vinci')
      .field('description', 'Famous painting')
      .field('tags', 'renaissance,portrait,famous');

    testArtworkId1 = res1.body.id;

    // Get checksum from metadata
    const metadata1 = await request(app)
      .get(`/artworks/${testArtworkId1}/metadata`);
    testChecksum1 = metadata1.body.checksum;

    const res2 = await request(app)
      .post('/artworks')
      .attach('original', testImages.original2, 'test2.jpg')
      .attach('protected', testImages.protected, 'protected2.jpg')
      .attach('mask', testImages.mask, 'mask2.sac')
      .attach('analysis', Buffer.from(JSON.stringify(testJsonData.analysis)), 'analysis.json')
      .attach('summary', Buffer.from(JSON.stringify(testJsonData.summary)), 'summary.json')
      .field('title', 'The Last Supper')
      .field('artist', 'Leonardo da Vinci')
      .field('description', 'Another famous painting')
      .field('tags', 'renaissance,mural,famous');

    testArtworkId2 = res2.body.id;

    // Get checksum from metadata
    const metadata2 = await request(app)
      .get(`/artworks/${testArtworkId2}/metadata`);
    testChecksum2 = metadata2.body.checksum;
  });

  after(async function() {
    this.timeout(30000);

    // Cleanup app's MongoDB connection
    const { disconnectMongo } = require('../src/config/mongo');
    await disconnectMongo();

    if (mongoClient) {
      await mongoClient.close();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  describe('GET /artworks/check-exists', () => {
    it('should find artwork by ID', async () => {
      const res = await request(app)
        .get(`/artworks/check-exists?id=${testArtworkId1}`)
        .expect(200);

      expect(res.body).to.have.property('exists', true);
      expect(res.body).to.have.property('matchCount', 1);
      expect(res.body).to.have.property('matches');
      expect(res.body.matches).to.be.an('array');
      expect(res.body.matches).to.have.lengthOf(1);
      expect(res.body.matches[0]._id).to.equal(testArtworkId1);
    });

    it('should find artwork by checksum', async () => {
      const res = await request(app)
        .get(`/artworks/check-exists?checksum=${testChecksum1}`)
        .expect(200);

      expect(res.body).to.have.property('exists', true);
      expect(res.body).to.have.property('matchCount', 1);
      expect(res.body.matches[0]._id).to.equal(testArtworkId1);
      expect(res.body.matches[0]).to.have.property('checksum', testChecksum1);
    });

    it('should find artwork by title and artist', async () => {
      const res = await request(app)
        .get('/artworks/check-exists?title=Mona Lisa&artist=Leonardo da Vinci')
        .expect(200);

      expect(res.body).to.have.property('exists', true);
      expect(res.body).to.have.property('matchCount', 1);
      expect(res.body.matches[0]).to.have.property('title', 'Mona Lisa');
      expect(res.body.matches[0]).to.have.property('artist', 'Leonardo da Vinci');
    });

    it('should find artworks by tags (single tag)', async () => {
      const res = await request(app)
        .get('/artworks/check-exists?tags=renaissance')
        .expect(200);

      expect(res.body).to.have.property('exists', true);
      expect(res.body.matchCount).to.be.at.least(1);
      // Should match both artworks since both have 'renaissance' tag
      expect(res.body.matchCount).to.equal(2);
    });

    it('should find artworks by tags (multiple tags)', async () => {
      const res = await request(app)
        .get('/artworks/check-exists?tags=renaissance,portrait')
        .expect(200);

      expect(res.body).to.have.property('exists', true);
      // Should only match the first artwork since it has both tags
      expect(res.body.matchCount).to.equal(1);
      expect(res.body.matches[0]._id).to.equal(testArtworkId1);
    });

    it('should return no match for non-existent ID', async () => {
      const fakeId = new ObjectId().toString();
      const res = await request(app)
        .get(`/artworks/check-exists?id=${fakeId}`)
        .expect(200);

      expect(res.body).to.have.property('exists', false);
      expect(res.body).to.have.property('matchCount', 0);
      expect(res.body.matches).to.be.an('array');
      expect(res.body.matches).to.have.lengthOf(0);
    });

    it('should return no match for non-existent checksum', async () => {
      const fakeChecksum = 'a'.repeat(64);
      const res = await request(app)
        .get(`/artworks/check-exists?checksum=${fakeChecksum}`)
        .expect(200);

      expect(res.body).to.have.property('exists', false);
      expect(res.body).to.have.property('matchCount', 0);
    });

    it('should return no match for non-existent title+artist', async () => {
      const res = await request(app)
        .get('/artworks/check-exists?title=Nonexistent&artist=Unknown')
        .expect(200);

      expect(res.body).to.have.property('exists', false);
      expect(res.body).to.have.property('matchCount', 0);
    });

    it('should return no match for non-existent tags', async () => {
      const res = await request(app)
        .get('/artworks/check-exists?tags=nonexistent,fake')
        .expect(200);

      expect(res.body).to.have.property('exists', false);
      expect(res.body).to.have.property('matchCount', 0);
    });

    it('should reject request without any criteria', async () => {
      const res = await request(app)
        .get('/artworks/check-exists')
        .expect(400);

      expect(res.body).to.have.property('error');
    });

    it('should reject invalid ID format', async () => {
      const res = await request(app)
        .get('/artworks/check-exists?id=invalid-id')
        .expect(400);

      expect(res.body).to.have.property('error');
    });

    it('should reject invalid checksum format', async () => {
      const res = await request(app)
        .get('/artworks/check-exists?checksum=invalid')
        .expect(400);

      expect(res.body).to.have.property('error');
    });

    it('should handle multiple criteria with OR logic', async () => {
      // Search with checksum from artwork1 OR title+artist from artwork2
      const res = await request(app)
        .get(`/artworks/check-exists?checksum=${testChecksum1}&title=The Last Supper&artist=Leonardo da Vinci`)
        .expect(200);

      expect(res.body).to.have.property('exists', true);
      // Should match both artworks: one by checksum, one by title+artist
      expect(res.body.matchCount).to.equal(2);
    });

    it('should handle title without artist (should not match)', async () => {
      const res = await request(app)
        .get('/artworks/check-exists?title=Mona Lisa')
        .expect(400);

      // Title alone is not sufficient, needs artist too
      expect(res.body).to.have.property('error');
    });

    it('should handle artist without title (should not match)', async () => {
      const res = await request(app)
        .get('/artworks/check-exists?artist=Leonardo da Vinci')
        .expect(400);

      // Artist alone is not sufficient, needs title too
      expect(res.body).to.have.property('error');
    });

    it('should handle empty tags string', async () => {
      const res = await request(app)
        .get('/artworks/check-exists?tags=')
        .expect(400);

      // Empty tags should be rejected
      expect(res.body).to.have.property('error');
    });

    it('should return all matching fields in response', async () => {
      const res = await request(app)
        .get(`/artworks/check-exists?id=${testArtworkId1}`)
        .expect(200);

      const match = res.body.matches[0];
      expect(match).to.have.property('_id');
      expect(match).to.have.property('title');
      expect(match).to.have.property('artist');
      expect(match).to.have.property('checksum');
      expect(match).to.have.property('tags');
      expect(match).to.have.property('uploadedAt');
      expect(match).to.have.property('createdAt');
    });
  });
});
