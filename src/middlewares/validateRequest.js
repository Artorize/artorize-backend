const { ZodError } = require('zod');
const logger = require('../config/logger');

function validateRequest(schema) {
  return (req, res, next) => {
    try {
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }
      if (schema.params) {
        req.params = schema.params.parse(req.params);
      }
      if (schema.query) {
        req.query = schema.query.parse(req.query);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const responseError = {
          error: 'Validation failed',
          details: error.flatten(),
        };
        const log = req && req.log ? req.log : logger;
        log.warn({ validationIssues: responseError.details }, 'Request validation failed');
        return res.status(400).json(responseError);
      }
      return next(error);
    }
  };
}

module.exports = {
  validateRequest,
};

