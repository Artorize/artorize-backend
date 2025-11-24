const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 12 bytes for GCM
const TAG_LENGTH = 16; // 16 bytes for GCM auth tag
const KEY_LENGTH = 32; // 32 bytes for AES-256

// Cache the decoded key buffer to avoid repeated base64 decoding
let cachedKeyBuffer = null;

/**
 * Get encryption key from environment variable
 * The key is validated at startup by env-secure module
 * @returns {Buffer} 32-byte encryption key
 * @throws {Error} If APP_ENCRYPTION_KEY is not set
 */
function getEncryptionKey() {
  if (cachedKeyBuffer) {
    return cachedKeyBuffer;
  }

  const keyBase64 = process.env.APP_ENCRYPTION_KEY;
  if (!keyBase64) {
    throw new Error('APP_ENCRYPTION_KEY not set. Ensure env-secure is loaded at startup.');
  }

  // Decode and cache the key buffer
  // env-secure has already validated this at startup
  cachedKeyBuffer = Buffer.from(keyBase64, 'base64');
  return cachedKeyBuffer;
}

/**
 * Encrypt data using AES-256-GCM
 * @param {string|Buffer} data - Data to encrypt
 * @returns {string} Base64-encoded string in format: iv:tag:ciphertext
 */
function createCipher(data) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  const encrypted = Buffer.concat([cipher.update(dataBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Format: iv:tag:ciphertext (all base64-encoded)
  const ivBase64 = iv.toString('base64');
  const tagBase64 = tag.toString('base64');
  const encryptedBase64 = encrypted.toString('base64');

  return `${ivBase64}:${tagBase64}:${encryptedBase64}`;
}

/**
 * Decrypt data using AES-256-GCM
 * @param {string} ciphertext - Base64-encoded string in format: iv:tag:ciphertext
 * @returns {string} Decrypted data as UTF-8 string
 * @throws {Error} If decryption fails or format is invalid
 */
function createDecipher(ciphertext) {
  const key = getEncryptionKey();

  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format. Expected format: iv:tag:ciphertext');
  }

  const [ivBase64, tagBase64, encryptedBase64] = parts;

  let iv, tag, encrypted;
  try {
    iv = Buffer.from(ivBase64, 'base64');
    tag = Buffer.from(tagBase64, 'base64');
    encrypted = Buffer.from(encryptedBase64, 'base64');
  } catch (error) {
    throw new Error('Invalid base64 encoding in ciphertext');
  }

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes, got ${iv.length} bytes`);
  }

  if (tag.length !== TAG_LENGTH) {
    throw new Error(`Invalid auth tag length: expected ${TAG_LENGTH} bytes, got ${tag.length} bytes`);
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  try {
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    throw new Error('Decryption failed: authentication tag verification failed or data is corrupted');
  }
}

/**
 * Create deterministic SHA-256 hash of a string
 * Input is normalized (trimmed and lowercased) before hashing
 * @param {string} str - String to hash
 * @returns {string} Hex-encoded SHA-256 hash
 */
function hashDeterministic(str) {
  // Normalize: trim whitespace and convert to lowercase
  const normalized = str.trim().toLowerCase();

  const hash = crypto.createHash('sha256');
  hash.update(normalized, 'utf8');
  return hash.digest('hex');
}

module.exports = {
  createCipher,
  createDecipher,
  hashDeterministic,
};
