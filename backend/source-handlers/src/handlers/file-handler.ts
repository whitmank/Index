import { readFile, access } from 'fs/promises';
import { constants } from 'fs';
import { fileURLToPath } from 'url';
import { watch as watchFile, FSWatcher } from 'chokidar';
import { shell } from 'electron';

import { SourceHandler, SourceCapabilities, ExtractedMetadata } from '../handler-base';
import { calculateFileHash } from '../utils/hash-service';
import { extractFileMetadata } from '../utils/metadata-extractor';

/**
 * File Source Handler
 *
 * Handles file:// URIs and provides:
 * - Metadata extraction
 * - Content hashing
 * - File watching
 * - Native app opening
 */
export class FileHandler extends SourceHandler {
  scheme = 'file';

  capabilities: SourceCapabilities = {
    canWatch: true,
    canOpen: true,
    canPreview: false,
    canCache: false,
  };

  private watchers = new Map<string, FSWatcher>();

  /**
   * Check if handler can handle this URI
   */
  canHandle(uri: string): boolean {
    return uri.startsWith('file://');
  }

  /**
   * Validate URI format
   *
   * @throws Error if URI is invalid
   */
  validate(uri: string): void {
    if (!uri.startsWith('file://')) {
      throw new Error(`Invalid file URI: ${uri}`);
    }

    // Try to convert to path to validate format
    try {
      this.uriToPath(uri);
    } catch (error) {
      throw new Error(`Invalid file URI format: ${uri}`);
    }
  }

  /**
   * Convert file:// URI to filesystem path
   */
  private uriToPath(uri: string): string {
    try {
      return fileURLToPath(uri);
    } catch (error) {
      throw new Error(`Failed to convert URI to path: ${uri}`);
    }
  }

  /**
   * Extract metadata from file
   */
  async extractMetadata(uri: string): Promise<ExtractedMetadata> {
    const path = this.uriToPath(uri);
    return extractFileMetadata(path);
  }

  /**
   * Get content hash (SHA-256)
   */
  async getContentHash(uri: string): Promise<string> {
    const path = this.uriToPath(uri);

    // Check if file exists and is readable
    try {
      await access(path, constants.R_OK);
    } catch {
      throw new Error(`File not accessible: ${path}`);
    }

    return calculateFileHash(path);
  }

  /**
   * Get full content from file
   */
  async getContent(uri: string): Promise<Buffer | string> {
    const path = this.uriToPath(uri);

    // Check if file exists and is readable
    try {
      await access(path, constants.R_OK);
    } catch {
      throw new Error(`File not accessible: ${path}`);
    }

    return readFile(path);
  }

  /**
   * Watch file for changes
   *
   * Uses chokidar for cross-platform file watching
   */
  watch(uri: string, callback: (event: 'change' | 'delete', uri: string) => void) {
    const path = this.uriToPath(uri);

    // Check if already watching
    if (this.watchers.has(uri)) {
      console.warn(`[file-handler] Already watching: ${uri}`);
      return this.watchers.get(uri)!;
    }

    const watcher = watchFile(path, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 1000, // Wait 1s after last change before firing
        pollInterval: 100,
      },
    });

    watcher.on('change', () => {
      callback('change', uri);
    });

    watcher.on('unlink', () => {
      callback('delete', uri);
      // Stop watching deleted file
      this.unwatch(uri);
    });

    watcher.on('error', (error) => {
      console.error(`[file-handler] Watch error for ${uri}:`, error);
      this.unwatch(uri);
    });

    this.watchers.set(uri, watcher);

    return {
      close: () => this.unwatch(uri),
    };
  }

  /**
   * Stop watching file
   */
  unwatch(uri: string): void {
    const watcher = this.watchers.get(uri);
    if (watcher) {
      watcher.close();
      this.watchers.delete(uri);
      console.log(`[file-handler] Stopped watching: ${uri}`);
    }
  }

  /**
   * Open file in native application
   */
  async open(uri: string): Promise<void> {
    const path = this.uriToPath(uri);

    // Check if file exists
    try {
      await access(path, constants.F_OK);
    } catch {
      throw new Error(`File not found: ${path}`);
    }

    // Use Electron shell to open file
    // This will open with the default application
    const result = await shell.openPath(path);

    if (result) {
      throw new Error(`Failed to open file: ${result}`);
    }
  }

  /**
   * Clean up watchers on shutdown
   */
  cleanup(): void {
    for (const [uri, watcher] of this.watchers.entries()) {
      watcher.close();
    }
    this.watchers.clear();
    console.log('[file-handler] Cleaned up all watchers');
  }
}

// Export singleton
export const fileHandler = new FileHandler();
