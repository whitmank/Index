const { app } = require('electron');
const path = require('path');
const os = require('os');

/**
 * Resolves paths for development vs production environments
 * In dev: Uses relative paths from project root
 * In prod: Uses app.getPath() and process.resourcesPath
 */
class PathResolver {
  constructor() {
    this.isDev = !app.isPackaged;
    this.platform = os.platform();
  }

  /**
   * Get the SurrealDB binary path
   * @returns {string} Path to surreal binary
   */
  getSurrealBinaryPath() {
    if (this.isDev) {
      // In development, use system PATH
      return 'surreal';
    }

    // In production, use bundled binary
    const platformMap = {
      'darwin': 'mac',
      'win32': 'win',
      'linux': 'linux'
    };

    const platformDir = platformMap[this.platform] || 'linux';
    const ext = this.platform === 'win32' ? '.exe' : '';

    return path.join(
      process.resourcesPath,
      'binaries',
      platformDir,
      `surreal${ext}`
    );
  }

  /**
   * Get the database storage path
   * @returns {string} Path to database file
   */
  getDatabasePath() {
    if (this.isDev) {
      // In development, use project data directory
      return path.join(__dirname, '../../../data/database.db');
    }

    // In production, use user data directory
    return path.join(app.getPath('userData'), 'database.db');
  }

  /**
   * Get the frontend build path (production only)
   * @returns {string|null} Path to frontend dist, or null in dev mode
   */
  getFrontendPath() {
    if (this.isDev) {
      return null; // Use Vite dev server in development
    }

    return path.join(__dirname, '../../../frontend/dist');
  }

  /**
   * Get the backend path
   * @returns {string} Path to backend directory
   */
  getBackendPath() {
    return path.join(__dirname, '../../../backend');
  }

  /**
   * Get all resolved paths
   * @returns {Object} Object containing all resolved paths
   */
  getAll() {
    return {
      isDev: this.isDev,
      platform: this.platform,
      surrealBinary: this.getSurrealBinaryPath(),
      database: this.getDatabasePath(),
      frontend: this.getFrontendPath(),
      backend: this.getBackendPath(),
      userData: app.getPath('userData'),
      appPath: app.getAppPath()
    };
  }
}

module.exports = new PathResolver();
