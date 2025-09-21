const express = require('express');
const multer = require('multer');
const {
  uploadArtwork,
  getArtworkStream,
  getArtworkMetadata,
  search,
} = require('../controllers/artworks.controller');
const { uploadLimiter } = require('../middlewares/rateLimit');
const { validateRequest } = require('../middlewares/validateRequest');
const {
  uploadArtworkSchema,
  artworkStreamSchema,
  artworkMetadataSchema,
  artworkSearchSchema,
} = require('../validators/artwork.validators');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 40 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (!file || !file.mimetype) {
      return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'image'));
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      const err = new Error('Only JPEG, PNG, WebP, AVIF, or GIF uploads are allowed');
      err.status = 400;
      return cb(err);
    }
    return cb(null, true);
  },
});

const router = express.Router();

router.post(
  '/',
  uploadLimiter,
  upload.single('image'),
  validateRequest(uploadArtworkSchema),
  uploadArtwork,
);
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
router.get('/', validateRequest(artworkSearchSchema), search);

module.exports = router;
