// Author: Claude Code
// LIVE SELECT subscriptions — pushes DB diffs to the renderer via IPC.
// Called once at startup after the DB is ready and the main window exists.

/**
 * Subscribe to live changes on objects, tag_assignments, and collections.
 * Each action ('CREATE', 'UPDATE', 'DELETE') is forwarded to the renderer.
 *
 * @param {Surreal} db
 * @param {import('electron').BrowserWindow} mainWindow
 */
export async function startLiveQueries(db, mainWindow) {
  const send = (channel, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  };

  await db.live('objects', ({ action, result }) => {
    send('live:objects', { action, result });
  });

  await db.live('tag_assignments', ({ action, result }) => {
    send('live:tagAssignments', { action, result });
  });

  await db.live('collections', ({ action, result }) => {
    send('live:collections', { action, result });
  });

  console.log('[LiveQueries] LIVE SELECT subscriptions active');
}
