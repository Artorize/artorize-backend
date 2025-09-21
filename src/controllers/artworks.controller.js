const { ObjectId } = require('mongodb');
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

function validateObjectId(id) {
  return ObjectId.isValid(id);
}

async function uploadArtwork(req, res, next) {
  if (!req.file) {
    return res.status(400).json({ error: 'Missing image upload' });
  }

  if (!req.file.mimetype || !req.file.mimetype.startsWith('image/')) {
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
    next(error);
  }
}

async function getArtworkStream(req, res, next) {
  const { id } = req.params;
  const variant = (req.query.variant || 'original').toString();

  if (!validateObjectId(id)) {
    return res.status(400).json({ error: 'Invalid artwork id' });
  }

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
      console.error('Error streaming file', err);
      if (!res.headersSent) {
        res.status(404).end();
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
}

async function getArtworkMetadata(req, res, next) {
  const { id } = req.params;
  if (!validateObjectId(id)) {
    return res.status(400).json({ error: 'Invalid artwork id' });
  }

  try {
    const doc = await getArtworkById(id);
    if (!doc) {
      return res.status(404).json({ error: 'Artwork not found' });
    }
    res.json(doc);
  } catch (error) {
    next(error);
  }
}

async function search(req, res, next) {
  const limitParam = Number.parseInt(req.query.limit, 10);
  const skipParam = Number.parseInt(req.query.skip, 10);
  const limit = Number.isNaN(limitParam) ? 20 : Math.min(Math.max(limitParam, 1), 100);
  const skip = Number.isNaN(skipParam) ? 0 : Math.max(skipParam, 0);
  const tags = req.query.tags
    ? req.query.tags
        .toString()
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];

  try {
    const results = await searchArtworks({
      artist: req.query.artist ? req.query.artist.toString() : undefined,
      tags,
      text: req.query.q ? req.query.q.toString() : undefined,
      limit,
      skip,
    });
    res.json({ items: results, count: results.length });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  uploadArtwork,
  getArtworkStream,
  getArtworkMetadata,
  search,
};