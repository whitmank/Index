// Authored by Karter Whitman using Claude Opus 4.8
// The contextBridge: the narrow, typed surface the renderer sees. It
// forwards; it never decides. Everything here is one line per handler on
// purpose — logic belongs on the other side of the wire.
import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { BridgeEvents, IndexBridge } from "./bridge.js";
import { CHANNELS } from "./ipc/channels.js";
import { resUrl, thumbUrl } from "./urls.js";

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

const bridge: IndexBridge = {
  sets: {
    list: () => invoke(CHANNELS.setsList),
    members: (setId, options) => invoke(CHANNELS.setsMembers, setId, options),
    dates: (setId) => invoke(CHANNELS.setsDates, setId),
  },
  items: {
    get: (id) => invoke(CHANNELS.itemsGet, id),
    search: (term, limit) => invoke(CHANNELS.itemsSearch, term, limit),
  },
  labels: {
    list: () => invoke(CHANNELS.labelsList),
    ensure: (name) => invoke(CHANNELS.labelsEnsure, name),
  },
  schemas: {
    list: () => invoke(CHANNELS.schemasList),
    upsert: (schema) => invoke(CHANNELS.schemasUpsert, schema),
  },
  changes: {
    apply: (change) => invoke(CHANNELS.changesApply, change),
  },
  intake: {
    pathsToResources: (paths) => invoke(CHANNELS.intakePathsToResources, paths),
    pick: () => invoke(CHANNELS.intakePick),
    pathForFile: (file) => webUtils.getPathForFile(file),
  },
  shell: {
    reveal: (uri) => invoke(CHANNELS.shellReveal, uri),
    openExternal: (uri) => invoke(CHANNELS.shellOpenExternal, uri),
  },
  url: {
    res: resUrl,
    thumb: thumbUrl,
  },
  on<C extends keyof BridgeEvents>(channel: C, listener: (...args: BridgeEvents[C]) => void) {
    const forward = (_event: unknown, ...args: unknown[]) =>
      listener(...(args as BridgeEvents[C]));
    ipcRenderer.on(channel, forward);
    return () => {
      ipcRenderer.off(channel, forward);
    };
  },
};

contextBridge.exposeInMainWorld("index", bridge);
