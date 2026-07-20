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
  searchItems,
} from "@index/database";
import type { Result } from "../bridge.js";
import { CHANNELS } from "./channels.js";
import { pathsToResources } from "../services/intake.js";
import { isLocalUri, resolve } from "../services/resolver.js";
import {
  asChange,
  asMembersOptions,
  asOptionalNumber,
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
  handle(CHANNELS.setsMembers, async (setId, options) =>
    listMembers(asString(setId, "setId"), asMembersOptions(options)),
  );

  handle(CHANNELS.setsDates, async (setId) => listMemberDates(asString(setId, "setId")));

  handle(CHANNELS.itemsGet, async (id) => {
    const detail = await getItemDetail(asString(id, "id"));
    if (!detail) throw new Error("no such item");
    return detail;
  });

  handle(CHANNELS.itemsSearch, async (prefix, limit) => ({
    items: await searchItems(asString(prefix, "prefix"), asOptionalNumber(limit, "limit") ?? 20),
  }));

  handle(CHANNELS.labelsList, async () => ({ labels: await listLabels() }));

  handle(CHANNELS.labelsEnsure, async (name) => ensureLabel(asString(name, "name")));

  handle(CHANNELS.changesApply, async (change) => ({
    records: await applyChange(asChange(change)),
  }));

  handle(CHANNELS.intakePathsToResources, async (paths) => ({
    resources: await pathsToResources(asStringArray(paths, "paths")),
  }));

  handle(CHANNELS.intakePick, async () => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const picked = window
      ? await dialog.showOpenDialog(window, { properties: ["openFile", "multiSelections"] })
      : await dialog.showOpenDialog({ properties: ["openFile", "multiSelections"] });
    if (picked.canceled) return { resources: [] };
    return { resources: await pathsToResources(picked.filePaths) };
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
