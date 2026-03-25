// Author: Claude Code
// Global Cmd+I capture entry point — detects frontmost app, routes to the correct handler,
// creates or focuses the matching object, then brings the Index window to front.

import { exec } from 'child_process';
import { promisify } from 'util';
import { createObjectCore, findObjectByUri } from '../db/services/object-service.js';
import { escId } from '../db/surreal-utils.js';

import * as safariHandler from './context-handlers/safari.js';
import * as defaultHandler from './context-handlers/default.js';

const execAsync = promisify(exec);

// Ordered list of handlers — first match wins; default must be last
const HANDLERS = [safariHandler, defaultHandler];

/**
 * Called when the user presses Cmd+I.
 * Detects the frontmost app, captures context, deduplicates, creates/focuses object.
 * If targetSpaceId is provided, the object is explicitly added to that space.
 *
 * @param {object} db - SurrealDB instance
 * @param {import('electron').BrowserWindow} mainWindow
 * @param {string|null} targetSpaceId - Active space to receive the captured object
 */
export async function handleCaptureShortcut(db, mainWindow, targetSpaceId = null) {
  if (!db) {
    console.warn('[Capture] Database not ready');
    showWindow(mainWindow);
    return;
  }

  // Identify the frontmost app BEFORE we bring Electron forward
  let appName = null;
  try {
    const { stdout } = await execAsync(
      `osascript -e 'tell application "System Events" to get name of first process whose frontmost is true'`
    );
    appName = stdout.trim();
  } catch (err) {
    console.warn('[Capture] Could not detect frontmost app:', err.message);
  }

  console.log(`[Capture] Frontmost app: ${appName} | targetSpace: ${targetSpaceId ?? 'none'}`);

  // Find the first handler that can handle this app
  const handler = HANDLERS.find(h => h.canHandle(appName));

  let captureResult = null;
  try {
    captureResult = await handler.capture(appName);
  } catch (err) {
    console.error('[Capture] Handler error:', err.message);
  }

  let objectId = null;

  if (captureResult) {
    const { name, uri, mediaTypeHint } = captureResult;

    // Deduplication: check if this URI already exists
    const existing = await findObjectByUri(db, uri);

    if (existing) {
      objectId = existing.id?.toString?.() ?? existing.id;
      console.log(`[Capture] Duplicate found, focusing existing object: ${objectId}`);
    } else {
      try {
        const { objectId: newId } = await createObjectCore(db, {
          name,
          sources: [{ uri, origin: 'Web' }],
          mediaTypeHint,
        });
        objectId = newId;
        console.log(`[Capture] Created new object: ${objectId} — "${name}"`);
      } catch (err) {
        console.error('[Capture] Failed to create object:', err.message);
      }
    }

    // Explicitly include the object in the target space via contains edge
    if (objectId && targetSpaceId) {
      try {
        // Avoid duplicate edges
        const existing = await db.query(
          `SELECT * FROM contains WHERE in = ${escId(targetSpaceId)} AND out = ${escId(objectId)}`
        );
        if (!existing[0] || existing[0].length === 0) {
          await db.query(`RELATE ${escId(targetSpaceId)}->contains->${escId(objectId)}`);
        }
        console.log(`[Capture] Added object ${objectId} to space ${targetSpaceId}`);
      } catch (err) {
        console.error('[Capture] Failed to add object to space:', err.message);
      }
    }
  }

  // Show and focus the Index window
  showWindow(mainWindow);

  // Broadcast selection to renderer if we have an object
  if (objectId && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('objects:selectObject', objectId);
  }
}

/**
 * Show and focus the main window.
 * @param {import('electron').BrowserWindow} mainWindow
 */
function showWindow(mainWindow) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  mainWindow.focus();
}
