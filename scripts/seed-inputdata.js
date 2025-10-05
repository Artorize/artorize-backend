#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const logger = require('../src/config/logger');
const { connectMongo, disconnectMongo, getDb } = require('../src/config/mongo');
const { createArtwork } = require('../src/services/artwork.service');
const { sha256FromBuffer } = require('../src/utils/checksum');

const MIME_LOOKUP = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function findFile(directory, predicate, description) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const match = entries.find((entry) => entry.isFile() && predicate(entry.name.toLowerCase()));
  if (!match) {
    throw new Error(`Missing ${description} in ${directory}`);
  }
  return path.join(directory, match.name);
}

function loadFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimetype = MIME_LOOKUP[ext] || 'application/octet-stream';
  return {
    buffer,
    originalname: path.basename(filePath),
    mimetype,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function humaniseDatasetName(name) {
  return name
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function seedDataset(datasetDir, datasetName) {
  const imagesDir = path.join(datasetDir, 'images');
  const masksDir = path.join(datasetDir, 'masks');

  const originalPath = findFile(
    imagesDir,
    (name) => name.startsWith('original'),
    'original image',
  );
  const protectedPath = findFile(
    imagesDir,
    (name) => name.startsWith('protected'),
    'protected image',
  );
  const maskHiPath = findFile(
    masksDir,
    (name) => name.includes('mask_hi') || name.includes('mask-hi') || name.includes('maskhi'),
    'mask hi PNG',
  );
  const maskLoPath = findFile(
    masksDir,
    (name) => name.includes('mask_lo') || name.includes('mask-lo') || name.includes('masklo'),
    'mask lo PNG',
  );
  const analysisPath = path.join(datasetDir, 'analysis.json');
  const summaryPath = path.join(datasetDir, 'summary.json');

  const originalFile = loadFile(originalPath);
  const protectedFile = loadFile(protectedPath);
  const maskHiFile = loadFile(maskHiPath);
  const maskLoFile = loadFile(maskLoPath);
  const analysisJson = readJson(analysisPath);
  const summaryJson = readJson(summaryPath);

  const checksum = sha256FromBuffer(originalFile.buffer);
  const existing = await getDb()
    .collection('artworks_meta')
    .findOne({ checksum });
  if (existing) {
    logger.info({ dataset: datasetName, artworkId: existing._id }, 'Dataset already present, skipping');
    return;
  }

  const tags = Array.isArray(summaryJson?.projects)
    ? summaryJson.projects
        .filter((project) => project && project.applied)
        .map((project) => project.name)
        .filter(Boolean)
    : [];

  const extra = {
    dataset: datasetName,
    sourceImage: summaryJson?.image || null,
    analysisPath: summaryJson?.analysis || null,
  };
  Object.keys(extra).forEach((key) => {
    if (extra[key] === null || extra[key] === undefined) {
      delete extra[key];
    }
  });
  const bodyExtra = Object.keys(extra).length ? extra : undefined;

  const doc = await createArtwork({
    originalFile,
    protectedFile,
    maskHiFile,
    maskLoFile,
    analysisJson,
    summaryJson,
    body: {
      title: humaniseDatasetName(datasetName),
      tags,
      extra: bodyExtra,
    },
  });

  logger.info({ dataset: datasetName, artworkId: doc._id }, 'Seeded dataset');
}

async function seedAllDatasets() {
  const root = path.resolve(__dirname, '../inputdata');
  if (!fs.existsSync(root)) {
    logger.warn({ root }, 'No inputdata directory found');
    return;
  }

  const entries = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory());

  if (!entries.length) {
    logger.warn({ root }, 'No dataset directories found');
    return;
  }

  for (const entry of entries) {
    const datasetDir = path.join(root, entry.name);
    try {
      await seedDataset(datasetDir, entry.name);
    } catch (error) {
      logger.error({ err: error, dataset: entry.name }, 'Failed to seed dataset');
    }
  }
}

(async () => {
  try {
    await connectMongo();
    await seedAllDatasets();
  } catch (error) {
    logger.error({ err: error }, 'Seeding failed');
    process.exitCode = 1;
  } finally {
    try {
      await disconnectMongo();
    } catch (disconnectError) {
      logger.error({ err: disconnectError }, 'Failed to disconnect from MongoDB');
    }
  }
})();
