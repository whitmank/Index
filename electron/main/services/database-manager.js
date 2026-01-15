const createServer = require('../../../backend/database/server');
const pathResolver = require('./path-resolver');
const portManager = require('./port-manager');

/**
 * Manages backend services (Express + SurrealDB) lifecycle
 * Integrates with path-resolver and port-manager for dynamic configuration
 */
class DatabaseManager {
  constructor() {
    this.serverInstance = null;
    this.config = null;
  }

  /**
   * Check if backend services are already running
   * @returns {Promise<boolean>} True if services are running
   */
  async checkServicesRunning() {
    try {
      const response = await fetch('http://localhost:3000/health');
      const data = await response.json();
      return response.ok && data.status === 'ok';
    } catch (error) {
      return false;
    }
  }

  /**
   * Start all backend services
   * @returns {Promise<Object>} Configuration object with ports and paths
   */
  async startServices() {
    try {
      console.log('🔧 Initializing backend services...');

      // Check if services are already running (development scenario)
      const alreadyRunning = await this.checkServicesRunning();
      if (alreadyRunning) {
        console.log('✅ Backend services already running - using existing instance');

        // Return default configuration for existing services
        this.config = {
          PORT: 3000,
          DB_HOST: '127.0.0.1',
          DB_PORT: 8000,
          DB_USER: 'root',
          DB_PASS: 'root',
          DB_PATH: pathResolver.getDatabasePath(),
          SURREAL_BINARY: pathResolver.getSurrealBinaryPath()
        };

        return this.config;
      }

      // Get resolved paths
      const paths = pathResolver.getAll();
      console.log('📂 Paths resolved:', {
        database: paths.database,
        backend: paths.backend,
        surrealBinary: paths.surrealBinary,
        isDev: paths.isDev
      });

      // Find available ports
      const ports = await portManager.findAvailablePorts();
      console.log('🔌 Ports allocated:', ports);

      // Create server configuration
      this.config = {
        PORT: ports.expressPort,
        DB_HOST: '127.0.0.1',
        DB_PORT: ports.dbPort,
        DB_USER: 'root',
        DB_PASS: 'root',
        DB_PATH: paths.database,
        SURREAL_BINARY: paths.surrealBinary
      };

      // Create and start server
      this.serverInstance = createServer(this.config);
      await this.serverInstance.start();

      console.log('✅ Backend services started successfully');

      return this.config;
    } catch (error) {
      console.error('❌ Failed to start backend services:', error);
      throw error;
    }
  }

  /**
   * Stop all backend services
   * @returns {Promise<void>}
   */
  async stopServices() {
    if (!this.serverInstance) {
      console.log('ℹ️  No services to stop (using external services or already stopped)');
      return;
    }

    try {
      console.log('🛑 Stopping backend services...');
      await this.serverInstance.stop();
      this.serverInstance = null;
      this.config = null;
      console.log('✅ Backend services stopped successfully');
    } catch (error) {
      console.error('❌ Error stopping services:', error);
      throw error;
    }
  }

  /**
   * Get current configuration
   * @returns {Object|null} Current configuration or null if not started
   */
  getConfig() {
    return this.config;
  }

  /**
   * Check if services are running
   * @returns {boolean} True if services are running
   */
  isRunning() {
    return this.serverInstance !== null;
  }
}

module.exports = new DatabaseManager();
