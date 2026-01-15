/**
 * Manages port allocation for Express and SurrealDB services
 * Finds available ports with fallback mechanism
 */
class PortManager {
  constructor() {
    this.defaultExpressPort = 3000;
    this.defaultDbPort = 8000;
    this.getPort = null; // Will be lazily loaded
  }

  /**
   * Lazy load get-port module (ES module)
   */
  async _loadGetPort() {
    if (!this.getPort) {
      const module = await import('get-port');
      this.getPort = module.default;
    }
    return this.getPort;
  }

  /**
   * Find an available Express server port
   * @returns {Promise<number>} Available port number
   */
  async getExpressPort() {
    try {
      const getPort = await this._loadGetPort();
      // Try preferred port first, fallback to any available port
      const port = await getPort({ port: this.defaultExpressPort });
      return port;
    } catch (error) {
      console.error('Failed to get Express port:', error);
      throw new Error('Could not find available port for Express server');
    }
  }

  /**
   * Find an available SurrealDB port
   * @returns {Promise<number>} Available port number
   */
  async getDbPort() {
    try {
      const getPort = await this._loadGetPort();
      // Try preferred port first, fallback to any available port
      const port = await getPort({ port: this.defaultDbPort });
      return port;
    } catch (error) {
      console.error('Failed to get DB port:', error);
      throw new Error('Could not find available port for SurrealDB');
    }
  }

  /**
   * Get both ports at once
   * @returns {Promise<{expressPort: number, dbPort: number}>} Object with both port numbers
   */
  async findAvailablePorts() {
    const getPort = await this._loadGetPort();
    const expressPort = await this.getExpressPort();
    const dbPort = await this.getDbPort();

    // Ensure ports are different
    if (expressPort === dbPort) {
      // If they're the same, get a new DB port
      const newDbPort = await getPort();
      return { expressPort, dbPort: newDbPort };
    }

    return { expressPort, dbPort };
  }
}

module.exports = new PortManager();
