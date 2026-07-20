// Authored by Karter Whitman using Claude Opus 4.8
// The contextBridge: the narrow, typed surface the renderer sees. It
// forwards; it never decides. Phase 2 fills in the §2.2 handlers.
import { contextBridge, ipcRenderer } from "electron";
import type { IndexBridge } from "./bridge.js";

const bridge: IndexBridge = {
  on(channel, listener) {
    const forward = (_event: unknown, ...args: unknown[]) => listener(...args);
    ipcRenderer.on(channel, forward);
    return () => ipcRenderer.off(channel, forward);
  },
};

contextBridge.exposeInMainWorld("index", bridge);
