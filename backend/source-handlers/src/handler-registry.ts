import { SourceHandler, ExtractedMetadata } from './handler-base';

/**
 * Registry for source handlers
 *
 * Manages handlers for different URI schemes and dispatches operations
 * to the appropriate handler based on the URI scheme
 */
export class HandlerRegistry {
  private handlers = new Map<string, SourceHandler>();

  /**
   * Register a handler for a specific scheme
   *
   * @param handler - Handler instance
   */
  register(handler: SourceHandler): void {
    const scheme = handler.scheme.toLowerCase();
    if (this.handlers.has(scheme)) {
      console.warn(`[registry] Overwriting handler for scheme: ${scheme}`);
    }
    this.handlers.set(scheme, handler);
    console.log(`[registry] Registered handler for scheme: ${scheme}`);
  }

  /**
   * Unregister a handler
   *
   * @param scheme - URI scheme to unregister
   */
  unregister(scheme: string): void {
    const normalizedScheme = scheme.toLowerCase();
    this.handlers.delete(normalizedScheme);
    console.log(`[registry] Unregistered handler for scheme: ${normalizedScheme}`);
  }

  /**
   * Find handler for a given URI
   *
   * @param uri - Source URI
   * @returns Handler instance
   * @throws Error if no handler found
   */
  findHandler(uri: string): SourceHandler {
    // Parse scheme from URI
    const schemeMatch = uri.match(/^([a-z][a-z0-9+\-.]*):\/\//i);
    if (!schemeMatch) {
      throw new Error(`Invalid URI format: ${uri}`);
    }

    const scheme = schemeMatch[1].toLowerCase();
    const handler = this.handlers.get(scheme);

    if (!handler) {
      throw new Error(`No handler registered for scheme: ${scheme}`);
    }

    return handler;
  }

  /**
   * Check if a handler exists for the given URI
   *
   * @param uri - Source URI
   * @returns true if handler exists
   */
  canHandle(uri: string): boolean {
    try {
      const handler = this.findHandler(uri);
      return handler.canHandle(uri);
    } catch {
      return false;
    }
  }

  /**
   * Extract metadata from source
   *
   * @param uri - Source URI
   * @returns Extracted metadata
   */
  async extractMetadata(uri: string): Promise<ExtractedMetadata> {
    const handler = this.findHandler(uri);
    handler.validate(uri);
    return handler.extractMetadata(uri);
  }

  /**
   * Get content hash
   *
   * @param uri - Source URI
   * @returns Hash in format "sha256:abc123..."
   */
  async getContentHash(uri: string): Promise<string> {
    const handler = this.findHandler(uri);
    handler.validate(uri);
    return handler.getContentHash(uri);
  }

  /**
   * Get full content
   *
   * @param uri - Source URI
   * @returns Content as Buffer or string
   */
  async getContent(uri: string): Promise<Buffer | string> {
    const handler = this.findHandler(uri);
    handler.validate(uri);
    return handler.getContent(uri);
  }

  /**
   * Watch source for changes
   *
   * @param uri - Source URI
   * @param callback - Called when source changes
   * @returns Watcher object that can be closed
   */
  watch(uri: string, callback: (event: 'change' | 'delete', uri: string) => void) {
    const handler = this.findHandler(uri);
    handler.validate(uri);

    if (!handler.watch) {
      throw new Error(`Handler for ${uri.split('://')[0]} does not support watching`);
    }

    return handler.watch(uri, callback);
  }

  /**
   * Open source in native application
   *
   * @param uri - Source URI
   */
  async open(uri: string): Promise<void> {
    const handler = this.findHandler(uri);
    handler.validate(uri);

    if (!handler.open) {
      throw new Error(`Handler for ${uri.split('://')[0]} does not support opening`);
    }

    return handler.open(uri);
  }

  /**
   * Get all registered schemes
   *
   * @returns Array of scheme names
   */
  getSchemes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get handler info
   *
   * @returns Array of handler info
   */
  getHandlerInfo() {
    return Array.from(this.handlers.values()).map((handler) => ({
      scheme: handler.scheme,
      capabilities: handler.capabilities,
    }));
  }
}

// Export singleton instance
export const registry = new HandlerRegistry();
