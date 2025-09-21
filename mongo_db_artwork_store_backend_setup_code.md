# MongoDB Artwork Store – Backend Setup & Code

This guide gives you a production-ready baseline for storing **large amounts of artwork images** with **MongoDB + GridFS**, with compressed storage (WiredTiger), searchable JSON metadata, and fast streaming read/write endpoints.

---

## 1) MongoDB server configuration (compression & basics)

Create/update `mongod.conf` (or Atlas cluster parameters) to favor compact on-disk storage:

```yaml
# mongod.conf
storage:
  wiredTiger:
    engineConfig:
      # Tune per your memory budget
      cacheSizeGB: 4
    collectionConfig:
      # Use zstd for higher compression ratio; if unavailable on your build, fallback to snappy
      blockCompressor: zstd
net:
  bindIp: 0.0.0.0
  port: 27017
processManagement:
  fork: false
systemLog:
  destination: file
  path: /var/log/mongodb/mongod.log
  logAppend: true
```

> Note: The compressor setting applies to **new** collections created after this change. We create the GridFS buckets after starting mongod so they inherit `zstd`.

---

## 2) MongoDB collections, GridFS buckets & indexes

We’ll store binaries in GridFS buckets and JSON metadata in a regular collection.

```js
// Bucket names
//   - artworks: original uploads
//   - artwork_variants: web-friendly derivatives (webp) + thumbnails
// Metadata collection: artworks_meta

// Required GridFS indexes (driver creates these automatically, but safe to ensure):
// db.artworks.chunks.createIndex({ files_id: 1, n: 1 }, { unique: true })
// db.artworks.files.createIndex({ filename: 1, uploadDate: 1 })

// Suggested metadata indexes:
// db.artworks_meta.createIndex({ artist: 1, createdAt: -1 })
// db.artworks_meta.createIndex({ tags: 1 })
// db.artworks_meta.createIndex({ title: "text", description: "text" })
// db.artworks_meta.createIndex({ "formats.original": 1 })
```

### Metadata document shape

```json
{
  "_id": "ObjectId",
  "title": "The Docks at Dawn",
  "artist": "A. Painter",
  "tags": ["harbor", "sunrise"],
  "description": "Oil on canvas scanned at 8K.",
  "createdAt": "2025-09-19T12:34:56.000Z",
  "width": 7680,
  "height": 4320,
  "mimeType": "image/jpeg",
  "bytes": 12345678,
  "checksum": "sha256:...",
  "formats": {
    "original": "ObjectId of GridFS file in 'artworks'",
    "webp": "ObjectId of GridFS file in 'artwork_variants'",
    "thumbnail": "ObjectId of GridFS file in 'artwork_variants'"
  }
}
```

---

## 3) Node.js/Express backend (streaming, variants, search)

**Install deps**

```bash
npm i express mongodb multer sharp dotenv
```

> For TypeScript: add `@types/express @types/multer` and convert to ESM if you prefer.

**.env**

```env
MONGODB_URI=mongodb://localhost:27017
DB_NAME=artgallery
PORT=3000
```

**server.js**

