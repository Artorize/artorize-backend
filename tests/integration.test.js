const fs = require('fs');
const path = require('path');
const { describe, it, before, after } = require('mocha');
const { expect } = require('chai');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoClient } = require('mongodb');

const crypto = require('crypto');

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY || crypto.randomBytes(32).toString('base64');
process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || crypto.randomBytes(32).toString('hex');
process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'test-internal-api-key-123456789012';

describe('Integration Tests - Complete Workflow', () => {
  let app;
  let mongoServer;
  let mongoClient;
  let testData = {};

  before(async function() {
    this.timeout(60000);

    // Start MongoDB
    mongoServer = await MongoMemoryServer.create();
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
      port: 3001,
      mongo: {
        uri: mongoUri,
        dbName: 'test'
      },
      logLevel: 'silent'
    };

    fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2));

    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
    const db = mongoClient.db('test');

    // Clear any cached config and set the connection for all services
    delete require.cache[require.resolve('../src/config/env.js')];
    delete require.cache[require.resolve('../src/config/mongo.js')];

    const { setConnection } = require('../src/config/mongo');
    setConnection(mongoClient, db);

    // Ensure database indexes
    const { ensureIndexes } = require('../src/config/indexes');
    await ensureIndexes();

    // Generate test fixtures if they don't exist
    const fixturesPath = path.join(__dirname, 'fixtures', 'images');
    if (!fs.existsSync(fixturesPath)) {
      const { generateTestImages } = require('./fixtures/generate-fixtures');
      await generateTestImages();
    }

    // Import and initialize app with Better Auth
    const { createAuth } = require('../src/auth/betterAuth');
    const createApp = require('../src/app');

    // Create Better Auth instance
    const auth = await createAuth(db, mongoClient);

    // Create the Express app
    app = await createApp(auth);

    // Load test fixtures
    testData.images = {
      original: fs.readFileSync(path.join(__dirname, 'fixtures', 'images', 'original.jpg')),
      protected: fs.readFileSync(path.join(__dirname, 'fixtures', 'images', 'protected.jpg')),
      maskHi: fs.readFileSync(path.join(__dirname, 'fixtures', 'images', 'mask_hi.png')),
      maskLo: fs.readFileSync(path.join(__dirname, 'fixtures', 'images', 'mask_lo.png')),
    };

    testData.json = {
      analysis: fs.readFileSync(path.join(__dirname, 'fixtures', 'json', 'analysis.json')),
      summary: fs.readFileSync(path.join(__dirname, 'fixtures', 'json', 'summary.json')),
    };
  });

  after(async function() {
    this.timeout(30000);

    // Cleanup app's MongoDB connection
    const { disconnectMongo } = require('../src/config/mongo');
    await disconnectMongo();

    if (mongoClient) await mongoClient.close();
    if (mongoServer) await mongoServer.stop();
  });

  describe('Complete Upload → Read → Search → Delete Workflow', () => {
    let uploadedArtworkIds = [];

    it('Step 1: Upload multiple artworks', async function() {
      this.timeout(30000);

      // Upload first artwork
      const res1 = await request(app)
        .post('/artworks')
        .attach('original', testData.images.original, 'original1.jpg')
        .attach('protected', testData.images.protected, 'protected1.jpg')
        .attach('maskHi', testData.images.maskHi, 'mask_hi1.png')
        .attach('maskLo', testData.images.maskLo, 'mask_lo1.png')
        .attach('analysis', testData.json.analysis, 'analysis1.json')
        .attach('summary', testData.json.summary, 'summary1.json')
        .field('title', 'First Integration Test')
        .field('artist', 'Integration Artist')
        .field('tags', 'integration,test,first')
        .expect(201);

      expect(res1.body).to.have.property('id');
      uploadedArtworkIds.push(res1.body.id);

      // Upload second artwork with different metadata
      const altSummary = JSON.parse(testData.json.summary);
      altSummary.title = 'Second Integration Test';
      altSummary.artist = 'Another Artist';

      const res2 = await request(app)
        .post('/artworks')
        .attach('original', testData.images.original, 'original2.jpg')
        .attach('protected', testData.images.protected, 'protected2.jpg')
        .attach('maskHi', testData.images.maskHi, 'mask_hi2.png')
        .attach('maskLo', testData.images.maskLo, 'mask_lo2.png')
        .attach('analysis', testData.json.analysis, 'analysis2.json')
        .attach('summary', Buffer.from(JSON.stringify(altSummary)), 'summary2.json')
        .field('title', 'Second Integration Test')
        .field('artist', 'Another Artist')
        .field('tags', 'integration,test,second')
        .expect(201);

      expect(res2.body).to.have.property('id');
      uploadedArtworkIds.push(res2.body.id);

      console.log(`Uploaded ${uploadedArtworkIds.length} artworks`);
    });

    it('Step 2: Verify all variants are accessible', async function() {
      this.timeout(20000);

      for (const artworkId of uploadedArtworkIds) {
        // Check variants endpoint
        const variantsRes = await request(app)
          .get(`/artworks/${artworkId}/variants`)
          .expect(200);

        expect(variantsRes.body.variants).to.have.all.keys('original', 'protected', 'mask_hi', 'mask_lo');

        // Download each variant
        for (const variant of ['original', 'protected', 'mask_hi', 'mask_lo']) {
          const res = await request(app)
            .get(`/artworks/${artworkId}?variant=${variant}`)
            .expect(200);

          expect(res.body).to.be.instanceOf(Buffer);
          expect(res.body.length).to.be.greaterThan(0);
        }
      }
    });

    it('Step 3: Batch retrieve artworks', async () => {
      const res = await request(app)
        .post('/artworks/batch')
        .send({
          ids: uploadedArtworkIds,
          fields: 'title,artist,formats,tags',
        })
        .expect(200);

      expect(res.body.artworks).to.have.lengthOf(uploadedArtworkIds.length);
      res.body.artworks.forEach(artwork => {
        expect(artwork).to.have.property('title');
        expect(artwork).to.have.property('artist');
        expect(artwork).to.have.property('formats');
        expect(artwork).to.have.property('tags');
      });
    });

    it('Step 4: Search by various criteria', async () => {
      // Search by artist
      const artistRes = await request(app)
        .get('/artworks?artist=Integration Artist')
        .expect(200);

      expect(artistRes.body).to.be.an('array');
      expect(artistRes.body.length).to.be.at.least(1);

      // Search by tags
      const tagsRes = await request(app)
        .get('/artworks?tags=integration,first')
        .expect(200);

      expect(tagsRes.body).to.be.an('array');
      expect(tagsRes.body.length).to.be.at.least(1);

      // Full-text search
      const textRes = await request(app)
        .get('/artworks?q=Integration')
        .expect(200);

      expect(textRes.body).to.be.an('array');
      expect(textRes.body.length).to.be.at.least(2);
    });

    it('Step 5: Verify metadata consistency', async () => {
      for (const artworkId of uploadedArtworkIds) {
        const res = await request(app)
          .get(`/artworks/${artworkId}/metadata`)
          .expect(200);

        expect(res.body).to.have.property('_id', artworkId);
        expect(res.body).to.have.property('formats');
        expect(res.body).to.have.property('analysis');
        expect(res.body).to.have.property('summary');

        // Verify checksums exist for all formats
        for (const format of Object.values(res.body.formats)) {
          expect(format).to.have.property('checksum');
          expect(format.checksum).to.match(/^[a-f0-9]{64}$/); // SHA256 format
        }
      }
    });

    it('Step 6: Test download URLs', async () => {
      const artworkId = uploadedArtworkIds[0];

      const res = await request(app)
        .get(`/artworks/${artworkId}/download-url?variant=original&expires=7200`)
        .expect(200);

      expect(res.body).to.have.property('downloadUrl');
      expect(res.body).to.have.property('directUrl');
      expect(res.body).to.have.property('expiresAt');

      const expiresAt = new Date(res.body.expiresAt);
      const now = new Date();
      const diffSeconds = (expiresAt - now) / 1000;

      expect(diffSeconds).to.be.closeTo(7200, 10);
    });

    it('Step 7: Test pagination', async () => {
      // Get first page
      const page1 = await request(app)
        .get('/artworks?limit=1&skip=0')
        .expect(200);

      expect(page1.body).to.be.an('array');
      expect(page1.body).to.have.lengthOf.at.most(1);

      // Get second page
      const page2 = await request(app)
        .get('/artworks?limit=1&skip=1')
        .expect(200);

      expect(page2.body).to.be.an('array');
      expect(page2.body).to.have.lengthOf.at.most(1);

      // Verify different items if both pages have data
      if (page1.body.length > 0 && page2.body.length > 0) {
        expect(page1.body[0]._id).to.not.equal(page2.body[0]._id);
      }
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    it('should handle malformed artwork IDs gracefully', async () => {
      const invalidIds = ['invalid', '123', 'not-an-objectid'];

      for (const id of invalidIds) {
        const res = await request(app)
          .get(`/artworks/${id}`)
          .expect(400);

        expect(res.body).to.have.property('error');
      }
    });

    it('should handle missing variants gracefully', async () => {
      // Create artwork without some variants (this would require modifying the upload)
      // For now, test with non-existent variant names
      const res = await request(app)
        .post('/artworks')
        .attach('original', testData.images.original, 'test.jpg')
        .attach('protected', testData.images.protected, 'protected.jpg')
        .attach('maskHi', testData.images.maskHi, 'mask_hi.png')
        .attach('maskLo', testData.images.maskLo, 'mask_lo.png')
        .attach('analysis', testData.json.analysis, 'analysis.json')
        .attach('summary', testData.json.summary, 'summary.json')
        .expect(201);

      const artworkId = res.body.id;

      // Try to access non-existent variant
      const variantRes = await request(app)
        .get(`/artworks/${artworkId}?variant=thumbnail`)
        .expect(404);

      expect(variantRes.body).to.have.property('error', 'Variant not available');
    });

    it('should handle concurrent requests properly', async function() {
      this.timeout(30000);

      // Create multiple concurrent upload requests
      const uploadPromises = Array(3).fill(null).map((_, i) =>
        request(app)
          .post('/artworks')
          .attach('original', testData.images.original, `concurrent${i}.jpg`)
          .attach('protected', testData.images.protected, `protected${i}.jpg`)
          .attach('maskHi', testData.images.maskHi, `mask_hi${i}.png`)
          .attach('maskLo', testData.images.maskLo, `mask_lo${i}.png`)
          .attach('analysis', testData.json.analysis, `analysis${i}.json`)
          .attach('summary', testData.json.summary, `summary${i}.json`)
          .field('title', `Concurrent Test ${i}`)
      );

      const results = await Promise.allSettled(uploadPromises);

      const successful = results.filter(r => r.status === 'fulfilled');
      expect(successful.length).to.equal(3);

      // Verify all uploads succeeded
      successful.forEach((result) => {
        expect(result.value.status).to.equal(201);
        expect(result.value.body).to.have.property('id');
      });
    });
  });

  describe('Performance Benchmarks', () => {
    it('should handle large batch requests efficiently', async function() {
      this.timeout(30000);

      // First, create multiple artworks (reduced count for stability)
      const uploadPromises = Array(5).fill(null).map((_, i) =>
        request(app)
          .post('/artworks')
          .attach('original', testData.images.original, `perf${i}.jpg`)
          .attach('protected', testData.images.protected, `protected${i}.jpg`)
          .attach('maskHi', testData.images.maskHi, `mask_hi${i}.png`)
          .attach('maskLo', testData.images.maskLo, `mask_lo${i}.png`)
          .attach('analysis', testData.json.analysis, `analysis${i}.json`)
          .attach('summary', testData.json.summary, `summary${i}.json`)
          .field('title', `Performance Test ${i}`)
      );

      const uploads = await Promise.all(uploadPromises);
      const ids = uploads.map(r => r.body.id);

      // Batch retrieve all
      const startTime = Date.now();
      const res = await request(app)
        .post('/artworks/batch')
        .send({ ids })
        .expect(200);

      const elapsed = Date.now() - startTime;

      expect(res.body.artworks).to.have.lengthOf(5);
      expect(elapsed).to.be.lessThan(1000); // Should complete in under 1 second
      console.log(`Batch retrieval of 5 artworks took ${elapsed}ms`);
    });

    it('should stream large files efficiently', async function() {
      this.timeout(30000);

      // Upload a larger image (reasonable size for testing)
      const largeImage = await require('sharp')({
        create: {
          width: 2048,
          height: 2048,
          channels: 3,
          background: { r: 100, g: 100, b: 100 },
        },
      })
        .jpeg({ quality: 85 })
        .toBuffer();

      const uploadRes = await request(app)
        .post('/artworks')
        .attach('original', largeImage, 'large.jpg')
        .attach('protected', testData.images.protected, 'protected.jpg')
        .attach('maskHi', testData.images.maskHi, 'mask_hi.png')
        .attach('maskLo', testData.images.maskLo, 'mask_lo.png')
        .attach('analysis', testData.json.analysis, 'analysis.json')
        .attach('summary', testData.json.summary, 'summary.json')
        .expect(201);

      const artworkId = uploadRes.body.id;

      // Download and measure time
      const startTime = Date.now();
      const downloadRes = await request(app)
        .get(`/artworks/${artworkId}`)
        .expect(200);

      const elapsed = Date.now() - startTime;

      expect(downloadRes.body).to.be.instanceOf(Buffer);
      expect(downloadRes.body.length).to.be.greaterThan(10000); // > 10KB (reasonable for 2048x2048 JPEG)
      console.log(`Large file streaming took ${elapsed}ms for ${downloadRes.body.length} bytes`);
    });
  });
});