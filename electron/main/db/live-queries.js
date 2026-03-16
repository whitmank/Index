// Author: Claude Code
// LIVE SELECT subscriptions — pushes DB diffs to the renderer via IPC.
// Called once at startup after the DB is ready. Broadcasts to all windows.

import { BrowserWindow } from 'electron';
import { normalizeRecord } from '../utils/normalize.js';

/**
 * Subscribe to live changes on objects, tag_assignments, and collections.
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

  await db.live('tag_assignments', (action, result) => {
    send('live:tagAssignments', { action, result: normalizeRecord(result) });
  });

  await db.live('spaces', (action, result) => {
    send('live:spaces', { action, result: normalizeRecord(result) });
  });

  await db.live('space_objects', (action, result) => {
    send('live:spaceObjects', { action, result: normalizeRecord(result) });
  });

  console.log('[LiveQueries] LIVE SELECT subscriptions active');
}
