const pino = require('pino');

function resolveLogLevel() {
  if (process.env.LOG_LEVEL) {
    return process.env.LOG_LEVEL;
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

const logger = pino({
  level: resolveLogLevel(),
  redact: {
    paths: ['req.headers.authorization'],
    remove: true,
  },
});

module.exports = logger;

