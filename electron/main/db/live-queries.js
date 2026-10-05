// Author: Claude Code
// LIVE SELECT subscriptions — pushes DB diffs to the renderer via IPC.
// Called once at startup after the DB is ready. Broadcasts to all windows.
// v0.4.1: subscribes to edge tables (tagged, contains, excludes) replacing
//         tag_assignments, spaces, space_objects.
// v0.4.2: adds tag_definitions and typed live subscriptions.

import { BrowserWindow } from 'electron';
import { Table } from 'surrealdb';
import { normalizeRecord } from '../utils/normalize.js';

/**
 * Subscribe to live changes on objects and edge tables.
 * Each action ('CREATE', 'UPDATE', 'DELETE') is forwarded to all open windows.
 * Records are normalized before sending so the renderer always receives plain string IDs.
 *
 * @param {Surreal} db
 */
export async function startLiveQueries(db) {
  const send = (channel, data) => {
    BrowserWindow.getAllWindows().forEach(w => {
      if (!w.isDestroyed()) w.webContents.send(channel, data);
    });
  };

  const subscribe = async (table, channel) => {
    const subscription = await db.live(new Table(table));
    subscription.subscribe((message) => {
      if (message.action === 'KILLED') return;
      const result = { ...message.value, id: message.recordId };
      send(channel, { action: message.action, result: normalizeRecord(result) });
    });
  };

  await subscribe('objects', 'live:objects');
  await subscribe('tagged', 'live:tagged');
  await subscribe('contains', 'live:contains');
  await subscribe('excludes', 'live:excludes');
  await subscribe('tag_definitions', 'live:tag_definitions');
  await subscribe('typed', 'live:typed');

  console.log('[LiveQueries] LIVE SELECT subscriptions active');
}
