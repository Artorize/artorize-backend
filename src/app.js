const express = require('express');
const helmet = require('helmet');
const pinoHttp = require('pino-http');
const artworksRouter = require('./routes/artworks.routes');
const similarityRouter = require('./routes/similarity.routes');
const tokensRouter = require('./routes/tokens.routes');
const { notFound, errorHandler } = require('./middlewares/errorHandler');
const { generalLimiter } = require('./middlewares/rateLimit');
const logger = require('./config/logger');

const app = express();

app.set('trust proxy', 1);
app.use(pinoHttp({ logger }));
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(generalLimiter);

app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.use('/tokens', tokensRouter);
app.use('/artworks', artworksRouter);
app.use('/artworks', similarityRouter);
app.use(notFound);
app.use(errorHandler);

module.exports = app;

