const express = require('express');
const router = express.Router();
const { getMyCredits, deductCredits, getUsageHistory } = require('../controllers/credits.controller');

router.get('/me', getMyCredits);
router.post('/deduct', deductCredits);
router.get('/usage', getUsageHistory);

module.exports = router;
