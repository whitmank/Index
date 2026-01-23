/**
 * Electron IPC Handlers
 *
 * Handles inter-process communication between renderer and main processes
 * Provides access to file system operations and source handler functionality
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { registry, type ExtractedMetadata } from '@index/source-handlers';

/**
 * Register all IPC handlers
 *
 * Call this in the main process after app ready
 */
export function registerIpcHandlers(): void {
  // ============================================
  // SOURCE HANDLER OPERATIONS
  // ============================================

  /**
   * source:extract-metadata
   * Extract metadata from a source (file, URL, etc.)
   */
  ipcMain.handle('source:extract-metadata', async (event: IpcMainInvokeEvent, uri: string) => {
    try {
      if (!uri) {
        throw new Error('URI is required');
      }

      const metadata = await registry.extractMetadata(uri);
      return {
        success: true,
        data: metadata,
      };
    } catch (error) {
      console.error('[ipc] source:extract-metadata error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * source:get-hash
   * Get content hash (SHA-256) of a source
   */
  ipcMain.handle('source:get-hash', async (event: IpcMainInvokeEvent, uri: string) => {
    try {
      if (!uri) {
        throw new Error('URI is required');
      }

      const hash = await registry.getContentHash(uri);
      return {
        success: true,
        data: hash,
      };
    } catch (error) {
      console.error('[ipc] source:get-hash error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * source:open
   * Open source in native application
   */
  ipcMain.handle('source:open', async (event: IpcMainInvokeEvent, uri: string) => {
    try {
      if (!uri) {
        throw new Error('URI is required');
      }

      await registry.open(uri);
      return {
        success: true,
      };
    } catch (error) {
      console.error('[ipc] source:open error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * source:watch
   * Start watching a source for changes
   *
   * Note: This is send-based, not invoke-based, because watchers are long-lived
   */
  ipcMain.on('source:watch-start', (event, uri: string) => {
    try {
      if (!uri) {
        event.reply('source:watch-error', { uri, error: 'URI is required' });
        return;
      }

      const watcher = registry.watch(uri, (watchEvent, changedUri) => {
        // Send watch event back to renderer
        event.reply('source:watch-event', {
          uri: changedUri,
          event: watchEvent,
          timestamp: new Date().toISOString(),
        });
      });

      // Store watcher for later cleanup
      if (!globalThis.activeWatchers) {
        globalThis.activeWatchers = new Map();
      }
      (globalThis.activeWatchers as Map<string, { close: () => void }>).set(uri, watcher);

      event.reply('source:watch-started', { uri });
    } catch (error) {
      console.error('[ipc] source:watch-start error:', error);
      event.reply('source:watch-error', {
        uri,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * source:watch-stop
   * Stop watching a source
   */
  ipcMain.on('source:watch-stop', (event, uri: string) => {
    try {
      if (!uri) {
        event.reply('source:watch-error', { uri, error: 'URI is required' });
        return;
      }

      if (!globalThis.activeWatchers) {
        event.reply('source:watch-error', { uri, error: 'No watchers active' });
        return;
      }

      const watcher = (globalThis.activeWatchers as Map<string, { close: () => void }>).get(uri);
      if (watcher) {
        watcher.close();
        (globalThis.activeWatchers as Map<string, { close: () => void }>).delete(uri);
        event.reply('source:watch-stopped', { uri });
      } else {
        event.reply('source:watch-error', { uri, error: 'Watch not found' });
      }
    } catch (error) {
      console.error('[ipc] source:watch-stop error:', error);
      event.reply('source:watch-error', {
        uri,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================
  // HANDLER REGISTRY OPERATIONS
  // ============================================

  /**
   * registry:get-info
   * Get information about registered handlers
   */
  ipcMain.handle('registry:get-info', async () => {
    try {
      return {
        success: true,
        data: {
          schemes: registry.getSchemes(),
          handlers: registry.getHandlerInfo(),
        },
      };
    } catch (error) {
      console.error('[ipc] registry:get-info error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * registry:can-handle
   * Check if registry can handle a given URI
   */
  ipcMain.handle('registry:can-handle', async (event: IpcMainInvokeEvent, uri: string) => {
    try {
      const canHandle = registry.canHandle(uri);
      return {
        success: true,
        data: canHandle,
      };
    } catch (error) {
      console.error('[ipc] registry:can-handle error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  console.log('[ipc] All handlers registered successfully');
}

/**
 * Cleanup active watchers
 *
 * Call this when app is about to quit
 */
export function cleanupWatchers(): void {
  if (!globalThis.activeWatchers) {
    return;
  }

  const watchers = globalThis.activeWatchers as Map<string, { close: () => void }>;
  for (const [uri, watcher] of watchers.entries()) {
    try {
      watcher.close();
      console.log('[ipc] Closed watcher for:', uri);
    } catch (error) {
      console.error('[ipc] Error closing watcher for', uri, ':', error);
    }
  }
  watchers.clear();
}

// Extend globalThis to include activeWatchers
declare global {
  var activeWatchers: Map<string, { close: () => void }> | undefined;
}
