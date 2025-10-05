const pino = require('pino');
const config = require('./env');

const logger = pino({
  level: config.logLevel,
  redact: {
    paths: ['req.headers.authorization'],
    remove: true,
  },
});

module.exports = logger;
