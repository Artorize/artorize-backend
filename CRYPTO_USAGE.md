# Crypto Utilities Usage Guide

This document provides usage examples for the AES-256-GCM encryption/decryption and deterministic hashing utilities.

## Setup

### Environment Variables

Two environment variables must be set before starting the application:

```bash
# Generate a 32-byte base64-encoded encryption key
node -e "console.log(crypto.randomBytes(32).toString('base64'))"
# Example output: j4D7gv1TSxFZewhoPp7EBHPfRxdv1sXg9UCcquuy3F0=

# Set environment variables
export APP_ENCRYPTION_KEY="your-base64-key-here"
export BETTER_AUTH_SECRET="your-better-auth-secret-here"
```

**Requirements:**
- `APP_ENCRYPTION_KEY`: Must be a base64-encoded 32-byte key
- `BETTER_AUTH_SECRET`: Non-empty string (recommended 32+ characters)

The application validates these variables at startup and will fail to start if they are missing or invalid.

## API Reference

### Encryption Functions

#### `createCipher(data)`

Encrypts data using AES-256-GCM.

**Parameters:**
- `data` (string | Buffer): Data to encrypt

**Returns:**
- `string`: Base64-encoded ciphertext in format `iv:tag:ciphertext`

**Example:**
```javascript
const { createCipher } = require('./src/utils/crypto');

// Encrypt a string
const plaintext = 'Hello, World!';
const encrypted = createCipher(plaintext);
// Returns: "yOeLIQmuucvFHv9n:3N9cquxVuK73JwGYGUgDvw==:KugqGva8wopSHyIAmw=="

// Encrypt JSON
const jsonData = JSON.stringify({ userId: 123, email: 'user@example.com' });
const encryptedJson = createCipher(jsonData);

// Encrypt buffer
const buffer = Buffer.from('binary data');
const encryptedBuffer = createCipher(buffer);
```

#### `createDecipher(ciphertext)`

Decrypts data encrypted with `createCipher`.

**Parameters:**
- `ciphertext` (string): Base64-encoded ciphertext in format `iv:tag:ciphertext`

**Returns:**
- `string`: Decrypted data as UTF-8 string

**Throws:**
- `Error` if decryption fails (invalid format, corrupted data, or authentication tag verification failed)

**Example:**
```javascript
const { createDecipher } = require('./src/utils/crypto');

const encrypted = "yOeLIQmuucvFHv9n:3N9cquxVuK73JwGYGUgDvw==:KugqGva8wopSHyIAmw==";
const decrypted = createDecipher(encrypted);
// Returns: "Hello, World!"

// Decrypt JSON
const encryptedJson = "...";
const jsonData = JSON.parse(createDecipher(encryptedJson));
```

### Hashing Functions

#### `hashDeterministic(str)`

Creates a deterministic SHA-256 hash of a string. The input is normalized (trimmed and lowercased) before hashing to ensure consistent results regardless of case or trailing whitespace.

**Parameters:**
- `str` (string): String to hash

**Returns:**
- `string`: Hex-encoded SHA-256 hash (64 characters)

**Example:**
```javascript
const { hashDeterministic } = require('./src/utils/crypto');

const email = 'user@example.com';
const hash = hashDeterministic(email);
// Returns: "b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514"

// Hash is deterministic - same input always produces same output
const hash2 = hashDeterministic(email);
console.log(hash === hash2); // true

// Normalization: case-insensitive and whitespace-trimmed
const hash3 = hashDeterministic('User@Example.com');
const hash4 = hashDeterministic(' user@example.com ');
console.log(hash === hash3 && hash === hash4); // true - all normalized to same hash
```

## Common Use Cases

### Storing Encrypted User Data

```javascript
const { createCipher, createDecipher } = require('./src/utils/crypto');

// Encrypt sensitive data before storing
const userData = {
  email: 'user@example.com',
  apiKey: 'secret-api-key',
  preferences: { theme: 'dark' }
};

const encryptedData = createCipher(JSON.stringify(userData));

// Store encryptedData in database...

// Later, retrieve and decrypt
const decryptedData = JSON.parse(createDecipher(encryptedData));
console.log(decryptedData.email); // "user@example.com"
```

### Creating Deterministic User Identifiers

```javascript
const { hashDeterministic } = require('./src/utils/crypto');

// Create a deterministic hash of an email for indexing/lookup
const email = 'user@example.com';
const hashedEmail = hashDeterministic(email);

// Use hashedEmail as a stable identifier that doesn't expose the email
// Same email always produces the same hash
```

### Token Encryption

```javascript
const { createCipher, createDecipher } = require('./src/utils/crypto');

// Encrypt authentication token
const tokenData = {
  userId: 12345,
  expiresAt: Date.now() + 3600000, // 1 hour
  scope: 'upload'
};

const encryptedToken = createCipher(JSON.stringify(tokenData));

// Send encryptedToken to client...

// Later, verify and decrypt token
try {
  const decryptedToken = JSON.parse(createDecipher(encryptedToken));
  if (decryptedToken.expiresAt < Date.now()) {
    throw new Error('Token expired');
  }
  // Use decryptedToken.userId for authentication
} catch (error) {
  console.error('Invalid or expired token');
}
```

## Security Notes

1. **Encryption Key Management:**
   - Never commit `APP_ENCRYPTION_KEY` to version control
   - Use environment variables or secure secret management systems
   - Rotate keys periodically and re-encrypt existing data

2. **AES-256-GCM Properties:**
   - **Authenticated encryption**: Detects tampering via authentication tag
   - **Random IV**: Each encryption produces different ciphertext (even for same plaintext)
   - **No padding**: GCM mode doesn't require padding

3. **Deterministic Hashing:**
   - Use `hashDeterministic` for lookups, not for password storage
   - For passwords, use bcrypt or argon2 instead
   - Same input always produces same hash (by design)

4. **Error Handling:**
   - Decryption failures indicate corrupted data or wrong key
   - Never expose error details to end users (information leakage risk)
   - Log decryption failures for security monitoring

## Testing

The implementation includes comprehensive test coverage:

```bash
# Run crypto tests (included in main test suite)
npm test

# Generate a new encryption key for testing
node -e "console.log(crypto.randomBytes(32).toString('base64'))"
```

## Architecture

- **Module**: `src/utils/crypto.js` - Encryption/decryption utilities
- **Module**: `src/config/env-secure.js` - Environment variable validation
- **Integration**: Validation runs at server startup (before MongoDB connection)
- **Caching**: Decoded key buffer is cached in memory to avoid repeated base64 decoding

## Troubleshooting

### "APP_ENCRYPTION_KEY environment variable is not set"

**Solution:** Set the `APP_ENCRYPTION_KEY` environment variable with a valid base64-encoded 32-byte key.

```bash
export APP_ENCRYPTION_KEY=$(node -e "console.log(crypto.randomBytes(32).toString('base64'))")
```

### "Invalid ciphertext format"

**Cause:** The ciphertext string is not in the expected `iv:tag:ciphertext` format.

**Solution:** Ensure you're passing the complete encrypted string returned by `createCipher`.

### "Decryption failed: authentication tag verification failed"

**Causes:**
- Wrong encryption key being used
- Data was tampered with or corrupted
- Ciphertext was truncated or modified

**Solution:** Verify you're using the same key that was used for encryption and that the ciphertext hasn't been modified.

### "Invalid key length"

**Cause:** The `APP_ENCRYPTION_KEY` doesn't decode to exactly 32 bytes.

**Solution:** Generate a new key using the provided command and ensure it's properly base64-encoded.
