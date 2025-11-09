const { execSync } = require('child_process');
const { saveUpdateTime, getGitCommit } = require('./version');

/**
 * Check if the application is running in a git repository
 * @returns {boolean}
 */
function isGitRepository() {
  try {
    execSync('git rev-parse --git-dir', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Check if there are uncommitted changes
 * @returns {boolean}
 */
function hasUncommittedChanges() {
  try {
    const status = execSync('git status --porcelain', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    return status.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Get the remote repository URL
 * @returns {string|null}
 */
function getRemoteUrl() {
  try {
    const remote = execSync('git config --get remote.origin.url', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    return remote;
  } catch (error) {
    return null;
  }
}

/**
 * Fetch latest changes from remote
 * @param {object} logger - Pino logger instance
 * @returns {boolean} Success status
 */
function fetchRemote(logger) {
  try {
    logger.info('Fetching latest changes from remote...');
    execSync('git fetch origin', {
      encoding: 'utf8',
      stdio: 'pipe'
    });
    return true;
  } catch (error) {
    logger.warn({ error: error.message }, 'Failed to fetch from remote');
    return false;
  }
}

/**
 * Check if there are updates available
 * @returns {object} { hasUpdates: boolean, ahead: number, behind: number }
 */
function checkForUpdates() {
  try {
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();

    const revList = execSync(`git rev-list --left-right --count HEAD...origin/${currentBranch}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();

    const [ahead, behind] = revList.split('\t').map(Number);

    return {
      hasUpdates: behind > 0,
      ahead,
      behind
    };
  } catch (error) {
    // If branch doesn't exist on remote or other issues, assume no updates
    return {
      hasUpdates: false,
      ahead: 0,
      behind: 0
    };
  }
}

/**
 * Pull latest changes from remote
 * @param {object} logger - Pino logger instance
 * @returns {object} { success: boolean, updated: boolean, oldCommit: string, newCommit: string }
 */
function pullUpdates(logger) {
  const oldCommit = getGitCommit();

  try {
    logger.info('Pulling latest changes...');

    const output = execSync('git pull origin', {
      encoding: 'utf8',
      stdio: 'pipe'
    });

    const newCommit = getGitCommit();
    const updated = oldCommit !== newCommit;

    if (updated) {
      logger.info({ oldCommit, newCommit }, 'Successfully updated to new version');
      saveUpdateTime();
    } else {
      logger.info('Already up to date');
    }

    return {
      success: true,
      updated,
      oldCommit,
      newCommit
    };
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to pull updates');
    return {
      success: false,
      updated: false,
      oldCommit,
      newCommit: oldCommit
    };
  }
}

/**
 * Perform self-update check and pull if updates are available
 * @param {object} logger - Pino logger instance
 * @param {object} options - Options { force: boolean, skipIfDirty: boolean }
 * @returns {object} Result object with update status
 */
async function performSelfUpdate(logger, options = {}) {
  const { force = false, skipIfDirty = true } = options;

  const result = {
    attempted: false,
    success: false,
    updated: false,
    message: '',
    oldCommit: null,
    newCommit: null
  };

  // Check if we're in a git repository
  if (!isGitRepository()) {
    result.message = 'Not running in a git repository, skipping self-update';
    logger.info(result.message);
    return result;
  }

  // Check for uncommitted changes
  if (skipIfDirty && hasUncommittedChanges()) {
    result.message = 'Uncommitted changes detected, skipping self-update to prevent conflicts';
    logger.warn(result.message);
    return result;
  }

  // Get remote URL
  const remoteUrl = getRemoteUrl();
  if (!remoteUrl) {
    result.message = 'No remote repository configured, skipping self-update';
    logger.warn(result.message);
    return result;
  }

  logger.info({ remoteUrl }, 'Checking for updates...');

  // Fetch latest changes
  if (!fetchRemote(logger)) {
    result.message = 'Failed to fetch from remote';
    return result;
  }

  // Check if updates are available
  const updateStatus = checkForUpdates();

  if (!updateStatus.hasUpdates && !force) {
    result.message = 'No updates available';
    logger.info(result.message);
    return result;
  }

  if (updateStatus.hasUpdates) {
    logger.info(
      { behind: updateStatus.behind, ahead: updateStatus.ahead },
      `Updates available: ${updateStatus.behind} commit(s) behind remote`
    );
  }

  // Perform the update
  result.attempted = true;
  const pullResult = pullUpdates(logger);

  result.success = pullResult.success;
  result.updated = pullResult.updated;
  result.oldCommit = pullResult.oldCommit;
  result.newCommit = pullResult.newCommit;

  if (pullResult.updated) {
    result.message = `Updated from ${pullResult.oldCommit} to ${pullResult.newCommit}`;

    // Check if dependencies changed
    try {
      const changedFiles = execSync(`git diff --name-only ${pullResult.oldCommit} ${pullResult.newCommit}`, {
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();

      if (changedFiles.includes('package.json') || changedFiles.includes('package-lock.json')) {
        logger.warn('package.json or package-lock.json changed - consider running npm install');
        result.message += ' (dependencies may have changed, run: npm install)';
      }
    } catch (error) {
      // Ignore errors checking for changed files
    }
  } else if (pullResult.success) {
    result.message = 'Already up to date';
  } else {
    result.message = 'Update failed';
  }

  return result;
}

module.exports = {
  isGitRepository,
  hasUncommittedChanges,
  getRemoteUrl,
  fetchRemote,
  checkForUpdates,
  pullUpdates,
  performSelfUpdate
};
