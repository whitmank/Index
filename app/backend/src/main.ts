// Authored by Karter Whitman using Claude Opus 4.8
// App lifecycle (PRODUCT-SPEC §2.1), in the order the spec gives it:
// directories and config, the database child process, protocols and IPC,
// then the window. On quit the connection closes and the child is stopped
// before the app is allowed to exit.
import { app, BrowserWindow } from "electron";
import { startDatabase, type DatabaseHandle } from "@index/database";
import { ensureDirectories, loadDeviceConfig, SURREAL_DIR } from "./config.js";
import { registerHandlers } from "./ipc/index.js";
import { registerProtocols, registerSchemes } from "./protocols.js";
import { startSweeping } from "./services/gc.js";
import { createWindow } from "./window.js";

// Must run before `app.whenReady()`.
registerSchemes();

let database: DatabaseHandle | null = null;
let stopSweeping: (() => void) | null = null;
let quitting = false;

async function main(): Promise<void> {
  ensureDirectories();
  loadDeviceConfig();

  await app.whenReady();

  database = await startDatabase({ directory: SURREAL_DIR });

  registerProtocols();
  registerHandlers();

  const window = createWindow();

  stopSweeping = startSweeping((result) => {
    if (!window.isDestroyed()) window.webContents.send("gc:swept", result);
  });
}

app.on("window-all-closed", () => {
  // Index is a single-window desktop app: closing the window is quitting,
  // on every platform.
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// `before-quit` is the last point at which async work can still be
// awaited, so the shutdown happens here and the quit is re-issued once
// the database is actually down.
app.on("before-quit", (event) => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();

  stopSweeping?.();
  void (async () => {
    try {
      await database?.stop();
    } catch (error) {
      console.error("[main] failed to stop the database cleanly:", error);
    } finally {
      app.exit(0);
    }
  })();
});

main().catch((error) => {
  console.error("[main] startup failed:", error);
  app.exit(1);
});
