const express = require('express');
const {
  generateToken,
  deleteToken,
  getStats,
} = require('../controllers/tokens.controller');
const { validateRequest } = require('../middlewares/validateRequest');
const {
  generateTokenSchema,
  revokeTokenSchema,
} = require('../validators/token.validators');

const router = express.Router();

// Token management endpoints
router.post('/', validateRequest(generateTokenSchema), generateToken);
router.delete('/:token', validateRequest(revokeTokenSchema), deleteToken);
router.get('/stats', getStats);

module.exports = router;
