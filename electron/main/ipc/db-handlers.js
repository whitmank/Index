// Author: Claude Code
// IPC handlers for database operations — v0.4.
// Changes from v0.3:
//   - persistToIndex() replaced by scheduleExport() everywhere
//   - normalizeRecord() applied at IPC boundary (no more id?.id in frontend)
//   - db:getTagTypes exposes system tag registry to renderer
//   - db:deleteTag enforces system tag deletion guard here, not in UI
//   - No broadcastObjectsChanged — LIVE SELECT handles reactivity

import { ipcMain, BrowserWindow, shell, dialog } from 'electron';
import { getDatabase } from '../db/connection.js';
import { scheduleExport } from '../db/export.js';
import { findOrCreateSystemTag } from '../db/services/system-tags.js';
import { extractMediaTypeFromSource, extractFileType, cleanUri, determineOrigin } from '../utils/metadata-extractor.js';
import { getDeviceOrigin } from '../config/device.js';
import { createObjectCore } from '../db/services/object-service.js';
import { normalizeRecord, normalizeRecords } from '../utils/normalize.js';
import { SYSTEM_TAG_TYPES, isSystemTagDeletable } from '../domain/tag-types.js';

let mainWindow = null;

export function setMainWindow(window) {
  mainWindow = window;
}

