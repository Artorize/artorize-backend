const {
  createArtwork,
  getArtworkById,
  searchArtworks,
} = require('../services/artwork.service');
const {
  getOriginalBucket,
  getVariantsBucket,
  downloadStreamFromBucket,
} = require('../storage/gridfs');

async function uploadArtwork(req, res, next) {
  if (!req.file) {
    req.log.warn('Upload attempted without image file');
    return res.status(400).json({ error: 'Missing image upload' });
  }

  if (!req.file.mimetype || !req.file.mimetype.startsWith('image/')) {
    req.log.warn({ mimetype: req.file.mimetype }, 'Upload rejected due to unsupported mime type');
    return res.status(400).json({ error: 'Only image uploads are supported' });
  }

  try {
    const document = await createArtwork({
      fileBuffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      body: req.body,
    });

    res.status(201).json({
      id: document._id,
      formats: document.formats,
    });
  } catch (error) {
    req.log.error({ err: error }, 'Failed to upload artwork');
    next(error);
  }
}

async function getArtworkStream(req, res, next) {
  const { id } = req.params;
  const variant = (req.query.variant || 'original').toString();

  try {
    const doc = await getArtworkById(id);
    if (!doc) {
      return res.status(404).json({ error: 'Artwork not found' });
    }

    const variants = {
      original: {
        bucket: getOriginalBucket(),
        fileId: doc.formats?.original,
        contentType: doc.mimeType,
      },
      webp: {
        bucket: getVariantsBucket(),
        fileId: doc.formats?.webp,
        contentType: 'image/webp',
      },
      thumbnail: {
        bucket: getVariantsBucket(),
        fileId: doc.formats?.thumbnail,
        contentType: 'image/webp',
      },
    };

    const selection = variants[variant];
    if (!selection || !selection.fileId) {
      return res.status(404).json({ error: 'Variant not available' });
    }

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('ETag', `${doc._id}-${variant}`);
    res.setHeader('Content-Type', selection.contentType);

    const stream = downloadStreamFromBucket(selection.bucket, selection.fileId);
    stream.on('error', (err) => {
      req.log.error({ err, artworkId: id, variant }, 'Error streaming file');
      if (!res.headersSent) {
        res.status(404).end();
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  } catch (error) {
    req.log.error({ err: error, artworkId: id }, 'Failed to stream artwork');
    next(error);
  }
}

async function getArtworkMetadata(req, res, next) {
  const { id } = req.params;

  try {
    const doc = await getArtworkById(id);
    if (!doc) {
      return res.status(404).json({ error: 'Artwork not found' });
    }
    res.json(doc);
  } catch (error) {
    req.log.error({ err: error, artworkId: id }, 'Failed to retrieve artwork metadata');
    next(error);
  }
}

async function search(req, res, next) {
  const limit = typeof req.query.limit === 'number' ? req.query.limit : 20;
  const skip = typeof req.query.skip === 'number' ? req.query.skip : 0;
  const tags = Array.isArray(req.query.tags) ? req.query.tags : [];

  try {
    const results = await searchArtworks({
      artist: req.query.artist,
      tags,
      text: req.query.q,
      limit,
      skip,
    });
    res.json({ items: results, count: results.length });
  } catch (error) {
    req.log.error({ err: error, query: req.query }, 'Failed to search artworks');
    next(error);
  }
}

module.exports = {
  uploadArtwork,
  getArtworkStream,
  getArtworkMetadata,
  search,
};

