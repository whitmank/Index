import { ipcMain, BrowserWindow, shell, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
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

      const validTables = ['objects', 'relationships', 'tags', 'object_tags'];
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
   * Assign a tag to an object
   * Handler: db:assignTag
   */
  ipcMain.handle('db:assignTag', async (event, objectId, tagId) => {
    try {
      const db = getDatabase();
      if (!db) {
        throw new Error('Database not connected');
      }

      console.log('[IPC] Assign tag:', { objectId, tagId });

      // Check if object and tag exist
      const objResult = await db.query(`SELECT * FROM objects:${objectId}`);
      if (!objResult || !objResult[0] || objResult[0].length === 0) {
        throw new Error(`Object not found: ${objectId}`);
      }

      const tagResult = await db.query(`SELECT * FROM tags:${tagId}`);
      if (!tagResult || !tagResult[0] || tagResult[0].length === 0) {
        throw new Error(`Tag not found: ${tagId}`);
      }

      // Check if assignment already exists
      const existingResult = await db.query(
        `SELECT * FROM object_tags WHERE object_id = '${objectId}' AND tag_id = '${tagId}'`
      );
      if (existingResult[0] && existingResult[0].length > 0) {
        return { success: true, data: existingResult[0][0], message: 'Tag already assigned' };
      }

      // Create the assignment
      const result = await db.create('object_tags', {
        object_id: objectId,
        tag_id: tagId,
      });

      // Only persist object_tags (don't reload objects unnecessarily)
      const objectTagsData = await db.query('SELECT * FROM object_tags');
      const objectTags = (objectTagsData[0] || []);
      const indexDir = path.join(os.homedir(), '.index');
      fs.writeFileSync(
        path.join(indexDir, 'object_tags.json'),
        JSON.stringify(objectTags, null, 2),
        'utf-8'
      );

      return { success: true, data: result };
    } catch (error) {
      console.error('[IPC] Assign tag error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Unassign a tag from an object
   * Handler: db:unassignTag
   */
  ipcMain.handle('db:unassignTag', async (event, objectId, tagId) => {
    try {
      const db = getDatabase();
      if (!db) {
        throw new Error('Database not connected');
      }

      console.log('[IPC] Unassign tag:', { objectId, tagId });

      // Find and delete the assignment
      const result = await db.query(
        `DELETE FROM object_tags WHERE object_id = '${objectId}' AND tag_id = '${tagId}'`
      );

      // Only persist object_tags (don't reload objects unnecessarily)
      const objectTagsData = await db.query('SELECT * FROM object_tags');
      const objectTags = (objectTagsData[0] || []);
      const indexDir = path.join(os.homedir(), '.index');
      fs.writeFileSync(
        path.join(indexDir, 'object_tags.json'),
        JSON.stringify(objectTags, null, 2),
        'utf-8'
      );

      return { success: true, data: result };
    } catch (error) {
      console.error('[IPC] Unassign tag error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get all tags for an object
   * Handler: db:getTagsForObject
   */
  ipcMain.handle('db:getTagsForObject', async (event, objectId) => {
    try {
      const db = getDatabase();
      if (!db) {
        throw new Error('Database not connected');
      }

      console.log('[IPC] Get tags for object:', objectId);

      // Get all tag assignments for this object
      const result = await db.query(
        `SELECT tag_id FROM object_tags WHERE object_id = '${objectId}'`
      );

      const assignmentIds = (result[0] || []).map(a => a.tag_id);
      console.log('[IPC] Found', assignmentIds.length, 'tags for object');

      if (assignmentIds.length === 0) {
        return { success: true, data: [] };
      }

      // Fetch full tag objects
      let tagsResult;
      if (assignmentIds.length === 1) {
        tagsResult = await db.query(`SELECT * FROM tags:${assignmentIds[0]}`);
        const tags = tagsResult[0] || [];
        return { success: true, data: tags };
      } else {
        // For multiple tags, use IN query
        const inClause = `[${assignmentIds.map(id => `tags:${id}`).join(', ')}]`;
        tagsResult = await db.query(`SELECT * FROM ${inClause}`);
        const tags = tagsResult[0] || [];
        return { success: true, data: tags };
      }
    } catch (error) {
      console.error('[IPC] Get tags for object error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get all objects with a specific tag
   * Handler: db:getObjectsForTag
   */
  ipcMain.handle('db:getObjectsForTag', async (event, tagId) => {
    try {
      const db = getDatabase();
      if (!db) {
        throw new Error('Database not connected');
      }

      console.log('[IPC] Get objects for tag:', tagId);

      // Get all object assignments for this tag
      const result = await db.query(
        `SELECT object_id FROM object_tags WHERE tag_id = '${tagId}'`
      );

      const objectIds = (result[0] || []).map(a => a.object_id);

      if (objectIds.length === 0) {
        return { success: true, data: [] };
      }

      // Fetch full object details
      const objectsResult = await db.query(
        `SELECT * FROM objects WHERE id IN [${objectIds.map(id => `'${id}'`).join(', ')}]`
      );

      const objects = objectsResult[0] || [];
      return { success: true, data: objects };
    } catch (error) {
      console.error('[IPC] Get objects for tag error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Update a tag (name, color, description)
   * Handler: db:updateTag
   */
  ipcMain.handle('db:updateTag', async (event, tagId, tagData) => {
    try {
      const db = getDatabase();
      if (!db) {
        throw new Error('Database not connected');
      }

      console.log('[IPC] Update tag:', tagId, tagData);

      const updateObj = {};
      if (tagData.name !== undefined) updateObj.name = tagData.name;
      if (tagData.color !== undefined) updateObj.color = tagData.color;
      if (tagData.description !== undefined) updateObj.description = tagData.description;

      if (Object.keys(updateObj).length === 0) {
        throw new Error('No fields to update');
      }

      const result = await db.query(
        `UPDATE tags:${tagId} MERGE ${JSON.stringify(updateObj)}`
      );

      // Persist after update
      await persistToIndex(db);

      return { success: true, data: result };
    } catch (error) {
      console.error('[IPC] Update tag error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Delete a tag (and all its assignments)
   * Handler: db:deleteTag
   */
  ipcMain.handle('db:deleteTag', async (event, tagId) => {
    try {
      const db = getDatabase();
      if (!db) {
        throw new Error('Database not connected');
      }

      console.log('[IPC] Delete tag:', tagId);

      // Delete all assignments for this tag
      await db.query(`DELETE FROM object_tags WHERE tag_id = '${tagId}'`);

      // Delete the tag itself
      const result = await db.query(`DELETE FROM tags:${tagId}`);

      // Persist after deletion
      await persistToIndex(db);

      return { success: true, data: result };
    } catch (error) {
      console.error('[IPC] Delete tag error:', error);
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

      // Hide window after opening source
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
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
