// Authored by Karter Whitman using Claude Opus 4.8
// The handlers: thin, like routes. Each one validates its inputs, calls
// into the repository or a service, and wraps the answer in
// `{ ok }`/`{ err }` so nothing ever crosses the bridge as a rejection.
import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import {
  applyChange,
  ensureLabel,
  getItem,
  getItemDetail,
  listLabels,
  listMemberDates,
  listMembers,
  listPlacesAmong,
  listSchemas,
  listSets,
  searchItems,
  upsertSchema,
} from "@index/database";
import type { Result } from "../bridge.js";
import { CHANNELS } from "./channels.js";
import {
  loadExcludedFolders,
  loadWatchedFolders,
  saveExcludedFolders,
  saveWatchedFolders,
  selfDevice,
} from "../config.js";
import { pathsToResources } from "../services/intake.js";
import { findByHash, refreshWatchList, relinkOne, runNow } from "../services/relink.js";
import { isLocalUri, resolve, resolveExistingFile } from "../services/resolver.js";
import { broadcast } from "../windowBehavior/index.js";
import {
  asChange,
  asMembersOptions,
  asOptionalNumber,
  asSchemaInput,
  asString,
  asStringArray,
  InvalidInput,
} from "./validate.js";

export { CHANNELS };


function handle<T>(channel: string, body: (...args: unknown[]) => Promise<T>): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<Result<T>> => {
    try {
      return { ok: await body(...args) };
    } catch (error) {
      // An invalid input is a bug in the renderer and reads as one; any
      // other failure is the machine's, and the active view surfaces it.
      const message = error instanceof Error ? error.message : String(error);
      if (!(error instanceof InvalidInput)) console.error(`[ipc] ${channel}:`, error);
      return { err: message };
    }
  });
}

