const { createCipher, hashDeterministic } = require('../utils/crypto');
const { getAuthSecret, validateOAuthCredentials, validateAppBaseUrl } = require('../config/env-secure');

let authInstance;

/**
 * Create the Better Auth instance
 * Maintains singleton pattern - should only be called once during initialization
 *
 * Validates OAuth credentials and APP_BASE_URL before creating the auth instance.
 * In test environment (NODE_ENV=test), OAuth validation is skipped to allow flexible test setup.
 *
 * @param {object} db - MongoDB database instance
 * @param {object} client - MongoDB client instance
 * @returns {Promise<object>} The Better Auth instance
 * @throws {Error} If auth instance already created, or if OAuth credentials are invalid (non-test)
 */
async function createAuth(db, client) {
  if (authInstance) {
    return authInstance;
  }

  const isTestEnv = process.env.NODE_ENV === 'test';

  // In production/development, validate OAuth credentials and APP_BASE_URL
  if (!isTestEnv && process.env.OAUTH_ENABLED !== 'false') {
    validateOAuthCredentials('Google', process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    validateOAuthCredentials('GitHub', process.env.GITHUB_CLIENT_ID, process.env.GITHUB_CLIENT_SECRET);
    validateAppBaseUrl(); // Validates and returns URL, but we derive it again for flexibility
  }

  // Get APP_BASE_URL (defaults to router origin http://localhost:7000)
  // In test env, gracefully fall back to default without validation
  const appBaseUrl = isTestEnv
    ? (process.env.APP_BASE_URL || 'http://localhost:7000')
    : validateAppBaseUrl();

  console.log('Better Auth APP_BASE_URL:', appBaseUrl);

  const { betterAuth } = await import('better-auth');
  const { mongodbAdapter } = await import('better-auth/adapters/mongodb');
  const { username } = await import('better-auth/plugins/username');

  // In test env, allow empty OAuth credentials to simplify test setup
  const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const githubClientId = process.env.GITHUB_CLIENT_ID || '';
  const githubClientSecret = process.env.GITHUB_CLIENT_SECRET || '';

  authInstance = betterAuth({
    basePath: '/auth',
    baseURL: appBaseUrl,
    trustedOrigins: ['http://localhost:7000', 'http://localhost:5001', 'https://router.artorizer.com', 'https://backend.artorizer.com', 'https://artorizer.com'],
    secret: getAuthSecret(),
    database: mongodbAdapter(db),
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: {
      google: {
        clientId: googleClientId,
        clientSecret: googleClientSecret,
      },
      github: {
        clientId: githubClientId,
        clientSecret: githubClientSecret,
      },
    },
    plugins: [username()],
    account: {
      encryptOAuthTokens: true,
    },
    session: {
      cookieCache: true,
      cookie: {
        name: 'better-auth.session_token',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        path: '/',
      },
    },
    advanced: {
      database: {
        mapKeysTransformInput: (data) => (data.id ? { ...data, _id: data.id } : data),
        mapKeysTransformOutput: (data) => (data._id ? { ...data, id: data._id } : data),
      },
    },
    databaseHooks: {
      user: {
        create: {
          before(user) {
            const normalizedEmail = user.email?.trim().toLowerCase();
            const normalizedUsername = user.username?.trim().toLowerCase();
            return {
              data: {
                ...user,
                emailEnc: normalizedEmail && createCipher(normalizedEmail),
                emailHash: normalizedEmail && hashDeterministic(normalizedEmail),
                usernameEnc: normalizedUsername && createCipher(normalizedUsername),
                usernameHash: normalizedUsername && hashDeterministic(normalizedUsername),
                nameEnc: user.name ? createCipher(user.name) : undefined,
              },
            };
          },
        },
      },
      account: {
        create: {
          before(account) {
            const withEncryptedTokens = { ...account };
            if (account.accessToken) withEncryptedTokens.accessToken = createCipher(account.accessToken);
            if (account.refreshToken) withEncryptedTokens.refreshToken = createCipher(account.refreshToken);
            return { data: withEncryptedTokens };
          },
        },
      },
    },
  });

  return authInstance;
}

/**
 * Retrieve the Better Auth instance
 * Must only be called after createAuth() has been called
 *
 * @returns {object} The Better Auth instance
 * @throws {Error} If auth instance has not been initialized yet
 */
function getAuth() {
  if (!authInstance) {
    throw new Error('Better Auth has not been initialised yet');
  }
  return authInstance;
}

module.exports = { createAuth, getAuth };
