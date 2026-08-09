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
import { setAvailabilityListener, setRelinkListener, startAutoRelink } from "./services/relink.js";
import {
  broadcast,
  createWindow,
  showWindow,
  startWindowBehavior,
} from "./windowBehavior/index.js";

// Must run before `app.whenReady()`.
registerSchemes();

// One Index per machine. A second copy would fight the first for the
// database directory and lose the race for the hotkey, so launching again
// just summons the copy that is already running.
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on("second-instance", () => showWindow());

let database: DatabaseHandle | null = null;
let stopSweeping: (() => void) | null = null;
let stopAutoRelink: (() => void) | null = null;
let stopWindowBehavior: (() => void) | null = null;
let quitting = false;

async function main(): Promise<void> {
  ensureDirectories();
  loadDeviceConfig();

  await app.whenReady();

  // No Dock icon and no ⌘Tab entry: the hotkey is the way in, and an
  // overlay that is always running has no business holding a slot in the
  // switcher. This also makes the app an accessory, which is what lets it
  // appear over another app without taking that app's place.
  if (process.platform === "darwin") app.dock?.hide();

  database = await startDatabase({ directory: SURREAL_DIR });

  registerProtocols();
  registerHandlers();

  stopWindowBehavior = await startWindowBehavior();

  stopSweeping = startSweeping((result) => broadcast("gc:swept", result));
  setRelinkListener((change, records) => broadcast("records:changed", change, records));
  setAvailabilityListener(() => broadcast("resources:availabilityChanged"));
  stopAutoRelink = startAutoRelink();
}

app.on("window-all-closed", () => {
  // Deliberately empty. Index is resident: closing the last window leaves
  // the app running so the hotkey still has something to open. Electron
  // quits by default when nobody subscribes, which is the opposite.
});

app.on("activate", () => {
  // Only ever a rescue. Summoning is the hotkey's job, and `activate`
  // fires as a consequence of us taking focus — treating it as a request
  // for a window makes showing one open another, and that one another.
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// `before-quit` is the last point at which async work can still be
// awaited, so the shutdown happens here and the quit is re-issued once
// the database is actually down. Everything with a child process or a
// system-wide registration is torn down here rather than in `will-quit`:
// the quit below is an `app.exit()`, which never emits it.
app.on("before-quit", (event) => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();

  stopWindowBehavior?.();
  stopSweeping?.();
  stopAutoRelink?.();
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
