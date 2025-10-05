const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG_PATH = path.resolve(__dirname, '../../config/runtime.json');

let cachedConfig;

function resolveConfigPath() {
  const cliOverride = process.argv.find((arg) => arg.startsWith('--config='));
  if (cliOverride) {
    return path.resolve(process.cwd(), cliOverride.split('=')[1]);
  }

  if (process.env.APP_CONFIG_PATH) {
    return path.resolve(process.cwd(), process.env.APP_CONFIG_PATH);
  }

  return DEFAULT_CONFIG_PATH;
}

function readConfig(configPath) {
  try {
    const fileContents = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(fileContents);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Configuration file not found at ${configPath}. Run scripts/deploy.sh to generate one.`);
    }

    if (error.name === 'SyntaxError') {
      throw new Error(`Invalid JSON in configuration file at ${configPath}: ${error.message}`);
    }

    throw error;
  }
}

function normaliseConfig(rawConfig, configPath) {
  if (!rawConfig.mongo || typeof rawConfig.mongo !== 'object') {
    throw new Error('Configuration is missing a mongo object.');
  }

  if (!rawConfig.mongo.uri) {
    throw new Error('Configuration is missing mongo.uri.');
  }

  if (!rawConfig.mongo.dbName) {
    throw new Error('Configuration is missing mongo.dbName.');
  }

  const environment = rawConfig.environment || 'production';
  const portValue = rawConfig.port ?? 3000;
  const port = Number.parseInt(portValue, 10);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid port value in configuration: ${rawConfig.port}`);
  }

  const config = {
    env: environment,
    port,
    mongoUri: rawConfig.mongo.uri,
    dbName: rawConfig.mongo.dbName,
    logLevel: rawConfig.logLevel || (environment === 'production' ? 'info' : 'debug'),
    configPath,
    similarity: {
      defaultThreshold: rawConfig.similarity?.defaultThreshold ?? 0.85,
      defaultLimit: rawConfig.similarity?.defaultLimit ?? 10,
      maxLimit: rawConfig.similarity?.maxLimit ?? 100,
      maxCandidates: rawConfig.similarity?.maxCandidates ?? 1000,
      hashWeights: rawConfig.similarity?.hashWeights ?? {
        perceptual_hash: 1.0,
        average_hash: 0.8,
        difference_hash: 0.6,
        wavelet_hash: 0.5,
        color_hash: 0.3,
        blockhash8: 0.4,
        blockhash16: 0.7,
      },
    },
  };

  return config;
}

function loadConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = resolveConfigPath();
  const rawConfig = readConfig(configPath);

  cachedConfig = normaliseConfig(rawConfig, configPath);

  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = cachedConfig.env;
  }

  return cachedConfig;
}

module.exports = loadConfig();