export function registerDbHandlers() {

  // ── GET ALL ────────────────────────────────────────────────────────────────

  ipcMain.handle('db:getAll', async (event, table) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');

      const validTables = ['objects', 'tag_definitions', 'tag_assignments', 'collections'];
      if (!validTables.includes(table)) throw new Error(`Invalid table: ${table}`);

      const result = await db.query(`SELECT * FROM ${table}`);
      const data = (Array.isArray(result) && result.length > 0) ? result[0] : [];

      return { success: true, data: normalizeRecords(data) };
    } catch (error) {
      console.error('[IPC] GetAll error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── TAG TYPES (domain registry) ────────────────────────────────────────────

  ipcMain.handle('db:getTagTypes', () => ({
    success: true,
    data: SYSTEM_TAG_TYPES,
  }));

  // ── CREATE OBJECT ──────────────────────────────────────────────────────────

  ipcMain.handle('db:createObject', async (event, objectData) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');

      if (Array.isArray(objectData.sources)) {
        const deviceOrigin = await getDeviceOrigin();
        const now = new Date().toISOString();
        objectData = {
          ...objectData,
          sources: objectData.sources.map(src => ({
            ...src,
            uri: cleanUri(src.uri),
            origin: determineOrigin(src.uri, src.origin || deviceOrigin || 'unknown'),
            added_at: src.added_at || now,
          })),
        };
      }

      const { object } = await createObjectCore(db, objectData);
      return { success: true, data: normalizeRecord(object) };
    } catch (error) {
      console.error('[IPC] Create object error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── DELETE OBJECT ──────────────────────────────────────────────────────────

  ipcMain.handle('db:deleteObject', async (event, id) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');

      await db.query(`DELETE ${id}`);
      scheduleExport(db);

      return { success: true };
    } catch (error) {
      console.error('[IPC] Delete object error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── UPDATE OBJECT ──────────────────────────────────────────────────────────

  ipcMain.handle('db:updateObject', async (event, id, objectData) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');

      const updateObj = {};

      if (objectData.name !== undefined) updateObj.name = objectData.name;
      if (objectData.label !== undefined) updateObj.label = objectData.label || null;
      if (objectData.user_metadata !== undefined) updateObj.user_metadata = objectData.user_metadata;

      if (objectData.sources !== undefined) {
        const rawSources = objectData.sources || [];
        const now = new Date().toISOString();
        const deviceOrigin = await getDeviceOrigin();
        updateObj.sources = rawSources.map(src => ({
          uri: cleanUri(src.uri),
          origin: determineOrigin(src.uri, src.origin || deviceOrigin || 'unknown'),
          fileType: extractFileType(src.uri),
          added_at: src.added_at || now,
        }));
        updateObj.updated_at = now;
      }

      const result = await db.query(`UPDATE ${id} MERGE ${JSON.stringify(updateObj)}`);
      scheduleExport(db);

      return { success: true, data: result };
    } catch (error) {
      console.error('[IPC] Update object error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── CREATE TAG ─────────────────────────────────────────────────────────────

  ipcMain.handle('db:createTag', async (event, tagData) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');

      const tagRecord = {
        name: tagData.name,
        type: tagData.type || null,
        color: tagData.color || null,
        description: tagData.description || null,
        system: tagData.system || false,
        created_at: new Date().toISOString(),
      };
      const result = await db.create('tag_definitions', tagRecord);
      scheduleExport(db);

      return { success: true, data: normalizeRecord(Array.isArray(result) ? result[0] : result) };
    } catch (error) {
      console.error('[IPC] Create tag error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── UPDATE TAG ─────────────────────────────────────────────────────────────

  ipcMain.handle('db:updateTag', async (event, tagId, tagData) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');

      const updateObj = {};
      if (tagData.name !== undefined) updateObj.name = tagData.name;
      if (tagData.color !== undefined) updateObj.color = tagData.color;
      if (tagData.type !== undefined) updateObj.type = tagData.type;
      if (tagData.description !== undefined) updateObj.description = tagData.description;

      if (Object.keys(updateObj).length === 0) throw new Error('No fields to update');

      const result = await db.query(`UPDATE ${tagId} MERGE ${JSON.stringify(updateObj)}`);
      scheduleExport(db);

      return { success: true, data: result };
    } catch (error) {
      console.error('[IPC] Update tag error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── DELETE TAG ─────────────────────────────────────────────────────────────
  // Domain rule enforced here: system tags marked deletable: false cannot be removed.

  ipcMain.handle('db:deleteTag', async (event, tagId) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');

      // Fetch tag to check system status
      const tagResult = await db.query(`SELECT * FROM ${tagId}`);
      const tag = tagResult[0]?.[0] || tagResult[0];

      if (tag && tag.system && !isSystemTagDeletable(tag.type)) {
        return { success: false, error: 'System tags cannot be deleted' };
      }

      await db.query(`DELETE FROM tag_assignments WHERE tag_id = '${tagId}'`);
      await db.query(`DELETE ${tagId}`);
      scheduleExport(db);

      return { success: true };
    } catch (error) {
      console.error('[IPC] Delete tag error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── ASSIGN TAG ─────────────────────────────────────────────────────────────

  ipcMain.handle('db:assignTag', async (event, objectId, tagId) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');

      const objResult = await db.query(`SELECT * FROM ${objectId}`);
      if (!objResult?.[0]?.length) throw new Error(`Object not found: ${objectId}`);

      const tagResult = await db.query(`SELECT * FROM ${tagId}`);
      if (!tagResult?.[0]?.length) throw new Error(`Tag not found: ${tagId}`);

      const existingResult = await db.query(
        `SELECT * FROM tag_assignments WHERE object_id = '${objectId}' AND tag_id = '${tagId}'`
      );
      if (existingResult[0] && existingResult[0].length > 0) {
        return { success: true, data: normalizeRecord(existingResult[0][0]), message: 'Tag already assigned' };
      }

      const result = await db.create('tag_assignments', { object_id: objectId, tag_id: tagId });
      scheduleExport(db);

      return { success: true, data: normalizeRecord(Array.isArray(result) ? result[0] : result) };
    } catch (error) {
      console.error('[IPC] Assign tag error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── UNASSIGN TAG ───────────────────────────────────────────────────────────

  ipcMain.handle('db:unassignTag', async (event, objectId, tagId) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');

      const result = await db.query(
        `DELETE FROM tag_assignments WHERE object_id = '${objectId}' AND tag_id = '${tagId}'`
      );
      scheduleExport(db);

      return { success: true, data: result };
    } catch (error) {
      console.error('[IPC] Unassign tag error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── GET TAGS FOR OBJECT ────────────────────────────────────────────────────

  ipcMain.handle('db:getTagsForObject', async (event, objectId) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');

      const result = await db.query(
        `SELECT tag_id FROM tag_assignments WHERE object_id = '${objectId}'`
      );
      const assignmentIds = (result[0] || []).map(a => a.tag_id);

      if (assignmentIds.length === 0) return { success: true, data: [] };

      let tagsResult;
      if (assignmentIds.length === 1) {
        tagsResult = await db.query(`SELECT * FROM ${assignmentIds[0]}`);
      } else {
        const inClause = `[${assignmentIds.join(', ')}]`;
        tagsResult = await db.query(`SELECT * FROM ${inClause}`);
      }

      return { success: true, data: normalizeRecords(tagsResult[0] || []) };
    } catch (error) {
      console.error('[IPC] Get tags for object error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── GET OBJECTS FOR TAG ────────────────────────────────────────────────────

  ipcMain.handle('db:getObjectsForTag', async (event, tagId) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');

      const result = await db.query(`SELECT object_id FROM tag_assignments WHERE tag_id = '${tagId}'`);
      const objectIds = (result[0] || []).map(a => a.object_id);

      if (objectIds.length === 0) return { success: true, data: [] };

      const objectsResult = await db.query(
        `SELECT * FROM objects WHERE id IN [${objectIds.join(', ')}]`
      );

      return { success: true, data: normalizeRecords(objectsResult[0] || []) };
    } catch (error) {
      console.error('[IPC] Get objects for tag error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── FIND OR CREATE SYSTEM TAG ──────────────────────────────────────────────

  ipcMain.handle('db:findOrCreateSystemTag', async (event, type, name) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');

      const tagId = await findOrCreateSystemTag(db, type, name);
      if (!tagId) throw new Error('Failed to find or create system tag');

      return { success: true, data: tagId };
    } catch (error) {
      console.error('[IPC] Find/create system tag error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── CREATE COLLECTION ──────────────────────────────────────────────────────

  ipcMain.handle('db:createCollection', async (event, collectionData) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');

      const { name, query } = collectionData;

      if (
        (!query.all || query.all.length === 0) &&
        (!query.any || query.any.length === 0) &&
        (!query.none || query.none.length === 0)
      ) {
        throw new Error('Collection must have at least one rule (all, any, or none)');
      }

      const now = new Date().toISOString();
      const allTagIds = [...(query.all || []), ...(query.any || []), ...(query.none || [])];

      const tagsResult = await db.query('SELECT * FROM tag_definitions');
      const existingTags = (Array.isArray(tagsResult) && tagsResult.length > 0) ? tagsResult[0] : [];
      const existingTagIds = new Set(existingTags.map(t => t.id?.toString?.() ?? t.id));

      const warnings = allTagIds.filter(tagId => !existingTagIds.has(tagId)).map(tagId => `Tag '${tagId}' not found`);

      const collectionRecord = {
        name,
        query: {
          all: query.all || [],
          any: query.any || [],
          none: query.none || [],
        },
        pinned: false,
        created_at: now,
        updated_at: now,
      };

      const result = await db.query(`CREATE collections CONTENT ${JSON.stringify(collectionRecord)}`);
      scheduleExport(db);

      const created = result[0]?.[0] || result[0];
      return {
        success: true,
        data: normalizeRecord(created),
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      console.error('[IPC] Create collection error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── UPDATE COLLECTION ──────────────────────────────────────────────────────

  ipcMain.handle('db:updateCollection', async (event, collectionId, updates) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');

      const { query, name, order } = updates;

      if (query && (!query.all?.length && !query.any?.length && !query.none?.length)) {
        throw new Error('Collection must have at least one rule (all, any, or none)');
      }

      const updateObj = { updated_at: new Date().toISOString() };
      if (name !== undefined) updateObj.name = name;
      if (query !== undefined) {
        updateObj.query = {
          all: query.all || [],
          any: query.any || [],
          none: query.none || [],
        };
      }
      if (order !== undefined) updateObj.order = order;

      const result = await db.query(`UPDATE ${collectionId} MERGE ${JSON.stringify(updateObj)}`);
      scheduleExport(db);

      return { success: true, data: result };
    } catch (error) {
      console.error('[IPC] Update collection error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── DELETE COLLECTION ──────────────────────────────────────────────────────

  ipcMain.handle('db:deleteCollection', async (event, collectionId) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');

      await db.query(`DELETE ${collectionId}`);
      scheduleExport(db);

      return { success: true };
    } catch (error) {
      console.error('[IPC] Delete collection error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── EVALUATE COLLECTION ────────────────────────────────────────────────────

  ipcMain.handle('db:evaluateCollection', async (event, collectionId) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');

      let collectionResult = await db.query(`SELECT * FROM ${collectionId}`);
      let collection = collectionResult;
      if (Array.isArray(collection) && collection.length > 0) collection = collection[0];
      if (Array.isArray(collection) && collection.length > 0) collection = collection[0];

      if (!collection) throw new Error(`Collection ${collectionId} not found`);

      const query = {
        all: collection.query?.all || [],
        any: collection.query?.any || [],
        none: collection.query?.none || [],
      };

      const objectsResult = await db.query('SELECT * FROM objects');
      const allObjects = (Array.isArray(objectsResult) && objectsResult.length > 0) ? objectsResult[0] : [];

      const tagsResult = await db.query('SELECT * FROM tag_assignments');
      const allTags = (Array.isArray(tagsResult) && tagsResult.length > 0) ? tagsResult[0] : [];

      const objectTagMap = new Map();
      allTags.forEach(assignment => {
        const objId = assignment.object_id;
        if (!objectTagMap.has(objId)) objectTagMap.set(objId, new Set());
        objectTagMap.get(objId).add(assignment.tag_id);
      });

      const matchingObjects = allObjects.filter(obj => {
        const objId = obj.id?.toString?.() ?? obj.id;
        const tags = objectTagMap.get(objId) || new Set();

        if (query.all.length > 0 && !query.all.every(t => tags.has(t))) return false;
        if (query.any.length > 0 && !query.any.some(t => tags.has(t))) return false;
        if (query.none.length > 0 && query.none.some(t => tags.has(t))) return false;

        return true;
      });

      return { success: true, data: normalizeRecords(matchingObjects) };
    } catch (error) {
      console.error('[IPC] Evaluate collection error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── REPAIR SYSTEM TAGS ─────────────────────────────────────────────────────

  ipcMain.handle('db:repairMissingSystemTags', async (event, objectId) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');

      const objectResult = await db.query(`SELECT * FROM ${objectId}`);
      const object = (Array.isArray(objectResult) && objectResult.length > 0) ? objectResult[0] : null;

      if (!object) throw new Error(`Object ${objectId} not found`);

      const sources = (Array.isArray(object) ? object[0] : object)?.sources || [];
      if (sources.length === 0) return { success: true, data: { repaired: [] } };

      const tagsResult = await db.query(`SELECT tag_id FROM tag_assignments WHERE object_id = '${objectId}'`);
      const assignedTagIds = (tagsResult[0] || []).map(a => a.tag_id);

      let assignedTags = [];
      if (assignedTagIds.length > 0) {
        const inClause = `[${assignedTagIds.join(', ')}]`;
        const fullTagsResult = await db.query(`SELECT * FROM ${inClause}`);
        assignedTags = fullTagsResult[0] || [];
      }

      const currentSystemTagTypes = new Set(
        assignedTags.filter(t => t.system === true && t.type).map(t => t.type)
      );

      const missingTypes = ['media_type', 'file_type', 'origin'].filter(t => !currentSystemTagTypes.has(t));
      if (missingTypes.length === 0) return { success: true, data: { repaired: [] } };

      const repaired = [];
      const { extractMediaTypeFromSource, extractFileType } = await import('../utils/metadata-extractor.js');
      const { findOrCreateSystemTag } = await import('../db/services/system-tags.js');

      for (const type of missingTypes) {
        if (type === 'media_type') {
          const mediaType = extractMediaTypeFromSource(sources[0].uri);
          const tagId = await findOrCreateSystemTag(db, type, mediaType);
          if (tagId) {
            const ex = await db.query(`SELECT * FROM tag_assignments WHERE object_id = '${objectId}' AND tag_id = '${tagId}'`);
            if (!ex[0] || ex[0].length === 0) {
              await db.create('tag_assignments', { object_id: objectId, tag_id: tagId });
              repaired.push({ type, value: mediaType || null });
            }
          }
        } else if (type === 'file_type') {
          const uniqueFileTypes = new Set(sources.map(s => extractFileType(s.uri)).filter(Boolean));
          for (const fileType of uniqueFileTypes) {
            const tagId = await findOrCreateSystemTag(db, type, fileType);
            if (tagId) {
              const ex = await db.query(`SELECT * FROM tag_assignments WHERE object_id = '${objectId}' AND tag_id = '${tagId}'`);
              if (!ex[0] || ex[0].length === 0) {
                await db.create('tag_assignments', { object_id: objectId, tag_id: tagId });
                repaired.push({ type, value: fileType });
              }
            }
          }
        } else if (type === 'origin') {
          const uniqueOrigins = new Set(sources.map(s => s.origin).filter(Boolean));
          for (const origin of uniqueOrigins) {
            const tagId = await findOrCreateSystemTag(db, type, origin);
            if (tagId) {
              const ex = await db.query(`SELECT * FROM tag_assignments WHERE object_id = '${objectId}' AND tag_id = '${tagId}'`);
              if (!ex[0] || ex[0].length === 0) {
                await db.create('tag_assignments', { object_id: objectId, tag_id: tagId });
                repaired.push({ type, value: origin });
              }
            }
          }
        }
      }

      scheduleExport(db);
      return { success: true, data: { repaired } };
    } catch (error) {
      console.error('[IPC] Repair system tags error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── OPEN SOURCE ────────────────────────────────────────────────────────────

  ipcMain.handle('app:openSource', async (event, source) => {
    try {
      if (!source) return { success: false, error: 'No source provided' };

      const cleanedSource = cleanUri(source);

      if (cleanedSource.startsWith('http://') || cleanedSource.startsWith('https://')) {
        await shell.openExternal(cleanedSource);
      } else if (cleanedSource.startsWith('file://')) {
        const filePath = cleanedSource.replace(/^file:\/\//, '');
        const error = await shell.openPath(filePath);
        if (error) return { success: false, error };
      } else {
        const error = await shell.openPath(cleanedSource);
        if (error) return { success: false, error };
      }

      return { success: true };
    } catch (error) {
      console.error('[IPC] Open source error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── FILE PICKER ────────────────────────────────────────────────────────────

  ipcMain.handle('fs:pickFile', async (event) => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        title: 'Select a file to index',
      });

      if (result.canceled) return { success: false, canceled: true };

      return { success: true, filePath: result.filePaths[0] };
    } catch (error) {
      console.error('[IPC] File picker error:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('[IPC] Database handlers registered');
}
