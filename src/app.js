const express = require('express');
const helmet = require('helmet');
const pinoHttp = require('pino-http');

const authAvailabilityRouter = require('./routes/auth.routes');
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

  // Custom availability route before Better Auth wildcard
  app.use('/auth/check-availability', authAvailabilityRouter);

  // Custom OAuth start handler - converts GET /auth/oauth/:provider/start to Better Auth format
  app.get('/auth/oauth/:provider/start', async (req, res, next) => {
    if (!auth) {
      return res.status(503).json({ error: 'Auth not initialized' });
    }

    const { provider } = req.params;
    const validProviders = ['google', 'github'];

    if (!validProviders.includes(provider)) {
      return res.status(400).json({ error: `Invalid OAuth provider: ${provider}` });
    }

    try {
      // Call Better Auth's signInSocial API directly
      const result = await auth.api.signInSocial({
        body: { provider },
        headers: req.headers,
      });

      // If result has a redirect URL, send it
      if (result?.url) {
        // Forward any cookies set by Better Auth (PKCE state, etc.)
        const setCookies = result.headers?.get?.('set-cookie');
        if (setCookies) {
          res.setHeader('set-cookie', setCookies);
        }
        return res.redirect(302, result.url);
      }

      // If result is a Response object (redirect)
      if (result instanceof Response) {
        result.headers.forEach((value, key) => {
          res.setHeader(key, value);
        });
        return res.redirect(result.status, result.headers.get('location') || '/');
      }

      return res.status(500).json({ error: 'OAuth initiation failed' });
    } catch (error) {
      logger.error({ error: error.message, provider }, 'OAuth start failed');
      return res.status(500).json({ error: 'Failed to initiate OAuth flow' });
    }
  });

  // Mount Better Auth before JSON parsing to let it handle body as needed
  if (auth) {
    const authHandler = toNodeHandler(auth);
    const rewriteMap = {
      '/register': '/sign-up/email',
      '/login': '/sign-in/email',
      '/logout': '/sign-out',
      '/me': '/get-session',
      // OAuth routes - map to Better Auth's expected paths
      '/oauth/google/callback': '/callback/google',
      '/oauth/github/callback': '/callback/github',
    };

    // Normalize legacy routes to Better Auth defaults and strip /auth prefix
    app.use('/auth', (req, res, next) => {
      const [pathPart, queryPart] = req.url.split('?');
      const mappedPath = rewriteMap[pathPart] || pathPart;
      const rewritten = `${mappedPath}${queryPart ? `?${queryPart}` : ''}`;
      req.url = rewritten;
      req.originalUrl = rewritten;
      logger.debug({ originalUrl: `/auth${pathPart}`, rewritten }, 'Auth route rewrite');
      return authHandler(req, res, next);
    });
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
