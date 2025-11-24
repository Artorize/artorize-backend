const express = require('express');
const { getDb } = require('../config/mongo');
const { hashDeterministic } = require('../utils/crypto');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { email, username } = req.query;
    const db = getDb();
    const users = db.collection('user');

    let emailAvailable = true;
    let usernameAvailable = true;

    if (email) {
      const emailHash = hashDeterministic(String(email));
      const exists = await users.findOne({ emailHash });
      emailAvailable = !exists;
    }

    if (username) {
      const usernameHash = hashDeterministic(String(username));
      const exists = await users.findOne({ usernameHash });
      usernameAvailable = !exists;
    }

    return res.status(200).json({ emailAvailable, usernameAvailable });
  } catch (error) {
    return res.status(500).json({ error: 'server_error', message: error.message });
  }
});

module.exports = router;
