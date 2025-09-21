const path = require('path');
const os = require('os');
const { Readable } = require('stream');
const sharp = require('sharp');
const { ObjectId } = require('mongodb');
const { getDb } = require('../config/mongo');
const {
  getOriginalBucket,
  getVariantsBucket,
  uploadStreamToBucket,
  deleteFileFromBucket,
} = require('../storage/gridfs');
const { sha256FromBuffer } = require('../utils/checksum');

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

async function createArtwork({ fileBuffer, originalName, mimeType, body }) {
  if (!fileBuffer) {
    const err = new Error('Missing file buffer');
    err.status = 400;
    throw err;
  }

  const buffer = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);
  const checksum = sha256FromBuffer(buffer);
  const bytes = buffer.length;
  const originalFilename = originalName || 'upload';
  const baseName = path.parse(originalFilename).name;
  const resolvedMimeType = mimeType || 'application/octet-stream';

  const originalBucket = getOriginalBucket();
  const variantsBucket = getVariantsBucket();

  const baseImage = sharp(buffer, { failOnError: false });

  const [metaInfo, webpBuffer, thumbnailBuffer] = await Promise.all([
    baseImage.clone().metadata(),
    baseImage.clone().webp({ quality: 90 }).toBuffer(),
    baseImage
      .clone()
      .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer(),
  ]);

  const uploadPlan = [
    {
      key: 'original',
      bucket: originalBucket,
      filename: originalFilename,
      contentType: resolvedMimeType,
      data: buffer,
    },
    {
      key: 'webp',
      bucket: variantsBucket,
      filename: `${baseName}.webp`,
      contentType: 'image/webp',
      data: webpBuffer,
    },
    {
      key: 'thumbnail',
      bucket: variantsBucket,
      filename: `${baseName}-thumbnail.webp`,
      contentType: 'image/webp',
      data: thumbnailBuffer,
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
    throw failed.reason || new Error('Failed to upload image');
  }

  const formats = uploadResults.reduce((acc, result, index) => {
    acc[uploadPlan[index].key] = result.value;
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
    mimeType: resolvedMimeType,
    bytes,
    checksum,
    formats,
    extra: parseExtra(body.extra),
    uploadedAt: new Date(),
  };

  if (typeof document.extra === 'undefined') {
    delete document.extra;
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

module.exports = {
  createArtwork,
  getArtworkById,
  searchArtworks,
};
