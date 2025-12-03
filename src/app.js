const express = require('express');
const helmet = require('helmet');
const pinoHttp = require('pino-http');

const authAvailabilityRouter = require('./routes/auth.routes');
const sessionRouter = require('./routes/session.routes');
const artworksRouter = require('./routes/artworks.routes');
const similarityRouter = require('./routes/similarity.routes');
const tokensRouter = require('./routes/tokens.routes');
const { healthCheck } = require('./controllers/health.controller');
const { notFound, errorHandler } = require('./middlewares/errorHandler');
const { generalLimiter } = require('./middlewares/rateLimit');
const logger = require('./config/logger');

async function createApp(auth) {
  const { toNodeHandler } = await import('better-auth/node');
  const app = express();
  app.set('trust proxy', 1);
  app.use(pinoHttp({ logger }));
  app.use(helmet());
  app.use(generalLimiter);

  // Custom routes before Better Auth wildcard
  app.use('/auth/check-availability', authAvailabilityRouter);
  app.use('/auth', sessionRouter);

  // Mount Better Auth before JSON parsing - handles all /auth/* routes
  if (auth) {
    // Mount Better Auth at /auth path using app.use for proper middleware handling
    // Better Auth is configured with basePath: '/auth' and will handle OAuth flows
    app.use('/auth', toNodeHandler(auth));
  }

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', healthCheck);

  app.use('/tokens', tokensRouter);
  app.use('/artworks', artworksRouter);
  app.use('/artworks', similarityRouter);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
