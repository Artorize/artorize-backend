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
    const startTime = Date.now();
    const requestId = req.id || `oauth-start-${Date.now()}`;

    logger.info(
      {
        requestId,
        provider: req.params.provider,
        host: req.hostname,
        protocol: req.protocol,
        url: req.originalUrl,
        appBaseUrl: process.env.APP_BASE_URL,
        cookies: Object.keys(req.cookies || {}),
      },
      '[OAUTH-START] OAuth start request received'
    );

    if (!auth) {
      logger.error({ requestId }, '[OAUTH-START] Auth not initialized');
      return res.status(503).json({ error: 'Auth not initialized' });
    }

    const { provider } = req.params;
    const validProviders = ['google', 'github'];

    if (!validProviders.includes(provider)) {
      logger.warn({ requestId, provider }, '[OAUTH-START] Invalid provider');
      return res.status(400).json({ error: `Invalid OAuth provider: ${provider}` });
    }

    try {
      logger.info({ requestId, provider }, '[OAUTH-START] Calling Better Auth signInSocial');

      // Call Better Auth's signInSocial API directly
      const result = await auth.api.signInSocial({
        body: { provider },
        headers: req.headers,
      });

      // Log the result
      if (result?.headers) {
        const setCookies = result.headers?.getSetCookie?.() || [];
        logger.info(
          {
            requestId,
            provider,
            hasCookies: setCookies.length > 0,
            cookieNames: setCookies.map(c => c.split('=')[0]),
            redirectUrl: result?.url ? 'present' : 'missing',
            resultType: result instanceof Response ? 'Response' : 'Object'
          },
          '[OAUTH-START] Better Auth response received'
        );
      }

      // If result has a redirect URL, send it
      if (result?.url) {
        // Forward ALL cookies set by Better Auth (PKCE state, nonce, etc.)
        // Must use getSetCookie() to get array of all Set-Cookie headers
        const setCookies = result.headers?.getSetCookie?.() || [];
        logger.info(
          {
            requestId,
            provider,
            setCookieCount: setCookies.length,
            redirectUrl: result.url,
            duration: Date.now() - startTime
          },
          '[OAUTH-START] Redirecting to OAuth provider with cookies'
        );

        for (const cookie of setCookies) {
          res.append('set-cookie', cookie);
        }
        return res.redirect(302, result.url);
      }

      // If result is a Response object (redirect)
      if (result instanceof Response) {
        const setCookies = result.headers.getSetCookie?.() || [];
        logger.info(
          {
            requestId,
            provider,
            setCookieCount: setCookies.length,
            status: result.status,
            duration: Date.now() - startTime
          },
          '[OAUTH-START] Response object redirect'
        );

        // Forward all headers
        for (const cookie of setCookies) {
          res.append('set-cookie', cookie);
        }
        // Forward other headers (excluding set-cookie which we handled above)
        result.headers.forEach((value, key) => {
          if (key.toLowerCase() !== 'set-cookie') {
            res.setHeader(key, value);
          }
        });
        return res.redirect(result.status, result.headers.get('location') || '/');
      }

      logger.error({ requestId, provider, result }, '[OAUTH-START] Unexpected result format');
      return res.status(500).json({ error: 'OAuth initiation failed' });
    } catch (error) {
      logger.error(
        {
          requestId,
          provider,
          error: error.message,
          stack: error.stack,
          duration: Date.now() - startTime
        },
        '[OAUTH-START] OAuth start failed'
      );
      return res.status(500).json({ error: 'Failed to initiate OAuth flow' });
    }
  });

  // Mount Better Auth before JSON parsing - handles all /auth/* routes
  if (auth) {
    // Use Better Auth handler directly - basePath is set to /auth in config
    app.all('/auth/*', toNodeHandler(auth));
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
