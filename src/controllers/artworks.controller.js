const {
  createArtwork,
  getArtworkById,
  searchArtworks,
  getArtworksByIds,
  checkArtworkExists,
} = require('../services/artwork.service');
const {
  getOriginalBucket,
  getProtectedBucket,
  getMaskBucket,
  downloadStreamFromBucket,
} = require('../storage/gridfs');

const bucketSelectors = {
  originals: getOriginalBucket,
  protected: getProtectedBucket,
  masks: getMaskBucket,
};

function pickSingleFile(files, field) {
  const entries = files?.[field];
  if (!entries || entries.length === 0) {
    const err = new Error(`Missing required file field '${field}'`);
    err.status = 400;
    throw err;
  }
  if (entries.length > 1) {
    const err = new Error(`Multiple files provided for field '${field}'`);
    err.status = 400;
    throw err;
  }
  return entries[0];
}

function parseJsonFile(file, fieldName) {
  try {
    return JSON.parse(file.buffer.toString('utf8'));
  } catch (error) {
    const err = new Error(`Invalid JSON payload for '${fieldName}'`);
    err.status = 400;
    throw err;
  }
}

function parseHashes(hashesString) {
  if (!hashesString) return undefined;
  if (typeof hashesString === 'object') return hashesString;
  try {
    return JSON.parse(hashesString);
  } catch (error) {
    const err = new Error('hashes must be valid JSON');
    err.status = 400;
    throw err;
  }
}

async function uploadArtwork(req, res, next) {
  try {
    const originalFile = pickSingleFile(req.files, 'original');
    const protectedFile = pickSingleFile(req.files, 'protected');
    const maskFile = pickSingleFile(req.files, 'mask');
    const analysisFile = pickSingleFile(req.files, 'analysis');
    const summaryFile = pickSingleFile(req.files, 'summary');

    // Parse hashes from body if provided
    const body = { ...req.body };
    if (body.hashes) {
      body.hashes = parseHashes(body.hashes);
    }

    const document = await createArtwork({
      originalFile,
      protectedFile,
      maskFile,
      analysisJson: parseJsonFile(analysisFile, 'analysis'),
      summaryJson: parseJsonFile(summaryFile, 'summary'),
      body,
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

  // Validate variant name format
  const validVariants = ['original', 'protected', 'mask'];
  if (!validVariants.includes(variant)) {
    return res.status(404).json({ error: 'Variant not available' });
  }

  try {
    const doc = await getArtworkById(id);
    if (!doc) {
      return res.status(404).json({ error: 'Artwork not found' });
    }

    const format = doc.formats?.[variant];
    if (!format || !format.fileId) {
      return res.status(404).json({ error: 'Variant not available' });
    }

    const bucketResolver = format.bucket ? bucketSelectors[format.bucket] : bucketSelectors[variant];
    if (!bucketResolver) {
      return res.status(404).json({ error: 'Variant not accessible' });
    }

    const bucket = bucketResolver();
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('ETag', `${doc._id}-${variant}`);
    res.setHeader('Content-Type', format.contentType || 'application/octet-stream');

    const stream = downloadStreamFromBucket(bucket, format.fileId);
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
    res.json(results);
  } catch (error) {
    req.log.error({ err: error, query: req.query }, 'Failed to search artworks');
    next(error);
  }
}

async function getArtworkVariants(req, res, next) {
  const { id } = req.params;

  try {
    const doc = await getArtworkById(id);
    if (!doc) {
      return res.status(404).json({ error: 'Artwork not found' });
    }

    const variants = {};
    for (const [key, format] of Object.entries(doc.formats || {})) {
      variants[key] = {
        available: true,
        contentType: format.contentType,
        size: format.bytes,
        checksum: format.checksum,
        url: `/artworks/${id}?variant=${key}`,
      };
    }

    res.json({
      id: doc._id,
      title: doc.title,
      variants,
    });
  } catch (error) {
    req.log.error({ err: error, artworkId: id }, 'Failed to get artwork variants');
    next(error);
  }
}

async function getBatchArtworks(req, res, next) {
  try {
    const { ids, fields } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'IDs array is required' });
    }

    if (ids.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 IDs allowed per request' });
    }

    const artworks = await getArtworksByIds(ids, fields);
    res.json({ artworks });
  } catch (error) {
    req.log.error({ err: error }, 'Failed to get batch artworks');
    next(error);
  }
}

