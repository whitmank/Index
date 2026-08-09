// Authored by Karter Whitman using Claude Opus 4.8
// The handlers: thin, like routes. Each one validates its inputs, calls
// into the repository or a service, and wraps the answer in
// `{ ok }`/`{ err }` so nothing ever crosses the bridge as a rejection.
import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import {
  applyChange,
  ensureLabel,
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
import { selfDevice } from "../config.js";
import { pathsToResources } from "../services/intake.js";
import { isLocalUri, resolve } from "../services/resolver.js";
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
