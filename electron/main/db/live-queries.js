// Author: Claude Sonnet 4.6
// LIVE SELECT subscriptions — 3 tables, push diffs to renderer via IPC.

import { BrowserWindow } from 'electron';
import { normalizeRecord } from '../utils/normalize.js';

export async function startLiveQueries(db) {
  const send = (channel, data) => {
    BrowserWindow.getAllWindows().forEach(w => {
      if (!w.isDestroyed()) w.webContents.send(channel, data);
    });
  };

  await db.live('nodes', (action, result) => {
    send('live:nodes', { action, result: normalizeRecord(result) });
  });

  await db.live('edge_types', (action, result) => {
    send('live:edge_types', { action, result: normalizeRecord(result) });
  });

  await db.live('edges', (action, result) => {
    send('live:edges', { action, result: normalizeRecord(result) });
  });

  console.log('[LiveQueries] LIVE SELECT active on nodes, edge_types, edges');
}
