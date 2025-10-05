const os = require('os');
const { Readable } = require('stream');
const sharp = require('sharp');
const { ObjectId } = require('mongodb');
const { getDb } = require('../config/mongo');
const {
  getOriginalBucket,
  getProtectedBucket,
  getMaskBucket,
  uploadStreamToBucket,
  deleteFileFromBucket,
} = require('../storage/gridfs');
const { sha256FromBuffer } = require('../utils/checksum');
const { processHashesForStorage } = require('./hash-storage.service');
const { parseSAC } = require('./sac-encoder.service');

const cpuCount = typeof os.availableParallelism === 'function'
  ? os.availableParallelism()
  : (Array.isArray(os.cpus()) ? os.cpus().length : 1);
const workerCount = Math.max(1, cpuCount - 1);
sharp.cache(false);
sharp.concurrency(workerCount);

function parseTags(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input.map((tag) => tag.trim()).filter(Boolean);
  return input
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function safeDate(value) {
  if (!value) return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

function parseExtra(extra) {
  if (extra === null || typeof extra === 'object') return extra;
  if (!extra) return undefined;
  try {
    return JSON.parse(extra);
  } catch (error) {
    const err = new Error('extra must be valid JSON');
    err.status = 400;
    throw err;
  }
}

function ensureFilePresence(file, label) {
  if (!file || !file.buffer) {
    const err = new Error(`Missing ${label}`);
    err.status = 400;
    throw err;
  }
}

function resolveFilename(originalName, fallback) {
  return originalName && typeof originalName === 'string' && originalName.trim().length
    ? originalName
    : fallback;
}

async function createArtwork({
  originalFile,
  protectedFile,
  maskHiFile,
  maskLoFile,
  analysisJson,
  summaryJson,
  body = {},
}) {
  ensureFilePresence(originalFile, 'original image');
  ensureFilePresence(protectedFile, 'protected image');
  ensureFilePresence(maskHiFile, 'maskHi file');
  ensureFilePresence(maskLoFile, 'maskLo file');

  const originalBuffer = Buffer.isBuffer(originalFile.buffer)
    ? originalFile.buffer
    : Buffer.from(originalFile.buffer);
  const protectedBuffer = Buffer.isBuffer(protectedFile.buffer)
    ? protectedFile.buffer
    : Buffer.from(protectedFile.buffer);
  const maskHiBuffer = Buffer.isBuffer(maskHiFile.buffer)
    ? maskHiFile.buffer
    : Buffer.from(maskHiFile.buffer);
  const maskLoBuffer = Buffer.isBuffer(maskLoFile.buffer)
    ? maskLoFile.buffer
    : Buffer.from(maskLoFile.buffer);

  // Validate SAC v1 format for masks
  try {
    parseSAC(maskHiBuffer);
  } catch (error) {
    const err = new Error(`Invalid SAC format for maskHi: ${error.message}`);
    err.status = 400;
    throw err;
  }

  try {
    parseSAC(maskLoBuffer);
  } catch (error) {
    const err = new Error(`Invalid SAC format for maskLo: ${error.message}`);
    err.status = 400;
    throw err;
  }

  const originalFilename = resolveFilename(originalFile.originalname, 'original-image');
  const protectedFilename = resolveFilename(protectedFile.originalname, 'protected-image');
  const maskHiFilename = resolveFilename(maskHiFile.originalname, 'mask-hi.sac');
  const maskLoFilename = resolveFilename(maskLoFile.originalname, 'mask-lo.sac');

  const originalMimeType = originalFile.mimetype || 'application/octet-stream';
  const protectedMimeType = protectedFile.mimetype || 'application/octet-stream';
  const maskHiMimeType = 'application/octet-stream'; // SAC v1 format
  const maskLoMimeType = 'application/octet-stream'; // SAC v1 format

  const originalChecksum = sha256FromBuffer(originalBuffer);
  const protectedChecksum = sha256FromBuffer(protectedBuffer);
  const maskHiChecksum = sha256FromBuffer(maskHiBuffer);
  const maskLoChecksum = sha256FromBuffer(maskLoBuffer);

  const baseImage = sharp(originalBuffer, { failOnError: false });
  const metaInfo = await baseImage.metadata();

  const uploadPlan = [
    {
      key: 'original',
      bucket: getOriginalBucket(),
      bucketKey: 'originals',
      filename: originalFilename,
      contentType: originalMimeType,
      data: originalBuffer,
      checksum: originalChecksum,
    },
    {
      key: 'protected',
      bucket: getProtectedBucket(),
      bucketKey: 'protected',
      filename: protectedFilename,
      contentType: protectedMimeType,
      data: protectedBuffer,
      checksum: protectedChecksum,
    },
    // Masks are stored in SAC v1 binary format
    // SAC = Simple Array Container - compact binary protocol for int16 arrays
    {
      key: 'mask_hi',
      bucket: getMaskBucket(),
      bucketKey: 'masks',
      filename: maskHiFilename,
      contentType: maskHiMimeType,
      data: maskHiBuffer,
      checksum: maskHiChecksum,
    },
    {
      key: 'mask_lo',
      bucket: getMaskBucket(),
      bucketKey: 'masks',
      filename: maskLoFilename,
      contentType: maskLoMimeType,
      data: maskLoBuffer,
      checksum: maskLoChecksum,
    },
  ];

  const uploadResults = await Promise.allSettled(
    uploadPlan.map((item) =>
      uploadStreamToBucket(
        item.bucket,
        Readable.from(item.data),
        { filename: item.filename, contentType: item.contentType },
      ),
    ),
  );

  const failed = uploadResults.find((result) => result.status === 'rejected');
  if (failed) {
    await Promise.all(
      uploadResults.map((result, index) =>
        result.status === 'fulfilled'
          ? deleteFileFromBucket(uploadPlan[index].bucket, result.value).catch(() => {})
          : Promise.resolve(),
      ),
    );
    throw failed.reason || new Error('Failed to upload artwork assets');
  }

  const formats = uploadResults.reduce((acc, result, index) => {
    if (result.status !== 'fulfilled') return acc;
    const plan = uploadPlan[index];
    acc[plan.key] = {
      fileId: result.value,
      bucket: plan.bucketKey,
      contentType: plan.contentType,
      filename: plan.filename,
      bytes: plan.data.length,
      checksum: plan.checksum,
    };
    return acc;
  }, {});

  const document = {
    title: body.title || null,
    artist: body.artist || null,
    tags: parseTags(body.tags),
    description: body.description || null,
    createdAt: safeDate(body.createdAt),
    width: metaInfo.width || null,
    height: metaInfo.height || null,
    mimeType: originalMimeType,
    bytes: originalBuffer.length,
    checksum: originalChecksum,
    formats,
    analysis: analysisJson || null,
    summary: summaryJson || null,
    extra: parseExtra(body.extra),
    uploadedAt: new Date(),
  };

  // Process and add hashes if provided
  if (body.hashes) {
    const hashData = processHashesForStorage(body.hashes);
    if (hashData) {
      document.hashes = hashData.hashes;
      document.hash_metadata = hashData.hash_metadata;
    }
  }

  if (typeof document.extra === 'undefined') {
    delete document.extra;
  }
  if (!document.analysis) {
    delete document.analysis;
  }
  if (!document.summary) {
    delete document.summary;
  }

  const db = getDb();
  const metaCollection = db.collection('artworks_meta');
  const result = await metaCollection.insertOne(document);
  document._id = result.insertedId;
  return document;
}

async function getArtworkById(id) {
  const db = getDb();
  return db.collection('artworks_meta').findOne({ _id: new ObjectId(id) });
}

async function searchArtworks({ artist, tags, text, limit = 20, skip = 0 }) {
  const db = getDb();
  const filter = {};
  if (artist) filter.artist = artist;
  if (tags && tags.length) {
    filter.tags = { $all: tags };
  }
  if (text) filter.$text = { $search: text };

  return db
    .collection('artworks_meta')
    .find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Math.min(limit, 100))
    .toArray();
}

async function getArtworksByIds(ids, fields) {
  const db = getDb();
  const collection = db.collection('artworks_meta');

  const objectIds = ids.map(id => {
    try {
      return new ObjectId(id);
    } catch (e) {
      return null;
    }
  }).filter(Boolean);

  const projection = fields ?
    fields.split(',').reduce((acc, field) => {
      acc[field.trim()] = 1;
      return acc;
    }, { _id: 1 }) : {};

  const artworks = await collection.find(
    { _id: { $in: objectIds } },
    { projection }
  ).toArray();

  return artworks;
}

async function getAllVariants(artworkId) {
  const artwork = await getArtworkById(artworkId);
  if (!artwork) return null;

  const variants = {};
  for (const [key, format] of Object.entries(artwork.formats || {})) {
    variants[key] = {
      contentType: format.contentType,
      size: format.size,
      checksum: format.checksum,
      fileId: format.fileId,
      bucket: format.bucket,
    };
  }

  return variants;
}

async function checkArtworkExists({ id, checksum, title, artist, tags }) {
  const db = getDb();
  const collection = db.collection('artworks_meta');

  const queries = [];

  if (id) {
    try {
      queries.push({ _id: new ObjectId(id) });
    } catch (e) {
      // Invalid ObjectId format
    }
  }

  if (checksum) {
    queries.push({ checksum: checksum });
  }

  if (title && artist) {
    queries.push({
      title: title,
      artist: artist
    });
  }

  if (tags && Array.isArray(tags) && tags.length > 0) {
    queries.push({ tags: { $all: tags } });
  }

  if (queries.length === 0) {
    return { exists: false, matches: [] };
  }

  const matches = await collection.find(
    { $or: queries },
    {
      projection: {
        _id: 1,
        title: 1,
        artist: 1,
        checksum: 1,
        tags: 1,
        uploadedAt: 1,
        createdAt: 1
      }
    }
  ).toArray();

  return {
    exists: matches.length > 0,
    matches: matches,
    matchCount: matches.length
  };
}

module.exports = {
  createArtwork,
  getArtworkById,
  searchArtworks,
  getArtworksByIds,
  getAllVariants,
  checkArtworkExists,
};