async function getArtworkDownloadUrl(req, res, next) {
  const { id } = req.params;
  const variant = (req.query.variant || 'original').toString();
  const expiresIn = parseInt(req.query.expires) || 3600;

  // Validate variant name format
  const validVariants = ['original', 'protected', 'mask_hi', 'mask_lo'];
  if (!validVariants.includes(variant)) {
    return res.status(404).json({ error: 'Variant not available' });
  }

  try {
    const doc = await getArtworkById(id);
    if (!doc) {
      return res.status(404).json({ error: 'Artwork not found' });
    }

    const format = doc.formats?.[variant];
    if (!format || !format.fileId) {
      return res.status(404).json({ error: 'Variant not available' });
    }

    const downloadUrl = `${req.protocol}://${req.get('host')}/artworks/${id}/download?variant=${variant}`;
    const directUrl = `${req.protocol}://${req.get('host')}/artworks/${id}?variant=${variant}`;

    res.json({
      downloadUrl,
      directUrl,
      variant,
      contentType: format.contentType,
      size: format.bytes,
      checksum: format.checksum,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    });
  } catch (error) {
    req.log.error({ err: error, artworkId: id }, 'Failed to generate download URL');
    next(error);
  }
}

async function downloadArtwork(req, res, next) {
  const { id } = req.params;
  const variant = (req.query.variant || 'original').toString();

  // Validate variant name format
  const validVariants = ['original', 'protected', 'mask'];
  if (!validVariants.includes(variant)) {
    return res.status(404).json({ error: 'Variant not available' });
  }

  try {
    const doc = await getArtworkById(id);
    if (!doc) {
      return res.status(404).json({ error: 'Artwork not found' });
    }

    const format = doc.formats?.[variant];
    if (!format || !format.fileId) {
      return res.status(404).json({ error: 'Variant not available' });
    }

    const bucketResolver = format.bucket ? bucketSelectors[format.bucket] : bucketSelectors[variant];
    if (!bucketResolver) {
      return res.status(404).json({ error: 'Variant not accessible' });
    }

    const bucket = bucketResolver();
    const filename = `${doc.title || 'artwork'}-${variant}.${format.contentType.split('/')[1]}`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', format.contentType || 'application/octet-stream');
    res.setHeader('Content-Length', format.size || 0);

    const stream = downloadStreamFromBucket(bucket, format.fileId);
    stream.on('error', (err) => {
      req.log.error({ err, artworkId: id, variant }, 'Error downloading file');
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download file' });
      }
    });
    stream.pipe(res);
  } catch (error) {
    req.log.error({ err: error, artworkId: id }, 'Failed to download artwork');
    next(error);
  }
}

async function checkExists(req, res, next) {
  try {
    const { id, checksum, title, artist, tags } = req.query;

    const result = await checkArtworkExists({
      id,
      checksum,
      title,
      artist,
      tags,
    });

    res.json(result);
  } catch (error) {
    req.log.error({ err: error, query: req.query }, 'Failed to check artwork existence');
    next(error);
  }
}

async function getMask(req, res, next) {
  const { id } = req.params;
  const variant = 'mask';

  try {
    const doc = await getArtworkById(id);
    if (!doc) {
      return res.status(404).json({ error: 'Artwork not found' });
    }

    const format = doc.formats?.[variant];
    if (!format || !format.fileId) {
      return res.status(404).json({ error: 'Mask not available' });
    }

    const bucket = getMaskBucket();
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('ETag', `${doc._id}-${variant}`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${doc.title || 'artwork'}-mask.sac"`);

    const stream = downloadStreamFromBucket(bucket, format.fileId);
    stream.on('error', (err) => {
      req.log.error({ err, artworkId: id }, 'Error streaming mask file');
      if (!res.headersSent) {
        res.status(404).end();
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  } catch (error) {
    req.log.error({ err: error, artworkId: id }, 'Failed to stream mask');
    next(error);
  }
}

module.exports = {
  uploadArtwork,
  getArtworkStream,
  getArtworkMetadata,
  search,
  getArtworkVariants,
  getBatchArtworks,
  getArtworkDownloadUrl,
  downloadArtwork,
  checkExists,
  getMask,
};
