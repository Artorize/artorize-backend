const express = require('express');
const multer = require('multer');
const {
  uploadArtwork,
  getArtworkStream,
  getArtworkMetadata,
  search,
} = require('../controllers/artworks.controller');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 40 * 1024 * 1024,
  },
});

const router = express.Router();

router.post('/', upload.single('image'), uploadArtwork);
router.get('/:id', getArtworkStream);
router.get('/:id/metadata', getArtworkMetadata);
router.get('/', search);

module.exports = router;