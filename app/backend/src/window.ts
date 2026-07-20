// Authored by Karter Whitman using Claude Opus 4.8
// Window management. One window; the renderer is the Vite dev server in
// development and the bundled files in production.
import { BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// dist/ sits inside app/backend, so the bundled renderer is two levels up.
const BUNDLED_RENDERER = path.join(here, "../../frontend/dist/index.html");

export function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: "#111113",
    titleBarStyle: "hiddenInset",
    show: false,
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());

  const devUrl = process.env.INDEX_RENDERER_URL;
  if (devUrl) {
    void window.loadURL(devUrl);
    // Devtools stay closed unless asked for — ⌥⌘I opens them on demand,
    // and a detached inspector on every launch buries the window.
    if (process.env.INDEX_DEVTOOLS) window.webContents.openDevTools({ mode: "detach" });
  } else {
    void window.loadFile(BUNDLED_RENDERER);
  }

  return window;
}
