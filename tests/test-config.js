const path = require('path');

module.exports = {
  // Test environment settings
  environment: 'test',
  port: 3001,

  // MongoDB settings for testing
  mongo: {
    uri: process.env.MONGO_URI || 'mongodb://localhost:27017',
    dbName: 'artgallery_test',
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'silent',

  // Test file paths
  fixtures: {
    images: path.join(__dirname, 'fixtures', 'images'),
    json: path.join(__dirname, 'fixtures', 'json'),
  },

  // Test timeouts
  timeouts: {
    upload: 30000,
    download: 10000,
    search: 5000,
  },

  // Rate limiting (disabled for tests)
  rateLimiting: {
    enabled: false,
  },

  // File size limits for testing
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB for tests
  },
};