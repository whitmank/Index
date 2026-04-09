// Author: Claude Code
// IPC handlers for database operations.
// All tag assignments and containment are expressed as RELATE edges.
// Spaces are objects with space: true — no separate table.

import { ipcMain, BrowserWindow, shell, dialog } from 'electron';
import { getDatabase } from '../db/connection.js';
import { scheduleExport } from '../db/export.js';
import { findOrCreateSystemTag } from '../db/services/system-tags.js';
import { extractMediaTypeFromSource, extractFileType, cleanUri, determineOrigin } from '../utils/metadata-extractor.js';
import { getDeviceOrigin } from '../config/device.js';
import { createObjectCore } from '../db/services/object-service.js';
import { syncSourcedFromEdges, findOrCreateDevice } from '../db/services/device-service.js';
import { evaluateSpace } from '../db/services/space-service.js';
import { normalizeRecord, normalizeRecords } from '../utils/normalize.js';
import { isSystemTagDeletable } from '../domain/tag-types.js';
import { escId } from '../db/surreal-utils.js';

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

      const validTables = ['objects', 'tag_definitions', 'tag_types', 'tagged', 'contains', 'excludes', 'typed'];
      if (!validTables.includes(table)) throw new Error(`Invalid table: ${table}`);

      const result = await db.query(`SELECT * FROM ${table}`);
      const data = (Array.isArray(result) && result.length > 0) ? result[0] : [];

      return { success: true, data: normalizeRecords(data) };
    } catch (error) {
      console.error('[IPC] GetAll error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── TAG TYPES ──────────────────────────────────────────────────────────────

  ipcMain.handle('db:getTagTypes', async () => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');
      const result = await db.query(`SELECT * FROM tag_types ORDER BY \`order\``);
      const data = (Array.isArray(result) && result.length > 0) ? result[0] : [];
      return { success: true, data: normalizeRecords(data) };
    } catch (error) {
      console.error('[IPC] GetTagTypes error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:createTagType', async (event, data) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');
      const trimmedName = data.name.trim();

      // Case-insensitive dedup — return existing if name already taken
      const dupCheck = await db.query(
        `SELECT id FROM tag_types WHERE string::lowercase(name) = string::lowercase('${trimmedName.replace(/'/g, "\\'")}')`
      );
      if (dupCheck[0]?.length > 0) {
        const existing = normalizeRecord(dupCheck[0][0]);
        return { success: true, data: existing };
      }

      const record = {
        name: trimmedName,
        label: data.label?.trim() || trimmedName,
        system: false,
        display: true,
        editable: true,
        deletable: true,
        order: data.order ?? 99,
      };
      const result = await db.create('tag_types', record);
      scheduleExport(db);
      return { success: true, data: normalizeRecord(Array.isArray(result) ? result[0] : result) };
    } catch (error) {
      console.error('[IPC] Create tag type error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:updateTagType', async (event, typeId, data) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');
      const updateObj = {};
      if (data.label     !== undefined) updateObj.label     = data.label;
      if (data.display   !== undefined) updateObj.display   = data.display;
      if (data.editable  !== undefined) updateObj.editable  = data.editable;
      if (data.deletable !== undefined) updateObj.deletable = data.deletable;
      if (Object.keys(updateObj).length === 0) throw new Error('No fields to update');
      const result = await db.query(`UPDATE ${typeId} MERGE ${JSON.stringify(updateObj)}`);
      scheduleExport(db);
      return { success: true, data: result };
    } catch (error) {
      console.error('[IPC] Update tag type error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:deleteTagType', async (event, typeId) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');
      // Remove all typed edges pointing to this type, then delete the type record
      await db.query(`DELETE FROM typed WHERE out = ${typeId}`);
      await db.query(`DELETE ${typeId}`);
      scheduleExport(db);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Delete tag type error:', error);
      return { success: false, error: error.message };
    }
  });

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

      if (objectData.sources !== undefined) {
        await syncSourcedFromEdges(db, id, updateObj.sources);
      }

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

      const trimmedTagName = tagData.name?.trim();

      // Case-insensitive dedup — scoped to type when typeId is provided
      if (trimmedTagName) {
        const nameClause = `name IS NOT NONE AND name IS NOT NULL AND string::lowercase(name) = string::lowercase('${trimmedTagName.replace(/'/g, "\\'")}') AND system = ${!!tagData.system}`;
        const typeClause = tagData.typeId
          ? `AND id INSIDE (SELECT VALUE in FROM typed WHERE out = ${tagData.typeId})`
          : '';
        const dupCheck = await db.query(
          `SELECT * FROM tag_definitions WHERE ${nameClause} ${typeClause}`
        );
        if (dupCheck[0]?.length > 0) {
          return { success: true, data: normalizeRecord(dupCheck[0][0]) };
        }
      }

      const tagRecord = {
        name: trimmedTagName,
        color: tagData.color || null,
        description: tagData.description || null,
        system: tagData.system || false,
        created_at: new Date().toISOString(),
      };
      if (tagData.schema !== undefined) tagRecord.schema = tagData.schema;
      const result = await db.create('tag_definitions', tagRecord);
      const created = Array.isArray(result) ? result[0] : result;
      const tagId = created.id?.toString?.() ?? created.id;

      // Wire typed edge if a typeId was provided
      if (tagData.typeId) {
        await db.query(`RELATE ${tagId}->typed->${tagData.typeId}`);
      }

      scheduleExport(db);
      return { success: true, data: normalizeRecord(created) };
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
      if (tagData.name        !== undefined) updateObj.name        = tagData.name?.trim();
      if (tagData.color       !== undefined) updateObj.color       = tagData.color;
      if (tagData.description !== undefined) updateObj.description = tagData.description;
      if (tagData.schema      !== undefined) updateObj.schema      = tagData.schema;

      if (Object.keys(updateObj).length > 0) {
        await db.query(`UPDATE ${tagId} MERGE ${JSON.stringify(updateObj)}`);
      }

      // Handle type reassignment via typed edge
      if (tagData.typeId !== undefined) {
        await db.query(`DELETE FROM typed WHERE in = ${tagId}`);
        if (tagData.typeId) {
          await db.query(`RELATE ${tagId}->typed->${tagData.typeId}`);
        }
      }

      if (Object.keys(updateObj).length === 0 && tagData.typeId === undefined) {
        throw new Error('No fields to update');
      }

      scheduleExport(db);
      return { success: true };
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

      if (tag && tag.system) {
        // Resolve type name via typed edge
        const typedResult = await db.query(`SELECT out FROM typed WHERE in = ${tagId}`);
        const typeRef = typedResult[0]?.[0]?.out?.toString?.() ?? typedResult[0]?.[0]?.out;
        const typeName = typeRef ? typeRef.replace('tag_types:', '') : null;
        if (!isSystemTagDeletable(typeName)) {
          return { success: false, error: 'System tags cannot be deleted' };
        }
      }

      // Delete all edges pointing to/from this tag, then delete the tag
      await db.query(`DELETE FROM tagged WHERE out = ${tagId}`);
      await db.query(`DELETE FROM typed WHERE in = ${tagId}`);
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

      // Check if edge already exists
      const existing = await db.query(
        `SELECT * FROM tagged WHERE in = ${objectId} AND out = ${tagId}`
      );
      if (existing[0] && existing[0].length > 0) {
        return { success: true, data: normalizeRecord(existing[0][0]), message: 'Tag already assigned' };
      }

      const result = await db.query(`RELATE ${objectId}->tagged->${tagId}`);
      scheduleExport(db);

      const created = result[0]?.[0] || result[0];
      return { success: true, data: normalizeRecord(created) };
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

      await db.query(`DELETE FROM tagged WHERE in = ${objectId} AND out = ${tagId}`);
      scheduleExport(db);

      return { success: true };
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

      const edgesResult = await db.query(`SELECT out FROM tagged WHERE in = ${objectId}`);
      const tagIds = (edgesResult[0] || []).map(r => r.out?.toString?.() ?? r.out);

      if (tagIds.length === 0) return { success: true, data: [] };

      let tagsResult;
      if (tagIds.length === 1) {
        tagsResult = await db.query(`SELECT * FROM ${tagIds[0]}`);
      } else {
        const inClause = `[${tagIds.join(', ')}]`;
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

      const edgesResult = await db.query(`SELECT in FROM tagged WHERE out = ${tagId}`);
      const objectIds = (edgesResult[0] || []).map(r => r.in?.toString?.() ?? r.in);

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

  // ── CREATE SPACE ───────────────────────────────────────────────────────────

  ipcMain.handle('db:createSpace', async (event, data) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');

      const now = new Date().toISOString();
      const spaceRecord = {
        name: data.name,
        space: true,
        query: data.query || null,
        default_view: data.default_view ?? 'list',
        pinned: data.pinned ?? false,
        system: false,
        order: data.order ?? 0,
        created_at: now,
        updated_at: now,
      };

      const result = await db.query(`CREATE objects CONTENT ${JSON.stringify(spaceRecord)}`);
      scheduleExport(db);

      const created = result[0]?.[0] || result[0];
      return { success: true, data: normalizeRecord(created) };
    } catch (error) {
      console.error('[IPC] Create space error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── UPDATE SPACE ───────────────────────────────────────────────────────────

  ipcMain.handle('db:updateSpace', async (event, id, updates) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');

      const updateObj = { updated_at: new Date().toISOString() };
      if (updates.name !== undefined) updateObj.name = updates.name;
      if (updates.query !== undefined) updateObj.query = updates.query;
      if (updates.default_view !== undefined) updateObj.default_view = updates.default_view;
      if (updates.order !== undefined) updateObj.order = updates.order;

      const result = await db.query(`UPDATE ${id} MERGE ${JSON.stringify(updateObj)}`);
      scheduleExport(db);

      return { success: true, data: result };
    } catch (error) {
      console.error('[IPC] Update space error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── EVALUATE SPACE ─────────────────────────────────────────────────────────
  // Final set = (query_results ∪ contains_edges) − excludes_edges

  ipcMain.handle('db:evaluateSpace', async (event, spaceId) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');

      const objects = await evaluateSpace(db, spaceId);
      return { success: true, data: normalizeRecords(objects) };
    } catch (error) {
      console.error('[IPC] Evaluate space error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── DEVICES ────────────────────────────────────────────────────────────────

  ipcMain.handle('db:getDevices', async () => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');
      const result = await db.query(`SELECT * FROM devices ORDER BY name`);
      const data = (Array.isArray(result) && result.length > 0) ? result[0] : [];
      return { success: true, data: normalizeRecords(data) };
    } catch (error) {
      console.error('[IPC] Get devices error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── CONTAINS EDGE ──────────────────────────────────────────────────────────

  ipcMain.handle('db:addContains', async (event, parentId, childId, order) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');

      const sortOrder = order ?? 0;
      await db.query(`RELATE ${escId(parentId)}->contains->${escId(childId)} SET \`order\` = ${sortOrder}`);
      scheduleExport(db);

      return { success: true };
    } catch (error) {
      console.error('[IPC] Add contains error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:isContainedBy', async (event, parentId, childId) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');
      const result = await db.query(`SELECT id FROM contains WHERE in = ${escId(parentId)} AND out = ${escId(childId)}`);
      return { success: true, data: (result[0] || []).length > 0 };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:removeContains', async (event, parentId, childId) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');

      await db.query(`DELETE FROM contains WHERE in = ${escId(parentId)} AND out = ${escId(childId)}`);
      scheduleExport(db);

      return { success: true };
    } catch (error) {
      console.error('[IPC] Remove contains error:', error);
      return { success: false, error: error.message };
    }
  });

  // ── EXCLUDES EDGE ──────────────────────────────────────────────────────────

  ipcMain.handle('db:addExcludes', async (event, parentId, childId) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');

      await db.query(`RELATE ${escId(parentId)}->excludes->${escId(childId)}`);
      scheduleExport(db);

      return { success: true };
    } catch (error) {
      console.error('[IPC] Add excludes error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:removeExcludes', async (event, parentId, childId) => {
    try {
      const db = getDatabase();
      if (!db) throw new Error('Database not connected');

      await db.query(`DELETE FROM excludes WHERE in = ${escId(parentId)} AND out = ${escId(childId)}`);
      scheduleExport(db);

      return { success: true };
    } catch (error) {
      console.error('[IPC] Remove excludes error:', error);
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
