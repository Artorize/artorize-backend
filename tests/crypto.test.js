// Simple test for crypto utilities
// Run with: node tests/crypto.test.js

const crypto = require('crypto');

// Generate a test encryption key
const testKey = crypto.randomBytes(32).toString('base64');
process.env.APP_ENCRYPTION_KEY = testKey;
process.env.BETTER_AUTH_SECRET = 'test-secret-for-better-auth-should-be-long-enough-1234567890';

// Load modules after setting environment variables
const { validateSecureEnv } = require('../src/config/env-secure');
const { createCipher, createDecipher, hashDeterministic } = require('../src/utils/crypto');

console.log('Testing crypto utilities...\n');

try {
  // Test 1: Validate secure environment
  console.log('Test 1: Validate secure environment');
  validateSecureEnv();
  console.log('✓ Environment validation passed\n');

  // Test 2: Encrypt and decrypt a string
  console.log('Test 2: Encrypt and decrypt a string');
  const plaintext = 'Hello, World! This is a test message.';
  const ciphertext = createCipher(plaintext);
  console.log('  Plaintext:', plaintext);
  console.log('  Ciphertext:', ciphertext);
  const decrypted = createDecipher(ciphertext);
  console.log('  Decrypted:', decrypted);
  if (decrypted !== plaintext) {
    throw new Error('Decrypted text does not match original');
  }
  console.log('✓ String encryption/decryption works\n');

  // Test 3: Encrypt and decrypt a buffer
  console.log('Test 3: Encrypt and decrypt a buffer');
  const bufferData = Buffer.from('Binary data test', 'utf8');
  const ciphertextBuffer = createCipher(bufferData);
  const decryptedBuffer = createDecipher(ciphertextBuffer);
  if (decryptedBuffer !== bufferData.toString('utf8')) {
    throw new Error('Decrypted buffer does not match original');
  }
  console.log('✓ Buffer encryption/decryption works\n');

  // Test 4: Verify each encryption produces unique ciphertext (due to random IV)
  console.log('Test 4: Verify random IV (different ciphertext each time)');
  const ciphertext1 = createCipher(plaintext);
  const ciphertext2 = createCipher(plaintext);
  if (ciphertext1 === ciphertext2) {
    throw new Error('Same plaintext produced identical ciphertext (IV not random)');
  }
  console.log('  Ciphertext 1:', ciphertext1.substring(0, 50) + '...');
  console.log('  Ciphertext 2:', ciphertext2.substring(0, 50) + '...');
  console.log('✓ Each encryption uses unique IV\n');

  // Test 5: Verify ciphertext format
  console.log('Test 5: Verify ciphertext format (iv:tag:ciphertext)');
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Ciphertext format is invalid');
  }
  console.log('  IV length:', Buffer.from(parts[0], 'base64').length, 'bytes');
  console.log('  Tag length:', Buffer.from(parts[1], 'base64').length, 'bytes');
  console.log('  Ciphertext length:', Buffer.from(parts[2], 'base64').length, 'bytes');
  console.log('✓ Ciphertext format is correct\n');

  // Test 6: Deterministic hash
  console.log('Test 6: Deterministic hash');
  const str1 = 'test@example.com';
  const hash1 = hashDeterministic(str1);
  const hash2 = hashDeterministic(str1);
  console.log('  Input:', str1);
  console.log('  Hash 1:', hash1);
  console.log('  Hash 2:', hash2);
  if (hash1 !== hash2) {
    throw new Error('Deterministic hash produced different results');
  }
  if (hash1.length !== 64) {
    throw new Error('SHA-256 hash should be 64 hex characters');
  }
  console.log('✓ Deterministic hash works\n');

  // Test 7: Verify different inputs produce different hashes
  console.log('Test 7: Different inputs produce different hashes');
  const str2 = 'different@example.com';
  const hash3 = hashDeterministic(str2);
  if (hash1 === hash3) {
    throw new Error('Different inputs produced same hash');
  }
  console.log('✓ Hash collision check passed\n');

  // Test 8: Invalid ciphertext should fail gracefully
  console.log('Test 8: Invalid ciphertext handling');
  try {
    createDecipher('invalid:ciphertext:format');
    throw new Error('Should have thrown error for invalid ciphertext');
  } catch (err) {
    if (err.message.includes('Invalid')) {
      console.log('✓ Invalid ciphertext rejected\n');
    } else {
      throw err;
    }
  }

  // Test 9: Tampered ciphertext should fail authentication
  console.log('Test 9: Tampered ciphertext detection');
  const validCiphertext = createCipher('sensitive data');
  const tamperedParts = validCiphertext.split(':');
  tamperedParts[2] = Buffer.from('tampered', 'utf8').toString('base64');
  const tamperedCiphertext = tamperedParts.join(':');
  try {
    createDecipher(tamperedCiphertext);
    throw new Error('Should have thrown error for tampered ciphertext');
  } catch (err) {
    if (err.message.includes('Decryption failed')) {
      console.log('✓ Tampered ciphertext detected\n');
    } else {
      throw err;
    }
  }

  console.log('=================================');
  console.log('All tests passed! ✓');
  console.log('=================================');
  console.log('\nTo generate a production encryption key, run:');
  console.log('  node -e "console.log(crypto.randomBytes(32).toString(\'base64\'))"');

} catch (error) {
  console.error('\n✗ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