```js
// server.js
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const { MongoClient, GridFSBucket, ObjectId } = require('mongodb');

const app = express();
app.use(express.json());

// ---- Mongo connection ----
const client = new MongoClient(process.env.MONGODB_URI, {
  maxPoolSize: 50,
});
let db, bucketOriginal, bucketVariants, meta;

async function initMongo() {
  await client.connect();
  db = client.db(process.env.DB_NAME || 'artgallery');

  // 1MB chunks -> better throughput for large images
  bucketOriginal = new GridFSBucket(db, { bucketName: 'artworks', chunkSizeBytes: 1024 * 1024 });
  bucketVariants = new GridFSBucket(db, { bucketName: 'artwork_variants', chunkSizeBytes: 1024 * 1024 });
  meta = db.collection('artworks_meta');

  // Ensure helpful indexes
  await Promise.all([
    db.collection('artworks.chunks').createIndex({ files_id: 1, n: 1 }, { unique: true }).catch(() => {}),
    db.collection('artworks.files').createIndex({ filename: 1, uploadDate: 1 }).catch(() => {}),
    meta.createIndex({ artist: 1, createdAt: -1 }),
    meta.createIndex({ tags: 1 }),
    meta.createIndex({ title: 'text', description: 'text' }),
    meta.createIndex({ 'formats.original': 1 }),
  ]);

  console.log('Mongo initialized');
}

// ---- Upload middleware (disk temp to avoid buffering huge files in RAM) ----
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, os.tmpdir()),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 1024 * 1024 * 200 }, // 200MB safety limit; adjust as needed
  fileFilter: (req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) return cb(new Error('Only image/* files are allowed'));
    cb(null, true);
  },
});

// ---- Helpers ----
async function computeSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const rs = fs.createReadStream(filePath);
    rs.on('error', reject);
    rs.on('data', (chunk) => hash.update(chunk));
    rs.on('end', () => resolve(`sha256:${hash.digest('hex')}`));
  });
}

async function uploadToGridFS({ filePath, filename, contentType, bucket, metadata }) {
  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, { contentType, metadata });
    fs.createReadStream(filePath)
      .on('error', reject)
      .pipe(uploadStream)
      .on('error', reject)
      .on('finish', () => resolve(uploadStream.id));
  });
}

async function streamSharpToGridFS({ inputStream, filename, contentType, bucket, sharpPipeline, metadata }) {
  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, { contentType, metadata });
    inputStream
      .pipe(sharpPipeline)
      .on('error', reject)
      .pipe(uploadStream)
      .on('error', reject)
      .on('finish', () => resolve(uploadStream.id));
  });
}

// ---- Routes ----

// Create an artwork (upload + variants + metadata)
app.post('/artworks', upload.single('image'), async (req, res) => {
  try {
    const { title, artist, description, tags } = req.body;
    const tagList = (tags || '').split(',').map((t) => t.trim()).filter(Boolean);

    // Basic image probe
    const img = sharp(req.file.path);
    const metaInfo = await img.metadata();

    // Upload original to GridFS
    const originalId = await uploadToGridFS({
      filePath: req.file.path,
      filename: req.file.originalname,
      contentType: req.file.mimetype,
      bucket: bucketOriginal,
      metadata: { title, artist, tags: tagList },
    });

    // Generate variants by streaming from disk (fast path).
    const baseName = path.parse(req.file.originalname).name;

    // Web-friendly version (lossy but small). Choose WebP here; you could switch to AVIF.
    const webpId = await streamSharpToGridFS({
      inputStream: fs.createReadStream(req.file.path),
      filename: `${baseName}.webp`,
      contentType: 'image/webp',
      bucket: bucketVariants,
      sharpPipeline: sharp().webp({ quality: 82 }),
      metadata: { variantOf: originalId, variant: 'webp' },
    });

    // Thumbnail (max 512px on longest side)
    const thumbId = await streamSharpToGridFS({
      inputStream: fs.createReadStream(req.file.path),
      filename: `${baseName}.thumb.webp`,
      contentType: 'image/webp',
      bucket: bucketVariants,
      sharpPipeline: sharp().resize({ width: 512, height: 512, fit: 'inside' }).webp({ quality: 80 }),
      metadata: { variantOf: originalId, variant: 'thumbnail' },
    });

    // Compute checksum for dedupe/integrity
    const checksum = await computeSha256(req.file.path);

    // Persist JSON metadata
    const doc = {
      title,
      artist,
      description,
      tags: tagList,
      createdAt: new Date(),
      width: metaInfo.width || null,
      height: metaInfo.height || null,
      mimeType: req.file.mimetype,
      bytes: req.file.size,
      checksum,
      formats: { original: originalId, webp: webpId, thumbnail: thumbId },
    };

    const insert = await meta.insertOne(doc);

    // Cleanup temp file
    fs.unlink(req.file.path, () => {});

    res.status(201).json({
      id: insert.insertedId,
      files: { original: originalId, webp: webpId, thumbnail: thumbId },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// Stream an image by artwork id & variant
app.get('/artworks/:id', async (req, res) => {
  try {
    const variant = (req.query.variant || 'original').toString();
    const doc = await meta.findOne({ _id: new ObjectId(req.params.id) });
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const map = {
      original: { bucket: bucketOriginal, id: doc.formats.original, type: doc.mimeType },
      webp: { bucket: bucketVariants, id: doc.formats.webp, type: 'image/webp' },
      thumbnail: { bucket: bucketVariants, id: doc.formats.thumbnail, type: 'image/webp' },
    };

    const sel = map[variant];
    if (!sel || !sel.id) return res.status(404).json({ error: 'Variant not available' });

    res.setHeader('Content-Type', sel.type);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('ETag', `${doc._id}-${variant}`);

    const dl = sel.bucket.openDownloadStream(new ObjectId(sel.id));
    dl.on('error', () => res.status(404).end());
    dl.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Artwork metadata
app.get('/artworks/:id/metadata', async (req, res) => {
  try {
    const doc = await meta.findOne({ _id: new ObjectId(req.params.id) });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Simple search API (by artist/tags/text)
app.get('/artworks', async (req, res) => {
  try {
    const { artist, tags, q, limit = 20, skip = 0 } = req.query;
    const filter = {};
    if (artist) filter.artist = artist.toString();
    if (tags) filter.tags = { $all: tags.toString().split(',').map((t) => t.trim()).filter(Boolean) };
    if (q) filter.$text = { $search: q.toString() };
    const result = await meta.find(filter).sort({ createdAt: -1 }).skip(+skip).limit(Math.min(+limit, 100)).toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// Start server
initMongo().then(() => {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`API listening on :${port}`));
});
```

