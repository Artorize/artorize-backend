const express = require('express');
const artworksRouter = require('./routes/artworks.routes');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.use('/artworks', artworksRouter);
app.use(notFound);
app.use(errorHandler);

module.exports = app;