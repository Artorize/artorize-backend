const express = require('express');
const multer = require('multer');
const {
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
} = require('../controllers/artworks.controller');
const { uploadLimiter } = require('../middlewares/rateLimit');
const { validateRequest } = require('../middlewares/validateRequest');
const { authenticate } = require('../middlewares/auth');
const {
  uploadArtworkSchema,
  artworkStreamSchema,
  artworkMetadataSchema,
  artworkSearchSchema,
  batchArtworksSchema,
  downloadUrlSchema,
  checkExistsSchema,
  maskSchema,
} = require('../validators/artwork.validators');

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
]);

const FILE_RULES = {
  original: {
    mimeTypes: ALLOWED_IMAGE_TYPES,
    label: 'original image',
  },
  protected: {
    mimeTypes: ALLOWED_IMAGE_TYPES,
    label: 'protected image',
  },
  mask: {
    mimeTypes: new Set(['application/octet-stream']),
    label: 'mask asset (SAC v1)',
  },
  analysis: {
    mimeTypes: new Set(['application/json']),
    label: 'analysis JSON document',
  },
  summary: {
    mimeTypes: new Set(['application/json']),
    label: 'summary JSON document',
  },
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 256 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const rule = FILE_RULES[file.fieldname];
    if (!rule) {
      return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
    }
    if (!rule.mimeTypes.has(file.mimetype)) {
      const err = new Error(`Invalid file type for ${rule.label}`);
      err.status = 400;
      return cb(err);
    }
    return cb(null, true);
  },
});

const router = express.Router();

const uploadFields = upload.fields([
  { name: 'original', maxCount: 1 },
  { name: 'protected', maxCount: 1 },
  { name: 'mask', maxCount: 1 },
  { name: 'analysis', maxCount: 1 },
  { name: 'summary', maxCount: 1 },
]);

// Upload endpoint (requires authentication)
router.post(
  '/',
  uploadLimiter,
  authenticate({ consume: true }),
  uploadFields,
  validateRequest(uploadArtworkSchema),
  uploadArtwork,
);

// Read endpoints
router.get('/', validateRequest(artworkSearchSchema), search);
router.get('/check-exists', validateRequest(checkExistsSchema), checkExists);
router.post('/batch', validateRequest(batchArtworksSchema), getBatchArtworks);
router.get(
  '/:id',
  validateRequest(artworkStreamSchema),
  getArtworkStream,
);
router.get(
  '/:id/metadata',
  validateRequest(artworkMetadataSchema),
  getArtworkMetadata,
);
router.get(
  '/:id/variants',
  validateRequest(artworkMetadataSchema),
  getArtworkVariants,
);
router.get(
  '/:id/mask',
  validateRequest(maskSchema),
  getMask,
);
router.get(
  '/:id/download-url',
  validateRequest(downloadUrlSchema),
  getArtworkDownloadUrl,
);
router.get(
  '/:id/download',
  validateRequest(artworkStreamSchema),
  downloadArtwork,
);

module.exports = router;