---

## 4) Curl quickstart

```bash
# Upload
curl -F "image=@/path/to/image.jpg" \
     -F "title=Seaside" -F "artist=J.Doe" -F "tags=sea,blue" \
     -F "description=Shot on film" \
     http://localhost:3000/artworks

# Stream original
curl -L "http://localhost:3000/artworks/<ARTWORK_ID>?variant=original" -o out.jpg

# Stream thumbnail
curl -L "http://localhost:3000/artworks/<ARTWORK_ID>?variant=thumbnail" -o thumb.webp

# Get metadata
curl http://localhost:3000/artworks/<ARTWORK_ID>/metadata

# Search
curl "http://localhost:3000/artworks?artist=J.Doe&tags=sea,blue"
```

---

## 5) Notes & scaling tips

- **Compression:** PNG/JPEG are already compressed; we keep originals as-is. WiredTiger `zstd` further compresses GridFS chunks, especially helpful for RAW/TIFF.
- **Chunk size:** We use **1MB** GridFS chunks for better throughput; adjust for your I/O profile.
- **Derivatives:** We generate **WebP** + **thumbnail** for web delivery. Consider also **AVIF** for smaller sizes.
- **CDN:** You can front the `/artworks/:id` endpoints with a CDN; ETag + long `Cache-Control` are set.
- **Sharding later:** Start unsharded. When scaling out, shard **`artworks.chunks`** and **`artworks.files`** appropriately and use `_id`/`files_id` aligned keys. Keep `artworks_meta` shard key aligned with your query pattern (e.g., `{ artist: 1, createdAt: -1 }`).
- **Backups:** Use filesystem snapshots or Atlas backups. Checksums enable integrity checks/dedup ideas.
- **Security:** Add auth, size limits, and extension/mime allowlists; validate `ObjectId`s; set request timeouts.

---

You now have a solid, efficient baseline for storing and reading massive amounts of artwork in MongoDB with compressed storage and fast streaming endpoints. Adjust knobs (chunk size, compression, variants) to match your traffic and image types.

