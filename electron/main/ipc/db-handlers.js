// Author: Claude Sonnet 4.6
// IPC handlers for 0.6 data model: nodes, edge_types, edges.

import { ipcMain, shell, dialog } from 'electron';
import { getDatabase } from '../db/connection.js';
import { normalizeRecord, normalizeRecords } from '../utils/normalize.js';
import { escId } from '../db/surreal-utils.js';
import { getDeviceOrigin } from '../config/device.js';

let mainWindow = null;

export function setMainWindow(window) {
  mainWindow = window;
}

function db() {
  const d = getDatabase();
  if (!d) throw new Error('Database not connected');
  return d;
}

export function registerDbHandlers() {

  // ── NODES ──────────────────────────────────────────────────────────────────

  ipcMain.handle('db:getAllNodes', async () => {
    try {
      const result = await db().query(`SELECT * FROM nodes`);
      return { success: true, data: normalizeRecords(result[0] || []) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('db:createNode', async (_e, data) => {
    try {
      const now = new Date().toISOString();
      const record = {
        name: data.name,
        schema: data.schema,
        created_at: now,
        updated_at: now,
      };
      if (data.sources) record.sources = data.sources;

      // Enrich object sources with device origin
      if (data.schema === 'object' && Array.isArray(data.sources)) {
        const origin = await getDeviceOrigin();
        record.sources = data.sources.map(s => ({
          ...s,
          origin: s.origin || origin || 'unknown',
          added_at: s.added_at || now,
        }));
      }

      const result = await db().query(`CREATE nodes CONTENT ${JSON.stringify(record)}`);
      const created = result[0]?.[0] ?? result[0];
      return { success: true, data: normalizeRecord(created) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('db:updateNode', async (_e, id, updates) => {
    try {
      const updateObj = { updated_at: new Date().toISOString() };
      if (updates.name    !== undefined) updateObj.name    = updates.name;
      if (updates.sources !== undefined) updateObj.sources = updates.sources;
      const result = await db().query(`UPDATE ${escId(id)} MERGE ${JSON.stringify(updateObj)}`);
      return { success: true, data: result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('db:deleteNode', async (_e, id) => {
    try {
      await db().query(`DELETE FROM edges WHERE in = ${escId(id)} OR out = ${escId(id)}`);
      await db().query(`DELETE ${escId(id)}`);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── EDGE TYPES ─────────────────────────────────────────────────────────────

  ipcMain.handle('db:getAllEdgeTypes', async () => {
    try {
      const result = await db().query(`SELECT * FROM edge_types`);
      return { success: true, data: normalizeRecords(result[0] || []) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('db:createEdgeType', async (_e, data) => {
    try {
      const name = data.name.trim();
      // Dedup by name (case-insensitive)
      const existing = await db().query(
        `SELECT id FROM edge_types WHERE string::lowercase(name) = string::lowercase('${name.replace(/'/g, "\\'")}')`
      );
      if (existing[0]?.length) {
        return { success: true, data: normalizeRecord(existing[0][0]) };
      }
      const result = await db().create('edge_types', { name });
      return { success: true, data: normalizeRecord(Array.isArray(result) ? result[0] : result) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('db:deleteEdgeType', async (_e, id) => {
    try {
      await db().query(`DELETE FROM edges WHERE type = ${escId(id)}`);
      await db().query(`DELETE ${escId(id)}`);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── EDGES ──────────────────────────────────────────────────────────────────

  ipcMain.handle('db:getAllEdges', async () => {
    try {
      const result = await db().query(`SELECT * FROM edges`);
      return { success: true, data: normalizeRecords(result[0] || []) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('db:createEdge', async (_e, data) => {
    try {
      const inId   = escId(data.in);
      const outId  = escId(data.out);
      const typeId = escId(data.type);
      // Dedup
      const existing = await db().query(
        `SELECT id FROM edges WHERE in = ${inId} AND out = ${outId} AND type = ${typeId}`
      );
      if (existing[0]?.length) {
        return { success: true, data: normalizeRecord(existing[0][0]) };
      }
      const result = await db().query(`RELATE ${inId}->edges->${outId} SET type = ${typeId}`);
      const created = result[0]?.[0] ?? result[0];
      return { success: true, data: normalizeRecord(created) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('db:deleteEdge', async (_e, id) => {
    try {
      await db().query(`DELETE ${escId(id)}`);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('db:getEdgesForNode', async (_e, nodeId) => {
    try {
      const id = escId(nodeId);
      const result = await db().query(`SELECT * FROM edges WHERE in = ${id} OR out = ${id}`);
      return { success: true, data: normalizeRecords(result[0] || []) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('db:getEdgesByType', async (_e, edgeTypeId) => {
    try {
      const result = await db().query(`SELECT * FROM edges WHERE type = ${escId(edgeTypeId)}`);
      return { success: true, data: normalizeRecords(result[0] || []) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Returns nodes connected from groupId via edges with type=edge_types:contains
  ipcMain.handle('db:getGroupContents', async (_e, groupId) => {
    try {
      const gId = escId(groupId);
      const edgeResult = await db().query(
        `SELECT out FROM edges WHERE in = ${gId} AND type = edge_types:contains`
      );
      const nodeIds = (edgeResult[0] || []).map(r => r.out?.toString?.() ?? r.out);
      if (!nodeIds.length) return { success: true, data: [] };
      const ids = nodeIds.map(id => escId(id)).join(', ');
      const nodes = await db().query(`SELECT * FROM nodes WHERE id IN [${ids}]`);
      return { success: true, data: normalizeRecords(nodes[0] || []) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Ensure contains edge_type exists; create edge from groupId to nodeId
  ipcMain.handle('db:addToGroup', async (_e, groupId, nodeId) => {
    try {
      // Ensure edge_type:contains exists
      const ctExists = await db().query(`SELECT id FROM edge_types WHERE id = edge_types:contains`);
      if (!ctExists[0]?.length) {
        await db().query(`CREATE edge_types:contains CONTENT ${JSON.stringify({ name: 'contains' })}`);
      }
      const gId = escId(groupId);
      const nId = escId(nodeId);
      const existing = await db().query(
        `SELECT id FROM edges WHERE in = ${gId} AND out = ${nId} AND type = edge_types:contains`
      );
      if (!existing[0]?.length) {
        await db().query(`RELATE ${gId}->edges->${nId} SET type = edge_types:contains`);
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('db:removeFromGroup', async (_e, groupId, nodeId) => {
    try {
      const gId = escId(groupId);
      const nId = escId(nodeId);
      await db().query(
        `DELETE FROM edges WHERE in = ${gId} AND out = ${nId} AND type = edge_types:contains`
      );
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── OPEN SOURCE ────────────────────────────────────────────────────────────

  ipcMain.handle('app:openSource', async (_e, source) => {
    try {
      if (!source) return { success: false, error: 'No source provided' };
      if (source.startsWith('http://') || source.startsWith('https://')) {
        await shell.openExternal(source);
      } else if (source.startsWith('file://')) {
        const filePath = source.replace(/^file:\/\//, '');
        const error = await shell.openPath(filePath);
        if (error) return { success: false, error };
      } else {
        const error = await shell.openPath(source);
        if (error) return { success: false, error };
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── FILE PICKER ────────────────────────────────────────────────────────────

  ipcMain.handle('fs:pickFile', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        title: 'Select a file to index',
      });
      if (result.canceled) return { success: false, canceled: true };
      return { success: true, filePath: result.filePaths[0] };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  console.log('[IPC] Database handlers registered');
}
