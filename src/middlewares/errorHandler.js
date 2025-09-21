const multer = require('multer');
const logger = require('../config/logger');

function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const log = req && req.log ? req.log : logger;

  if (err instanceof multer.MulterError) {
    log.warn({ err }, 'Multer validation error');
    return res.status(400).json({ error: err.message });
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  log.error({ err, status }, 'Request failed');
  return res.status(status).json({ error: message });
}

module.exports = {
  notFound,
  errorHandler,
};

