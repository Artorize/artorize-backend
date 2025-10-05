/**
 * Hash Storage Service
 * Handles validation, conversion, and storage of perceptual hashes
 */

const HASH_TYPES = [
  'perceptual_hash',
  'average_hash',
  'difference_hash',
  'wavelet_hash',
  'color_hash',
  'blockhash8',
  'blockhash16',
];

const HASH_BIT_LENGTHS = {
  perceptual_hash: 64,
  average_hash: 64,
  difference_hash: 64,
  wavelet_hash: 64,
  color_hash: 64,
  blockhash8: 64,
  blockhash16: 128,
};

/**
 * Validates a hex hash string format
 * @param {string} hashValue - Hash value to validate (e.g., "0xfedcba0987654321")
 * @param {string} hashType - Type of hash for bit length validation
 * @returns {boolean} True if valid
 */
function isValidHashFormat(hashValue, hashType) {
  if (typeof hashValue !== 'string') return false;
  if (!hashValue.startsWith('0x')) return false;

  const hexPart = hashValue.slice(2);
  if (!/^[0-9a-fA-F]+$/.test(hexPart)) return false;

  const expectedLength = HASH_BIT_LENGTHS[hashType] / 4;
  return hexPart.length === expectedLength;
}

/**
 * Converts hex string to BigInt
 * @param {string} hexString - Hex string (e.g., "0xfedcba0987654321")
 * @returns {bigint} BigInt representation
 */
function hexToBigInt(hexString) {
  if (!hexString || !hexString.startsWith('0x')) {
    throw new Error('Invalid hex string format');
  }
  return BigInt(hexString);
}

/**
 * Converts BigInt to hex string
 * @param {bigint} bigIntValue - BigInt value
 * @param {number} bitLength - Expected bit length (for padding)
 * @returns {string} Hex string with 0x prefix
 */
function bigIntToHex(bigIntValue, bitLength = 64) {
  const hexLength = bitLength / 4;
  const hex = bigIntValue.toString(16).padStart(hexLength, '0');
  return `0x${hex}`;
}

/**
 * Processes raw hash input into storage format
 * @param {Object} rawHashes - Raw hash object from request
 * @returns {Object|null} Processed hash object with both hex and int representations
 */
function processHashesForStorage(rawHashes) {
  if (!rawHashes || typeof rawHashes !== 'object') {
    return null;
  }

  const processed = {};
  const metadata = {
    computed_at: new Date(),
    hash_types: [],
  };

  for (const hashType of HASH_TYPES) {
    const hashValue = rawHashes[hashType];
    if (!hashValue) continue;

    if (!isValidHashFormat(hashValue, hashType)) {
      const err = new Error(`Invalid format for ${hashType}: expected 0x-prefixed hex string`);
      err.status = 400;
      throw err;
    }

    try {
      const bigIntValue = hexToBigInt(hashValue);
      processed[hashType] = hashValue;
      processed[`${hashType}_int`] = bigIntValue.toString(); // Store as string for MongoDB
      metadata.hash_types.push(hashType);
    } catch (error) {
      const err = new Error(`Failed to process ${hashType}: ${error.message}`);
      err.status = 400;
      throw err;
    }
  }

  if (metadata.hash_types.length === 0) {
    return null;
  }

  return {
    hashes: processed,
    hash_metadata: metadata,
  };
}

/**
 * Retrieves hash values from stored document
 * @param {Object} document - MongoDB document
 * @returns {Object|null} Hash values
 */
function getHashesFromDocument(document) {
  if (!document || !document.hashes) {
    return null;
  }

  const hashes = {};
  for (const hashType of HASH_TYPES) {
    if (document.hashes[hashType]) {
      hashes[hashType] = document.hashes[hashType];
      const intKey = `${hashType}_int`;
      if (document.hashes[intKey]) {
        hashes[intKey] = BigInt(document.hashes[intKey]);
      }
    }
  }

  return Object.keys(hashes).length > 0 ? hashes : null;
}

/**
 * Gets the bit length for a given hash type
 * @param {string} hashType - Hash type name
 * @returns {number} Bit length
 */
function getHashBitLength(hashType) {
  return HASH_BIT_LENGTHS[hashType] || 64;
}

module.exports = {
  HASH_TYPES,
  HASH_BIT_LENGTHS,
  isValidHashFormat,
  hexToBigInt,
  bigIntToHex,
  processHashesForStorage,
  getHashesFromDocument,
  getHashBitLength,
};
