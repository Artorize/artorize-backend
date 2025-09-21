const path = require('path');
const dotenv = require('dotenv');

const envFile = process.env.ENV_FILE || '.env';
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

const requiredKeys = ['MONGODB_URI', 'DB_NAME'];
const missing = requiredKeys.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: Number.parseInt(process.env.PORT || '3000', 10),
  mongoUri: process.env.MONGODB_URI,
  dbName: process.env.DB_NAME,
};