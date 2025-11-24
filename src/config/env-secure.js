const crypto = require('crypto');

const KEY_LENGTH = 32; // 32 bytes for AES-256

/**
 * Validate APP_ENCRYPTION_KEY environment variable and cache the buffer
 * @returns {void}
 * @throws {Error} If APP_ENCRYPTION_KEY is missing or invalid
 */
function validateEncryptionKey() {
  const keyBase64 = process.env.APP_ENCRYPTION_KEY;

  if (!keyBase64) {
    throw new Error(
      'APP_ENCRYPTION_KEY environment variable is not set. ' +
      'Generate one with: node -e "console.log(crypto.randomBytes(32).toString(\'base64\'))"'
    );
  }

  let keyBuffer;
  try {
    keyBuffer = Buffer.from(keyBase64, 'base64');
  } catch (error) {
    throw new Error(
      'APP_ENCRYPTION_KEY must be a valid base64-encoded string. ' +
      'Generate one with: node -e "console.log(crypto.randomBytes(32).toString(\'base64\'))"'
    );
  }

  if (keyBuffer.length !== KEY_LENGTH) {
    throw new Error(
      `APP_ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes (got ${keyBuffer.length} bytes). ` +
      'Generate one with: node -e "console.log(crypto.randomBytes(32).toString(\'base64\'))"'
    );
  }
}

/**
 * Validate BETTER_AUTH_SECRET environment variable
 * @returns {void}
 * @throws {Error} If BETTER_AUTH_SECRET is missing or invalid
 */
function validateBetterAuthSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;

  if (!secret) {
    throw new Error(
      'BETTER_AUTH_SECRET environment variable is not set. ' +
      'This should match the secret used by the Artorize router.'
    );
  }

  if (typeof secret !== 'string' || secret.trim().length === 0) {
    throw new Error('BETTER_AUTH_SECRET must be a non-empty string');
  }

  // Require at least 32 characters for security
  if (secret.length < 32) {
    throw new Error(
      `BETTER_AUTH_SECRET must be at least 32 characters long, got ${secret.length} characters. ` +
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
}

/**
 * Get the encryption key as a Buffer
 * @returns {Buffer} The decoded 32-byte encryption key as a Buffer
 * @throws {Error} If APP_ENCRYPTION_KEY is missing, invalid base64, or not 32 bytes
 */
function getEncryptionKeyBuffer() {
  const keyBase64 = process.env.APP_ENCRYPTION_KEY;

  if (!keyBase64) {
    throw new Error(
      'APP_ENCRYPTION_KEY environment variable is not set. ' +
      'Generate one with: node -e "console.log(crypto.randomBytes(32).toString(\'base64\'))"'
    );
  }

  let keyBuffer;
  try {
    keyBuffer = Buffer.from(keyBase64, 'base64');
  } catch (error) {
    throw new Error(
      'APP_ENCRYPTION_KEY must be a valid base64-encoded string. ' +
      'Generate one with: node -e "console.log(crypto.randomBytes(32).toString(\'base64\'))"'
    );
  }

  if (keyBuffer.length !== KEY_LENGTH) {
    throw new Error(
      `APP_ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes (got ${keyBuffer.length} bytes). ` +
      'Generate one with: node -e "console.log(crypto.randomBytes(32).toString(\'base64\'))"'
    );
  }

  return keyBuffer;
}

/**
 * Get the Better Auth secret
 * @returns {string} The Better Auth secret string
 * @throws {Error} If BETTER_AUTH_SECRET is missing or shorter than 32 characters
 */
function getAuthSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;

  if (!secret) {
    throw new Error(
      'BETTER_AUTH_SECRET environment variable is not set. ' +
      'This should match the secret used by the Artorize router.'
    );
  }

  if (typeof secret !== 'string' || secret.trim().length === 0) {
    throw new Error('BETTER_AUTH_SECRET must be a non-empty string');
  }

  if (secret.length < 32) {
    throw new Error(
      `BETTER_AUTH_SECRET must be at least 32 characters long, got ${secret.length} characters. ` +
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  return secret;
}

/**
 * Validate OAuth provider credentials
 * @param {string} provider - OAuth provider name (e.g., 'Google', 'GitHub')
 * @param {string} clientId - OAuth client ID
 * @param {string} clientSecret - OAuth client secret
 * @returns {void}
 * @throws {Error} If credentials are missing or invalid
 */
function validateOAuthCredentials(provider, clientId, clientSecret) {
  if (!clientId || typeof clientId !== 'string' || clientId.trim().length === 0) {
    throw new Error(
      `${provider} OAuth is enabled but ${provider.toUpperCase()}_CLIENT_ID is missing or empty. ` +
      `Set ${provider.toUpperCase()}_CLIENT_ID environment variable or remove the provider from configuration.`
    );
  }

  if (!clientSecret || typeof clientSecret !== 'string' || clientSecret.trim().length === 0) {
    throw new Error(
      `${provider} OAuth is enabled but ${provider.toUpperCase()}_CLIENT_SECRET is missing or empty. ` +
      `Set ${provider.toUpperCase()}_CLIENT_SECRET environment variable or remove the provider from configuration.`
    );
  }
}

/**
 * Validate OAuth providers (Google and GitHub)
 * Skipped in test environment (NODE_ENV=test) or when OAUTH_ENABLED=false
 * @returns {{ google: boolean, github: boolean }} Which providers are enabled
 * @throws {Error} If OAuth is enabled but credentials are missing/invalid
 */
function validateOAuthProviders() {
  const isTestEnv = process.env.NODE_ENV === 'test';
  const oauthEnabled = process.env.OAUTH_ENABLED !== 'false'; // Default to true for backwards compat

  const result = { google: false, github: false };

  if (isTestEnv) {
    return result;
  }

  // If OAuth is explicitly disabled, skip validation
  if (!oauthEnabled) {
    console.log('OAuth providers disabled (OAUTH_ENABLED=false). Email/password auth only.');
    return result;
  }

  // Check Google OAuth (optional - only validate if credentials are partially provided)
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (googleClientId || googleClientSecret) {
    validateOAuthCredentials('Google', googleClientId, googleClientSecret);
    result.google = true;
  }

  // Check GitHub OAuth (optional - only validate if credentials are partially provided)
  const githubClientId = process.env.GITHUB_CLIENT_ID;
  const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (githubClientId || githubClientSecret) {
    validateOAuthCredentials('GitHub', githubClientId, githubClientSecret);
    result.github = true;
  }

  // Log which providers are enabled
  if (!result.google && !result.github) {
    console.log('No OAuth providers configured. Email/password auth only.');
  } else {
    const enabled = [];
    if (result.google) enabled.push('Google');
    if (result.github) enabled.push('GitHub');
    console.log(`OAuth providers enabled: ${enabled.join(', ')}`);
  }

  return result;
}

/**
 * Validate APP_BASE_URL environment variable
 * @returns {string} The validated APP_BASE_URL
 * @throws {Error} If APP_BASE_URL is invalid
 */
function validateAppBaseUrl() {
  const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:7000';

  try {
    const url = new URL(appBaseUrl);
    if (!url.protocol.startsWith('http')) {
      throw new Error('APP_BASE_URL must use http or https protocol');
    }
    return appBaseUrl;
  } catch (error) {
    if (error.code === 'ERR_INVALID_URL') {
      throw new Error(
        `APP_BASE_URL is not a valid URL: ${appBaseUrl}. ` +
        'Must be a full URL like http://localhost:7000 or https://example.com'
      );
    }
    throw error;
  }
}

/**
 * Validate all required secure environment variables
 * @returns {{ oauthProviders: { google: boolean, github: boolean } }} Configuration state
 * @throws {Error} If any required environment variable is missing or invalid
 */
function validateSecureEnv() {
  const errors = [];
  let oauthProviders = { google: false, github: false };

  try {
    validateEncryptionKey();
  } catch (error) {
    errors.push(error.message);
  }

  try {
    validateBetterAuthSecret();
  } catch (error) {
    errors.push(error.message);
  }

  try {
    validateAppBaseUrl();
  } catch (error) {
    errors.push(error.message);
  }

  try {
    oauthProviders = validateOAuthProviders();
  } catch (error) {
    errors.push(error.message);
  }

  if (errors.length > 0) {
    throw new Error(
      'Secure environment validation failed:\n' +
      errors.map((err, idx) => `  ${idx + 1}. ${err}`).join('\n')
    );
  }

  return { oauthProviders };
}

module.exports = {
  validateSecureEnv,
  validateEncryptionKey,
  validateBetterAuthSecret,
  validateOAuthCredentials,
  validateOAuthProviders,
  validateAppBaseUrl,
  getEncryptionKeyBuffer,
  getAuthSecret,
};
