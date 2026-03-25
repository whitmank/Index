// Author: Claude Code
// LIVE SELECT subscriptions — pushes DB diffs to the renderer via IPC.
// Called once at startup after the DB is ready. Broadcasts to all windows.
// Subscribes to: objects, tag_definitions, tag_types edge (typed),
//                and the three relationship edge tables (tagged, contains, excludes).

import { BrowserWindow } from 'electron';
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

  await db.live('objects', (action, result) => {
    send('live:objects', { action, result: normalizeRecord(result) });
  });

  await db.live('tagged', (action, result) => {
    send('live:tagged', { action, result: normalizeRecord(result) });
  });

  await db.live('contains', (action, result) => {
    send('live:contains', { action, result: normalizeRecord(result) });
  });

  await db.live('excludes', (action, result) => {
    send('live:excludes', { action, result: normalizeRecord(result) });
  });

  await db.live('tag_definitions', (action, result) => {
    send('live:tag_definitions', { action, result: normalizeRecord(result) });
  });

  await db.live('typed', (action, result) => {
    send('live:typed', { action, result: normalizeRecord(result) });
  });

  console.log('[LiveQueries] LIVE SELECT subscriptions active');
}
