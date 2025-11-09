const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const UPDATE_TIMESTAMP_FILE = path.join(__dirname, '../../.last-update');

/**
 * Get the application version from package.json
 * @returns {string} Version string
 */
function getVersion() {
  try {
    const packageJson = require('../../package.json');
    return packageJson.version;
  } catch (error) {
    return 'unknown';
  }
}

/**
 * Get the current git commit hash
 * @returns {string} Short git commit hash or 'unknown' if not in a git repo
 */
function getGitCommit() {
  try {
    const commit = execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    return commit;
  } catch (error) {
    return 'unknown';
  }
}

/**
 * Get the current git branch
 * @returns {string} Git branch name or 'unknown'
 */
function getGitBranch() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    return branch;
  } catch (error) {
    return 'unknown';
  }
}

/**
 * Get the last update timestamp
 * @returns {Date|null} Last update date or null if never updated
 */
function getLastUpdateTime() {
  try {
    if (fs.existsSync(UPDATE_TIMESTAMP_FILE)) {
      const timestamp = fs.readFileSync(UPDATE_TIMESTAMP_FILE, 'utf8').trim();
      return new Date(timestamp);
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Save the current timestamp as last update time
 */
function saveUpdateTime() {
  try {
    const timestamp = new Date().toISOString();
    fs.writeFileSync(UPDATE_TIMESTAMP_FILE, timestamp, 'utf8');
  } catch (error) {
    // Silently fail if we can't write the timestamp
  }
}

/**
 * Get complete version information
 * @returns {object} Version info object
 */
function getVersionInfo() {
  const lastUpdate = getLastUpdateTime();

  return {
    version: getVersion(),
    commit: getGitCommit(),
    branch: getGitBranch(),
    lastUpdate: lastUpdate ? lastUpdate.toISOString() : 'never',
    lastUpdateRelative: lastUpdate ? getRelativeTime(lastUpdate) : 'never'
  };
}

/**
 * Get relative time string (e.g., "2 hours ago")
 * @param {Date} date
 * @returns {string}
 */
function getRelativeTime(date) {
  const seconds = Math.floor((new Date() - date) / 1000);

  if (seconds < 60) return `${seconds} seconds ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;

  const years = Math.floor(months / 12);
  return `${years} year${years !== 1 ? 's' : ''} ago`;
}

/**
 * Format version info for display
 * @returns {string} Formatted version string
 */
function formatVersionInfo() {
  const info = getVersionInfo();

  return `
Artorize Backend v${info.version}
  Commit: ${info.commit}
  Branch: ${info.branch}
  Last Update: ${info.lastUpdate} (${info.lastUpdateRelative})
`.trim();
}

module.exports = {
  getVersion,
  getGitCommit,
  getGitBranch,
  getLastUpdateTime,
  saveUpdateTime,
  getVersionInfo,
  formatVersionInfo
};
