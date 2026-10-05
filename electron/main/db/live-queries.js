// Author: Claude Code
// LIVE SELECT subscriptions — pushes DB diffs to the renderer via IPC.
// Called once at startup after the DB is ready. Broadcasts to all windows.
// Subscribes to: objects, tag_definitions, tag_types edge (typed),
//                and the three relationship edge tables (tagged, contains, excludes).

import { BrowserWindow } from 'electron';
import { Table } from 'surrealdb';
import { normalizeRecord } from '../utils/normalize.js';

// Tables mirrored to the renderer, paired with their IPC channel.
const LIVE_TABLES = [
  ['objects',         'live:objects'],
  ['tagged',          'live:tagged'],
  ['contains',        'live:contains'],
  ['excludes',        'live:excludes'],
  ['tag_definitions', 'live:tag_definitions'],
  ['typed',           'live:typed'],
  ['devices',         'live:devices'],
  ['sourced_from',    'live:sourced_from'],
];

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

  // surrealdb 2.x: db.live(Table) resolves to a subscription whose handler
  // receives a LiveMessage { action, recordId, value }.
  for (const [table, channel] of LIVE_TABLES) {
    const subscription = await db.live(new Table(table));
    subscription.subscribe((message) => {
      send(channel, { action: message.action, result: normalizeRecord(message.value) });
    });
  }

  console.log('[LiveQueries] LIVE SELECT subscriptions active');
}
