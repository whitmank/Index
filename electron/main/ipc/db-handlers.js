import { ipcMain, BrowserWindow, shell, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getDatabase } from '../db/index.js';
import { persistToIndex } from '../db/persistence.js';
import { findOrCreateSystemTag } from '../db/system-tags.js';
import { extractMediaTypeFromSource, extractFileType, cleanUri, determineOrigin } from '../utils/metadata-extractor.js';
import { getDeviceOrigin } from '../config/device.js';

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

      const validTables = ['objects', 'tag_definitions', 'tag_assignments', 'collections'];
      if (!validTables.includes(table)) {
        throw new Error(`Invalid table: ${table}`);
      }

      const result = await db.query(`SELECT * FROM ${table}`);
      const data = (Array.isArray(result) && result.length > 0) ? result[0] : [];

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


      // Accept sources array (can be empty)
      const rawSources = objectData.sources || [];
      const now = new Date().toISOString();
      const deviceOrigin = await getDeviceOrigin();

      // Clean each URI, determine origin and file type, and ensure added_at timestamp
      const sources = rawSources.map(src => ({
        uri: cleanUri(src.uri),
        origin: determineOrigin(src.uri, src.origin || deviceOrigin || 'unknown'),
        fileType: extractFileType(src.uri),
        added_at: src.added_at || now,
      }));

      const objectRecord = {
        name: objectData.name,
        description: objectData.description || null,
        sources,
        created_at: now,
        updated_at: now,
      };

      const result = await db.create('objects', objectRecord);
      const newObject = Array.isArray(result) ? result[0] : result;
      const objectId = (newObject.id && newObject.id.id) || newObject.id;

      // Assign system tags based on sources
      await assignSystemTagsFromSources(db, objectId, sources);

      // Persist after creation
      await persistToIndex(db);

      return { success: true, data: result };
    } catch (error) {
      console.error('[IPC] Create object error:', error);
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

      const tagRecord = {
        name: tagData.name,
        type: tagData.type || null,
        color: tagData.color || null,
        description: tagData.description || null,
        system: tagData.system || false,
        created_at: new Date().toISOString(),
      };
      const result = await db.create('tag_definitions', tagRecord);

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


      // Prepare update object
      const updateObj = {};

      // Handle name updates
      if (objectData.name !== undefined) {
        updateObj.name = objectData.name;
      }

      // Handle user metadata updates
      if (objectData.user_metadata !== undefined) {
        updateObj.user_metadata = objectData.user_metadata;
      }

      // Handle sources array updates (v2 data model)
      if (objectData.sources !== undefined) {
        const rawSources = objectData.sources || [];
        const now = new Date().toISOString();
        const deviceOrigin = await getDeviceOrigin();
        // Clean, determine origin and file type, and ensure all sources have required fields
        updateObj.sources = rawSources.map(src => ({
          uri: cleanUri(src.uri),
          origin: determineOrigin(src.uri, src.origin || deviceOrigin || 'unknown'),
          fileType: extractFileType(src.uri),
          added_at: src.added_at || now,
        }));
        updateObj.updated_at = now;
      }

      // If source changed, re-derive source metadata (legacy support)
      if (objectData.source !== undefined) {
        const cleanedSource = objectData.source ? cleanUri(objectData.source) : null;
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


      // Check if object and tag exist
      const objResult = await db.query(`SELECT * FROM objects:${objectId}`);
      if (!objResult || !objResult[0] || objResult[0].length === 0) {
        throw new Error(`Object not found: ${objectId}`);
      }

      const tagResult = await db.query(`SELECT * FROM tag_definitions:${tagId}`);
      if (!tagResult || !tagResult[0] || tagResult[0].length === 0) {
        throw new Error(`Tag not found: ${tagId}`);
      }

      // Check if assignment already exists
      const existingResult = await db.query(
        `SELECT * FROM tag_assignments WHERE object_id = '${objectId}' AND tag_id = '${tagId}'`
      );
      if (existingResult[0] && existingResult[0].length > 0) {
        return { success: true, data: existingResult[0][0], message: 'Tag already assigned' };
      }

      // Create the assignment
      const result = await db.create('tag_assignments', {
        object_id: objectId,
        tag_id: tagId,
      });

      // Only persist tag_assignments (don't reload objects unnecessarily)
      const tagAssignmentsData = await db.query('SELECT * FROM tag_assignments');
      const tagAssignments = (tagAssignmentsData[0] || []);
      const indexDir = path.join(os.homedir(), '.index');
      fs.writeFileSync(
        path.join(indexDir, 'tag_assignments.json'),
        JSON.stringify(tagAssignments, null, 2),
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


      // Find and delete the assignment
      const result = await db.query(
        `DELETE FROM tag_assignments WHERE object_id = '${objectId}' AND tag_id = '${tagId}'`
      );

      // Only persist tag_assignments (don't reload objects unnecessarily)
      const tagAssignmentsData = await db.query('SELECT * FROM tag_assignments');
      const tagAssignments = (tagAssignmentsData[0] || []);
      const indexDir = path.join(os.homedir(), '.index');
      fs.writeFileSync(
        path.join(indexDir, 'tag_assignments.json'),
        JSON.stringify(tagAssignments, null, 2),
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


      // Get all tag assignments for this object
      const result = await db.query(
        `SELECT tag_id FROM tag_assignments WHERE object_id = '${objectId}'`
      );

      const assignmentIds = (result[0] || []).map(a => a.tag_id);

      if (assignmentIds.length === 0) {
        return { success: true, data: [] };
      }

      // Fetch full tag objects
      let tagsResult;
      if (assignmentIds.length === 1) {
        tagsResult = await db.query(`SELECT * FROM tag_definitions:${assignmentIds[0]}`);
        const tags = tagsResult[0] || [];
        return { success: true, data: tags };
      } else {
        // For multiple tags, use IN query
        const inClause = `[${assignmentIds.map(id => `tag_definitions:${id}`).join(', ')}]`;
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


      // Get all object assignments for this tag
      const result = await db.query(
        `SELECT object_id FROM tag_assignments WHERE tag_id = '${tagId}'`
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
   * Update a tag (name, color, type, description)
   * Handler: db:updateTag
   */
  ipcMain.handle('db:updateTag', async (event, tagId, tagData) => {
    try {
      const db = getDatabase();
      if (!db) {
        throw new Error('Database not connected');
      }


      const updateObj = {};
      if (tagData.name !== undefined) updateObj.name = tagData.name;
      if (tagData.color !== undefined) updateObj.color = tagData.color;
      if (tagData.type !== undefined) updateObj.type = tagData.type;
      if (tagData.description !== undefined) updateObj.description = tagData.description;

      if (Object.keys(updateObj).length === 0) {
        throw new Error('No fields to update');
      }

      const result = await db.query(
        `UPDATE tag_definitions:${tagId} MERGE ${JSON.stringify(updateObj)}`
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


      // Delete all assignments for this tag
      await db.query(`DELETE FROM tag_assignments WHERE tag_id = '${tagId}'`);

      // Delete the tag itself
      const result = await db.query(`DELETE FROM tag_definitions:${tagId}`);

      // Persist after deletion
      await persistToIndex(db);

      return { success: true, data: result };
    } catch (error) {
      console.error('[IPC] Delete tag error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Create a new collection (saved query)
   * Handler: db:createCollection
   */
  ipcMain.handle('db:createCollection', async (event, collectionData) => {
    try {
      const db = getDatabase();
      if (!db) {
        throw new Error('Database not connected');
      }

      const { name, query } = collectionData;

      // Validate: reject if query is empty (all three arrays empty)
      if (
        (!query.all || query.all.length === 0) &&
        (!query.any || query.any.length === 0) &&
        (!query.none || query.none.length === 0)
      ) {
        throw new Error('Collection must have at least one rule (all, any, or none)');
      }

      // Soft validate: check if tag IDs exist
      const allTagIds = [...(query.all || []), ...(query.any || []), ...(query.none || [])];
      const tagsResult = await db.query('SELECT * FROM tag_definitions');
      const existingTags = (Array.isArray(tagsResult) && tagsResult.length > 0) ? tagsResult[0] : [];
      const existingTagIds = new Set(existingTags.map((t) => {
        const tagId = (t.id && t.id.id) || t.id;
        return typeof tagId === 'string' ? tagId.split(':')[1] : tagId;
      }));

      const warnings = [];
      allTagIds.forEach((tagId) => {
        if (!existingTagIds.has(tagId)) {
          warnings.push(`Tag '${tagId}' not found`);
        }
      });

      // Helper to extract plain ID from RecordId or string
      const extractPlainId = (id) => {
        if (typeof id === 'object' && id.id) {
          return id.id;
        }
        if (typeof id === 'string' && id.includes(':')) {
          return id.split(':')[1];
        }
        return id;
      };

      // Create collection with timestamps
      const now = new Date().toISOString();
      const collectionRecord = {
        name,
        query: {
          all: (query.all || []).map(extractPlainId),
          any: (query.any || []).map(extractPlainId),
          none: (query.none || []).map(extractPlainId),
        },
        pinned: false,
        created_at: now,
        updated_at: now,
      };


      const result = await db.query(
        `CREATE collections CONTENT ${JSON.stringify(collectionRecord)}`
      );


      // Persist after creation
      await persistToIndex(db);

      return { success: true, data: result, warnings: warnings.length > 0 ? warnings : undefined };
    } catch (error) {
      console.error('[IPC] Create collection error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Update a collection (name or query)
   * Handler: db:updateCollection
   */
  ipcMain.handle('db:updateCollection', async (event, collectionId, updates) => {
    try {
      const db = getDatabase();
      if (!db) {
        throw new Error('Database not connected');
      }

      // Extract plain ID if passed as RecordId object
      let plainCollectionId = collectionId;
      if (typeof collectionId === 'object' && collectionId.id) {
        plainCollectionId = collectionId.id;
      }

      const { query, name, order } = updates;

      // Validate: reject if query is empty (if provided)
      if (query) {
        if (
          (!query.all || query.all.length === 0) &&
          (!query.any || query.any.length === 0) &&
          (!query.none || query.none.length === 0)
        ) {
          throw new Error('Collection must have at least one rule (all, any, or none)');
        }
      }

      // Soft validate: check if tag IDs exist
      let warnings = [];
      if (query) {
        const allTagIds = [...(query.all || []), ...(query.any || []), ...(query.none || [])];
        const tagsResult = await db.query('SELECT * FROM tag_definitions');
        const existingTags = (Array.isArray(tagsResult) && tagsResult.length > 0) ? tagsResult[0] : [];
        const existingTagIds = new Set(existingTags.map((t) => {
          const tagId = (t.id && t.id.id) || t.id;
          return typeof tagId === 'string' ? tagId.split(':')[1] : tagId;
        }));

        allTagIds.forEach((tagId) => {
          if (!existingTagIds.has(tagId)) {
            warnings.push(`Tag '${tagId}' not found`);
          }
        });
      }

      // Helper to extract plain ID from RecordId or string
      const extractPlainId = (id) => {
        if (typeof id === 'object' && id.id) {
          return id.id;
        }
        if (typeof id === 'string' && id.includes(':')) {
          return id.split(':')[1];
        }
        return id;
      };

      // Build update object
      const updateObj = {
        updated_at: new Date().toISOString(),
      };
      if (name !== undefined) updateObj.name = name;
      if (query !== undefined) {
        updateObj.query = {
          all: (query.all || []).map(extractPlainId),
          any: (query.any || []).map(extractPlainId),
          none: (query.none || []).map(extractPlainId),
        };
      }
      if (order !== undefined) updateObj.order = order;


      const result = await db.query(
        `UPDATE collections:${plainCollectionId} MERGE ${JSON.stringify(updateObj)}`
      );

      // Persist after update
      await persistToIndex(db);

      return { success: true, data: result, warnings: warnings.length > 0 ? warnings : undefined };
    } catch (error) {
      console.error('[IPC] Update collection error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Delete a collection
   * Handler: db:deleteCollection
   */
  ipcMain.handle('db:deleteCollection', async (event, collectionId) => {
    try {
      const db = getDatabase();
      if (!db) {
        throw new Error('Database not connected');
      }

      // Extract plain ID if passed as RecordId object
      let plainCollectionId = collectionId;
      if (typeof collectionId === 'object' && collectionId.id) {
        plainCollectionId = collectionId.id;
      }


      // Delete the collection
      const result = await db.query(`DELETE FROM collections:${plainCollectionId}`);

      // Persist after deletion
      await persistToIndex(db);

      return { success: true, data: result };
    } catch (error) {
      console.error('[IPC] Delete collection error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Evaluate a collection query and return matching objects
   * Handler: db:evaluateCollection
   */
  ipcMain.handle('db:evaluateCollection', async (event, collectionId) => {
    try {
      const db = getDatabase();
      if (!db) {
        throw new Error('Database not connected');
      }

      // Extract plain ID if passed as RecordId object
      let plainCollectionId = collectionId;
      if (typeof collectionId === 'object' && collectionId.id) {
        plainCollectionId = collectionId.id;
      }

      // Fetch collection by ID
      let collectionResult = await db.query(`SELECT * FROM collections:${plainCollectionId}`);

      // SurrealDB returns [[{record}]] - unwrap twice
      let collection = collectionResult;
      if (Array.isArray(collection) && collection.length > 0) {
        collection = collection[0];
      }
      if (Array.isArray(collection) && collection.length > 0) {
        collection = collection[0];
      }

      if (!collection) {
        throw new Error(`Collection ${plainCollectionId} not found`);
      }

      let query = collection.query || {};

      // Normalize query tag IDs - convert RecordId objects to plain strings
      const normalizeTagId = (id) => {
        if (typeof id === 'object' && id.id) {
          return id.id;
        }
        if (typeof id === 'string' && id.includes(':')) {
          return id.split(':')[1];
        }
        return id;
      };

      query = {
        all: (query.all || []).map(normalizeTagId),
        any: (query.any || []).map(normalizeTagId),
        none: (query.none || []).map(normalizeTagId),
      };

      // Get all objects
      const objectsResult = await db.query('SELECT * FROM objects');
      const allObjects = (Array.isArray(objectsResult) && objectsResult.length > 0) ? objectsResult[0] : [];

      // Get all tag_assignments
      const tagsResult = await db.query('SELECT * FROM tag_assignments');
      const allTags = (Array.isArray(tagsResult) && tagsResult.length > 0) ? tagsResult[0] : [];

      // Build map: objectId -> Set<tagId>
      const objectTagMap = new Map();
      allTags.forEach((assignment) => {
        const objId = assignment.object_id;
        const tagId = assignment.tag_id;

        if (!objectTagMap.has(objId)) {
          objectTagMap.set(objId, new Set());
        }
        objectTagMap.get(objId).add(tagId);
      });

      // Filter objects based on query
      const matchingObjects = allObjects.filter((obj) => {
        const objId = (obj.id && obj.id.id) || obj.id;
        const tags = objectTagMap.get(objId) || new Set();

        // ALL: object must have every tag in query.all
        if (query.all && query.all.length > 0) {
          if (!query.all.every((t) => tags.has(t))) {
            return false;
          }
        }

        // ANY: object must have at least one tag in query.any
        if (query.any && query.any.length > 0) {
          if (!query.any.some((t) => tags.has(t))) {
            return false;
          }
        }

        // NONE: object must not have any tag in query.none
        if (query.none && query.none.length > 0) {
          if (query.none.some((t) => tags.has(t))) {
            return false;
          }
        }

        return true;
      });

      return { success: true, data: matchingObjects };
    } catch (error) {
      console.error('[IPC] Evaluate collection error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Find or create a system tag with given type and name
   * Handler: db:findOrCreateSystemTag
   */
  ipcMain.handle('db:findOrCreateSystemTag', async (event, type, name) => {
    try {
      const db = getDatabase();
      if (!db) {
        throw new Error('Database not connected');
      }

      const tagId = await findOrCreateSystemTag(db, type, name);
      if (!tagId) {
        throw new Error('Failed to find or create system tag');
      }

      return { success: true, data: tagId };
    } catch (error) {
      console.error('[IPC] Find/create system tag error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Repair missing system tags for an object
   * Checks what system tags should exist and recreates any that are missing
   * Handler: db:repairMissingSystemTags
   */
  ipcMain.handle('db:repairMissingSystemTags', async (event, objectId) => {
    try {
      const db = getDatabase();
      if (!db) {
        throw new Error('Database not connected');
      }


      // Get the object
      const objectResult = await db.query(`SELECT * FROM objects:${objectId}`);
      const object = (Array.isArray(objectResult) && objectResult.length > 0) ? objectResult[0] : null;

      if (!object) {
        throw new Error(`Object ${objectId} not found`);
      }

      const sources = object.sources || [];
      if (sources.length === 0) {
        return { success: true, data: { repaired: [] } };
      }

      // Get current tags for this object
      const tagsResult = await db.query(
        `SELECT tag_id FROM tag_assignments WHERE object_id = '${objectId}'`
      );
      const assignedTagIds = (tagsResult[0] || []).map(a => a.tag_id);

      // Fetch the actual tags to check which types are assigned
      let assignedTags = [];
      if (assignedTagIds.length > 0) {
        const inClause = `[${assignedTagIds.map(id => `tag_definitions:${id}`).join(', ')}]`;
        const fullTagsResult = await db.query(`SELECT * FROM ${inClause}`);
        assignedTags = fullTagsResult[0] || [];
      }

      const currentSystemTagTypes = new Set(
        assignedTags
          .filter((t) => t.system === true && t.type)
          .map((t) => t.type)
      );

      const expectedTypes = ['media_type', 'file_type', 'origin'];
      const missingTypes = expectedTypes.filter((type) => !currentSystemTagTypes.has(type));

      if (missingTypes.length === 0) {
        return { success: true, data: { repaired: [] } };
      }


      const repaired = [];

      // Regenerate missing system tags
      for (const type of missingTypes) {
        if (type === 'media_type') {
          // Object-level, from first source only
          const mediaType = extractMediaTypeFromSource(sources[0].uri);
          const tagId = await findOrCreateSystemTag(db, type, mediaType);
          if (tagId) {
            const existingResult = await db.query(
              `SELECT * FROM tag_assignments WHERE object_id = '${objectId}' AND tag_id = '${tagId}'`
            );
            if (!existingResult[0] || existingResult[0].length === 0) {
              await db.create('tag_assignments', {
                object_id: objectId,
                tag_id: tagId,
              });
              repaired.push({ type, value: mediaType || null });
            }
          }
        } else if (type === 'file_type') {
          // Per-source, unique extensions
          const uniqueFileTypes = new Set(sources.map(s => extractFileType(s.uri)).filter(Boolean));
          for (const fileType of uniqueFileTypes) {
            const tagId = await findOrCreateSystemTag(db, type, fileType);
            if (tagId) {
              const existingResult = await db.query(
                `SELECT * FROM tag_assignments WHERE object_id = '${objectId}' AND tag_id = '${tagId}'`
              );
              if (!existingResult[0] || existingResult[0].length === 0) {
                await db.create('tag_assignments', {
                  object_id: objectId,
                  tag_id: tagId,
                });
                repaired.push({ type, value: fileType });
              }
            }
          }
        } else if (type === 'origin') {
          // Per-source, unique device origins
          const uniqueOrigins = new Set(sources.map(s => s.origin).filter(Boolean));
          for (const origin of uniqueOrigins) {
            const tagId = await findOrCreateSystemTag(db, type, origin);
            if (tagId) {
              const existingResult = await db.query(
                `SELECT * FROM tag_assignments WHERE object_id = '${objectId}' AND tag_id = '${tagId}'`
              );
              if (!existingResult[0] || existingResult[0].length === 0) {
                await db.create('tag_assignments', {
                  object_id: objectId,
                  tag_id: tagId,
                });
                repaired.push({ type, value: origin });
              }
            }
          }
        }
      }

      // Persist changes
      await persistToIndex(db);

      return { success: true, data: { repaired } };
    } catch (error) {
      console.error('[IPC] Repair system tags error:', error);
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
      const cleanedSource = cleanUri(source);

      // Check if it's a URL (starts with http/https)
      if (cleanedSource.startsWith('http://') || cleanedSource.startsWith('https://')) {
        console.log('[IPC] Opening URL:', cleanedSource);
        await shell.openExternal(cleanedSource);
      } else if (cleanedSource.startsWith('file://')) {
        // Strip file:// to get local path for openPath
        const filePath = cleanedSource.replace(/^file:\/\//, '');
        console.log('[IPC] Opening file:', filePath);
        const error = await shell.openPath(filePath);
        if (error) {
          return { success: false, error };
        }
      } else {
        // Assume raw local path (backward compat)
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
      return { success: true, filePath };
    } catch (error) {
      console.error('[IPC] File picker error:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('[IPC] Database handlers registered');
}

/**
 * Assign system tags from sources array
 * Derives media_type (object-level), file_type (per-source), origin (per-source)
 * @private
 */
async function assignSystemTagsFromSources(db, objectId, sources) {
  try {
    if (!sources || sources.length === 0) return;

    // 1. media_type — object-level, from first source only
    const mediaType = extractMediaTypeFromSource(sources[0].uri);
    const mediaTypeTagId = await findOrCreateSystemTag(db, 'media_type', mediaType);
    if (mediaTypeTagId) {
      const existingResult = await db.query(
        `SELECT * FROM tag_assignments WHERE object_id = '${objectId}' AND tag_id = '${mediaTypeTagId}'`
      );
      if (!existingResult[0] || existingResult[0].length === 0) {
        await db.create('tag_assignments', {
          object_id: objectId,
          tag_id: mediaTypeTagId,
        });
      }
    }

    // 2. file_type — per-source, unique extensions
    const uniqueFileTypes = new Set(sources.map(s => extractFileType(s.uri)).filter(Boolean));
    for (const fileType of uniqueFileTypes) {
      const fileTypeTagId = await findOrCreateSystemTag(db, 'file_type', fileType);
      if (fileTypeTagId) {
        const existingResult = await db.query(
          `SELECT * FROM tag_assignments WHERE object_id = '${objectId}' AND tag_id = '${fileTypeTagId}'`
        );
        if (!existingResult[0] || existingResult[0].length === 0) {
          await db.create('tag_assignments', {
            object_id: objectId,
            tag_id: fileTypeTagId,
          });
        }
      }
    }

    // 3. origin — per-source, unique device origins
    const uniqueOrigins = new Set(sources.map(s => s.origin).filter(Boolean));
    for (const origin of uniqueOrigins) {
      const originTagId = await findOrCreateSystemTag(db, 'origin', origin);
      if (originTagId) {
        const existingResult = await db.query(
          `SELECT * FROM tag_assignments WHERE object_id = '${objectId}' AND tag_id = '${originTagId}'`
        );
        if (!existingResult[0] || existingResult[0].length === 0) {
          await db.create('tag_assignments', {
            object_id: objectId,
            tag_id: originTagId,
          });
        }
      }
    }
  } catch (error) {
    console.error('[IPC] Error assigning system tags:', error);
  }
}