export function registerHandlers(): void {
  handle(CHANNELS.deviceSelf, async () => ({ id: selfDevice() }));

  handle(CHANNELS.setsList, async () => ({ sets: await listSets() }));

  handle(CHANNELS.setsMembers, async (setId, options) =>
    listMembers(asString(setId, "setId"), asMembersOptions(options)),
  );

  handle(CHANNELS.setsDates, async (setId) => listMemberDates(asString(setId, "setId")));

  handle(CHANNELS.itemsGet, async (id) => {
    const detail = await getItemDetail(asString(id, "id"));
    if (!detail) throw new Error("no such item");
    return detail;
  });

  // Search answers with the places among its hits for the same reason a
  // set load does: whatever draws a hit has to know whether it is somewhere
  // to go or something to open, and the role is computed, never stored.
  handle(CHANNELS.itemsSearch, async (term, limit) => {
    const items = await searchItems(asString(term, "term"), asOptionalNumber(limit, "limit") ?? 20);
    return { items, places: await listPlacesAmong(items.map((item) => item.id)) };
  });

  handle(CHANNELS.labelsList, async () => ({ labels: await listLabels() }));

  handle(CHANNELS.labelsEnsure, async (name) => ensureLabel(asString(name, "name")));

  handle(CHANNELS.schemasList, async () => ({ schemas: await listSchemas() }));

  handle(CHANNELS.schemasUpsert, async (schema) => upsertSchema(asSchemaInput(schema)));

  handle(CHANNELS.changesApply, async (change) => {
    const applying = asChange(change);
    const records = await applyChange(applying);
    // Every window is looking at the same database, so what one of them
    // did is news in all of them. The window that asked is included: it
    // has already merged these records itself, and merging them twice is
    // the same as merging them once.
    broadcast("records:changed", applying, records);
    return { records };
  });

  handle(CHANNELS.intakePathsToResources, async (paths) => ({
    results: await pathsToResources(asStringArray(paths, "paths")),
  }));

  handle(CHANNELS.intakePick, async () => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const picked = window
      ? await dialog.showOpenDialog(window, { properties: ["openFile", "multiSelections"] })
      : await dialog.showOpenDialog({ properties: ["openFile", "multiSelections"] });
    if (picked.canceled) return { results: [] };
    return { results: await pathsToResources(picked.filePaths) };
  });

  // Which of these uris currently 404 locally — ResourcesEditor's
  // missing-badge check. Non-local/web uris always answer false; a
  // resource on the web or another device isn't something this feature
  // can search for.
  handle(CHANNELS.resourcesCheckMissing, async (uris) => {
    const list = asStringArray(uris, "uris");
    const missing: Record<string, boolean> = {};
    for (const uri of list) missing[uri] = isLocalUri(uri) && !resolveExistingFile(uri);
    return { missing };
  });

  // Manual fallback for a file that landed somewhere the background
  // watcher doesn't cover: pick a folder, search it by content hash,
  // relink+broadcast server-side if found. `relinkOne` already broadcasts
  // on success, so this must not do it again.
  handle(CHANNELS.resourcesLocate, async (itemId, uri) => {
    const id = asString(itemId, "itemId");
    const target = asString(uri, "uri");

    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const picked = window
      ? await dialog.showOpenDialog(window, { properties: ["openDirectory"] })
      : await dialog.showOpenDialog({ properties: ["openDirectory"] });
    const folder = picked.filePaths[0];
    if (picked.canceled || !folder) return { found: false };

    const item = await getItem(id);
    const resource = item?.resources.find((entry) => entry.uri === target);
    if (!item || !resource?.contentHash || resource.size === undefined) return { found: false };

    const foundPath = await findByHash(resource.contentHash, resource.size, folder);
    if (!foundPath) return { found: false };

    const records = await relinkOne(
      { itemId: id, uri: target, contentHash: resource.contentHash, size: resource.size },
      foundPath,
    );
    return { found: records !== null };
  });

  // Force a fresh search by content hash against the full watch list —
  // for a resource that still resolves but points somewhere wrong (a
  // duplicate matched before an exclusion existed to rule it out), not
  // just a missing one. No dialog: this searches everywhere the
  // background watcher already covers, respecting the current watch
  // list and exclude list, so excluding a folder and re-seeking is how
  // a bad match gets corrected without waiting for the file to move
  // again.
  handle(CHANNELS.resourcesReseek, async (itemId, uri) => {
    const id = asString(itemId, "itemId");
    const target = asString(uri, "uri");

    const item = await getItem(id);
    const resource = item?.resources.find((entry) => entry.uri === target);
    if (!item || !resource?.contentHash || resource.size === undefined) return { found: false };

    const foundPath = await findByHash(resource.contentHash, resource.size);
    if (!foundPath) return { found: false };

    const records = await relinkOne(
      { itemId: id, uri: target, contentHash: resource.contentHash, size: resource.size },
      foundPath,
    );
    return { found: records !== null };
  });

  handle(CHANNELS.resourcesWatchlistList, async () => ({ folders: loadWatchedFolders() }));

  // Adding is picking one or more folders at once — `multiSelections`,
  // same as intakePick's file dialog — appended in the order the OS
  // returns them; the user reorders afterward by dragging in Settings.
  // refreshWatchList restarts live watching against the new list and
  // runs a pass against it immediately.
  handle(CHANNELS.resourcesWatchlistAdd, async () => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const picked = window
      ? await dialog.showOpenDialog(window, { properties: ["openDirectory", "multiSelections"] })
      : await dialog.showOpenDialog({ properties: ["openDirectory", "multiSelections"] });
    const current = loadWatchedFolders();
    if (picked.canceled || picked.filePaths.length === 0) return { folders: current };

    const additions = picked.filePaths.filter((folder) => !current.includes(folder));
    if (additions.length === 0) return { folders: current };

    const folders = [...current, ...additions];
    saveWatchedFolders(folders);
    refreshWatchList();
    return { folders };
  });

  // One entry point for both reordering and removal: the frontend already
  // holds the current list (from `list`/`add`'s own answers) and sends
  // back exactly the array it wants persisted — a move is a swap, a
  // removal is a filter, computed client-side either way.
  handle(CHANNELS.resourcesWatchlistUpdate, async (folders) => {
    const list = asStringArray(folders, "folders");
    saveWatchedFolders(list);
    refreshWatchList();
    return { folders: list };
  });

  handle(CHANNELS.resourcesExcludelistList, async () => ({ folders: loadExcludedFolders() }));

  // Same multi-select dialog as the watch list's add; order doesn't mean
  // anything for exclusions, so `runNow` just re-runs the current pass —
  // no watcher restart, since exclusions only filter search candidates,
  // never which folders are actually watched.
  handle(CHANNELS.resourcesExcludelistAdd, async () => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const picked = window
      ? await dialog.showOpenDialog(window, { properties: ["openDirectory", "multiSelections"] })
      : await dialog.showOpenDialog({ properties: ["openDirectory", "multiSelections"] });
    const current = loadExcludedFolders();
    if (picked.canceled || picked.filePaths.length === 0) return { folders: current };

    const additions = picked.filePaths.filter((folder) => !current.includes(folder));
    if (additions.length === 0) return { folders: current };

    const folders = [...current, ...additions];
    saveExcludedFolders(folders);
    runNow();
    return { folders };
  });

  handle(CHANNELS.resourcesExcludelistRemove, async (folder) => {
    const target = asString(folder, "folder");
    const folders = loadExcludedFolders().filter((entry) => entry !== target);
    saveExcludedFolders(folders);
    runNow();
    return { folders };
  });

  handle(CHANNELS.shellReveal, async (uri) => {
    const target = asString(uri, "uri");
    if (!isLocalUri(target)) throw new Error("only local resources can be revealed");
    const resolved = resolve(target);
    if (resolved?.kind !== "file") throw new Error("unreachable resource");
    shell.showItemInFolder(resolved.filepath);
    return null;
  });

  handle(CHANNELS.shellOpenExternal, async (uri) => {
    const target = asString(uri, "uri");
    const resolved = resolve(target);
    if (!resolved) throw new Error("unreachable resource");
    await shell.openExternal(
      resolved.kind === "web" ? resolved.url : `file://${resolved.filepath}`,
    );
    return null;
  });
}
