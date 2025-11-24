const express = require('express');
const {
  generateToken,
  deleteToken,
  getStats,
} = require('../controllers/tokens.controller');
const { validateRequest } = require('../middlewares/validateRequest');
const { requireInternalAuth } = require('../middlewares/internalAuth');
const {
  generateTokenSchema,
  revokeTokenSchema,
} = require('../validators/token.validators');

const router = express.Router();

// Token management endpoints - require internal service authentication
// Only the router (trusted internal service) can generate/manage tokens
router.post('/', requireInternalAuth(), validateRequest(generateTokenSchema), generateToken);
router.delete('/:token', requireInternalAuth(), validateRequest(revokeTokenSchema), deleteToken);
router.get('/stats', requireInternalAuth(), getStats);

module.exports = router;
