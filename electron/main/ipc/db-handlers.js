import { ipcMain, BrowserWindow, shell, dialog } from 'electron';
import { getDatabase } from '../db/index.js';
import { persistToIndex } from '../db/persistence.js';
import { deriveSourceMetadata, cleanURI } from '../utils/metadata.js';

// Author: Claude Code
// IPC handlers for database operations - exposed to renderer process

let mainWindow = null;

/**
 * Set main window reference for broadcasting events
 * @param {BrowserWindow} window
 */
export function setMainWindow(window) {
  mainWindow = window;
}

/**
 * Broadcast objects changed event to renderer
 * @param {Array} objects
 */
export function broadcastObjectsChanged(objects) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('objects:changed', objects);
  }
}

/**
 * Register all database IPC handlers
 * Call this after both Electron and database are ready
 */
export function registerDbHandlers() {
  console.log('[IPC] Registering database handlers...');

  /**
   * Execute a read query (SELECT)
   * Handler: db:query
   */
  ipcMain.handle('db:query', async (event, queryString) => {
    try {
      const db = getDatabase();
      if (!db) {
        throw new Error('Database not connected');
      }

      console.log('[IPC] Query:', queryString);
      const result = await db.query(queryString);
      return { success: true, data: result };
    } catch (error) {
      console.error('[IPC] Query error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Execute a mutation (INSERT, UPDATE, DELETE, CREATE)
   * Automatically persists to disk after mutation
   * Handler: db:mutate
   */
  ipcMain.handle('db:mutate', async (event, queryString) => {
    try {
      const db = getDatabase();
      if (!db) {
        throw new Error('Database not connected');
      }

      console.log('[IPC] Mutation:', queryString);
      const result = await db.query(queryString);

      // Persist to disk after mutation
      await persistToIndex(db);

      return { success: true, data: result };
    } catch (error) {
      console.error('[IPC] Mutation error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get all data for a specific table
   * Handler: db:getAll
   */
  ipcMain.handle('db:getAll', async (event, table) => {
    try {
      const db = getDatabase();
      if (!db) {
        throw new Error('Database not connected');
      }

      const validTables = ['objects', 'relationships', 'tags'];
      if (!validTables.includes(table)) {
        throw new Error(`Invalid table: ${table}`);
      }

      console.log('[IPC] GetAll:', table);
      const result = await db.query(`SELECT * FROM ${table}`);
      const data = (Array.isArray(result) && result.length > 0) ? result[0] : [];
      console.log('[IPC] Loaded', data.length, 'items from', table);

      return { success: true, data };
    } catch (error) {
      console.error('[IPC] GetAll error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Create a new object
   * Handler: db:createObject
   */
  ipcMain.handle('db:createObject', async (event, objectData) => {
    try {
      const db = getDatabase();
      if (!db) {
        throw new Error('Database not connected');
      }

      console.log('[IPC] Create object:', objectData);

      // Clean source URI (remove quotes)
      const cleanedSource = objectData.source ? cleanURI(objectData.source) : null;

      // Derive source metadata if source provided
      const sourceMetadata = await deriveSourceMetadata(cleanedSource);

      const objectWithMetadata = {
        name: objectData.name,
        source: cleanedSource,
        user_metadata: objectData.user_metadata || {},
        source_metadata: sourceMetadata,
      };

      const result = await db.create('objects', objectWithMetadata);

      // Persist after creation
      await persistToIndex(db);

      return { success: true, data: result };
    } catch (error) {
      console.error('[IPC] Create object error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Create a new relationship
   * Handler: db:createRelationship
   */
  ipcMain.handle('db:createRelationship', async (event, relationshipData) => {
    try {
      const db = getDatabase();
      if (!db) {
        throw new Error('Database not connected');
      }

      console.log('[IPC] Create relationship:', relationshipData);
      const result = await db.create('relationships', relationshipData);

      // Persist after creation
      await persistToIndex(db);

      return { success: true, data: result };
    } catch (error) {
      console.error('[IPC] Create relationship error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Create a new tag
   * Handler: db:createTag
   */
  ipcMain.handle('db:createTag', async (event, tagData) => {
    try {
      const db = getDatabase();
      if (!db) {
        throw new Error('Database not connected');
      }

      console.log('[IPC] Create tag:', tagData);
      const result = await db.create('tags', tagData);

      // Persist after creation
      await persistToIndex(db);

      return { success: true, data: result };
    } catch (error) {
      console.error('[IPC] Create tag error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Update an object
   * Handler: db:updateObject
   */
  ipcMain.handle('db:updateObject', async (event, id, objectData) => {
    try {
      const db = getDatabase();
      if (!db) {
        throw new Error('Database not connected');
      }

      console.log('[IPC] Update object:', id, objectData);

      // Prepare update object
      const updateObj = {
        name: objectData.name,
        user_metadata: objectData.user_metadata || {},
      };

      // If source changed, re-derive source metadata
      if (objectData.source !== undefined) {
        const cleanedSource = objectData.source ? cleanURI(objectData.source) : null;
        updateObj.source = cleanedSource;
        updateObj.source_metadata = await deriveSourceMetadata(cleanedSource);
      }

      const result = await db.query(
        `UPDATE objects:${id} MERGE ${JSON.stringify(updateObj)}`
      );

      // Persist after update
      await persistToIndex(db);

      return { success: true, data: result };
    } catch (error) {
      console.error('[IPC] Update object error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Open a file or URL
   * Handler: app:openSource
   */
  ipcMain.handle('app:openSource', async (event, source) => {
    try {
      if (!source) {
        return { success: false, error: 'No source provided' };
      }

      // Clean source URI (remove quotes)
      const cleanedSource = cleanURI(source);

      // Check if it's a URL (starts with http/https)
      if (cleanedSource.startsWith('http://') || cleanedSource.startsWith('https://')) {
        console.log('[IPC] Opening URL:', cleanedSource);
        await shell.openExternal(cleanedSource);
      } else {
        // Try to open as file path
        console.log('[IPC] Opening file:', cleanedSource);
        const error = await shell.openPath(cleanedSource);
        if (error) {
          return { success: false, error };
        }
      }

      return { success: true };
    } catch (error) {
      console.error('[IPC] Open source error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Open native file picker
   * Handler: fs:pickFile
   */
  ipcMain.handle('fs:pickFile', async (event) => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        title: 'Select a file to index',
      });

      if (result.canceled) {
        return { success: false, canceled: true };
      }

      // Return the first selected file
      const filePath = result.filePaths[0];
      console.log('[IPC] File selected:', filePath);
      return { success: true, filePath };
    } catch (error) {
      console.error('[IPC] File picker error:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('[IPC] Database handlers registered');
}
