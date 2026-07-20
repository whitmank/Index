// Authored by Karter Whitman using Claude Opus 4.8
// App lifecycle (PRODUCT-SPEC §2.1). Phase 0 covers window management
// and clean quit; the database child process, protocols, IPC handlers,
// and GC are wired in phase 2.
import { app, BrowserWindow } from "electron";
import { createWindow } from "./window.js";

app.on("window-all-closed", () => {
  // Index is a single-window desktop app: closing the window is quitting,
  // on every platform.
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

async function main(): Promise<void> {
  await app.whenReady();
  createWindow();
}

void main();
