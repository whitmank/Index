/**
 * Source Handler Architecture
 *
 * Defines the interface for handling different source types (file://, https://, etc.)
 * Each handler implements this interface to support a specific URI scheme
 */

export interface SourceCapabilities {
  canWatch: boolean; // Can monitor source for changes
  canOpen: boolean; // Can open source in native app
  canPreview: boolean; // Can provide inline preview
  canCache: boolean; // Can cache content
}

export interface ExtractedMetadata {
  name: string;
  mime_type?: string;
  size?: number;
  extension?: string;
  [key: string]: unknown;
}

/**
 * Abstract base class for source handlers
 *
 * Example implementations:
 * - FileHandler (file://)
 * - HTTPSHandler (https://)
 * - URLHandler (http://)
 */
export abstract class SourceHandler {
  /** URI scheme this handler supports (e.g., "file", "https") */
  abstract scheme: string;

  /** Capabilities of this handler */
  abstract capabilities: SourceCapabilities;

  /**
   * Check if this handler can handle the given URI
   *
   * @param uri - Source URI
   * @returns true if handler can process this URI
   */
  abstract canHandle(uri: string): boolean;

  /**
   * Validate URI format
   *
   * @param uri - Source URI
   * @throws Error if URI is invalid
   */
  abstract validate(uri: string): void;

  /**
   * Extract metadata from source
   *
   * @param uri - Source URI
   * @returns Extracted metadata object
   */
  abstract extractMetadata(uri: string): Promise<ExtractedMetadata>;

  /**
   * Get content hash (SHA-256)
   *
   * @param uri - Source URI
   * @returns Hash in format "sha256:abc123..."
   */
  abstract getContentHash(uri: string): Promise<string>;

  /**
   * Get full content from source
   *
   * @param uri - Source URI
   * @returns Content as Buffer or string
   */
  abstract getContent(uri: string): Promise<Buffer | string>;

  /**
   * Watch source for changes
   *
   * @param uri - Source URI
   * @param callback - Called when source changes
   * @returns Watcher object that can be closed
   */
  watch?(uri: string, callback: (event: 'change' | 'delete', uri: string) => void): { close: () => void };

  /**
   * Stop watching source
   *
   * @param uri - Source URI
   */
  unwatch?(uri: string): void;

  /**
   * Open source in native application
   *
   * @param uri - Source URI
   */
  open?(uri: string): Promise<void>;

  /**
   * Cache content locally
   *
   * @param uri - Source URI
   * @returns Path to cached content
   */
  cache?(uri: string): Promise<string>;
}

/**
 * Handler configuration
 */
export interface HandlerConfig {
  maxFileSize?: number; // Maximum file size to process
  timeout?: number; // Operation timeout in ms
  retries?: number; // Number of retries on failure
}
