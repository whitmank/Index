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
  device: {
    self: () => invoke(CHANNELS.deviceSelf),
  },
  sets: {
    list: () => invoke(CHANNELS.setsList),
    members: (setId, options) => invoke(CHANNELS.setsMembers, setId, options),
    dates: (setId) => invoke(CHANNELS.setsDates, setId),
  },
  items: {
    get: (id) => invoke(CHANNELS.itemsGet, id),
    search: (term, limit) => invoke(CHANNELS.itemsSearch, term, limit),
  },
  data: {
    attributes: {
      list: () => invoke(CHANNELS.dataAttributesList),
    },
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
  ingest: {
    classify: (uri, name) => invoke(CHANNELS.ingestClassify, uri, name),
    parse: (uri, type) => invoke(CHANNELS.ingestParse, uri, type),
  },
  models: {
    locations: {
      list: () => invoke(CHANNELS.modelsLocationsList),
      add: () => invoke(CHANNELS.modelsLocationsAdd),
      remove: (dir) => invoke(CHANNELS.modelsLocationsRemove, dir),
    },
    scan: () => invoke(CHANNELS.modelsScan),
    setActive: (task, path) => invoke(CHANNELS.modelsSetActive, task, path),
  },
  itemClassifier: {
    classify: (description) => invoke(CHANNELS.itemClassifierClassify, description),
  },
  classification: {
    settings: {
      get: () => invoke(CHANNELS.classificationSettingsGet),
      set: (trad, ai) => invoke(CHANNELS.classificationSettingsSet, trad, ai),
    },
  },
  resources: {
    checkMissing: (uris) => invoke(CHANNELS.resourcesCheckMissing, uris),
    locate: (itemId, uri) => invoke(CHANNELS.resourcesLocate, itemId, uri),
    reseek: (itemId, uri) => invoke(CHANNELS.resourcesReseek, itemId, uri),
    watchlist: {
      list: () => invoke(CHANNELS.resourcesWatchlistList),
      add: () => invoke(CHANNELS.resourcesWatchlistAdd),
      update: (folders) => invoke(CHANNELS.resourcesWatchlistUpdate, folders),
    },
    excludelist: {
      list: () => invoke(CHANNELS.resourcesExcludelistList),
      add: () => invoke(CHANNELS.resourcesExcludelistAdd),
      remove: (folder) => invoke(CHANNELS.resourcesExcludelistRemove, folder),
    },
  },
  shell: {
    reveal: (uri) => invoke(CHANNELS.shellReveal, uri),
    openExternal: (uri) => invoke(CHANNELS.shellOpenExternal, uri),
  },
  spotify: {
    credentials: {
      get: () => invoke(CHANNELS.spotifyCredentialsGet),
      save: (clientId, clientSecret) => invoke(CHANNELS.spotifyCredentialsSave, clientId, clientSecret),
    },
    album: (url) => invoke(CHANNELS.spotifyAlbum, url),
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
