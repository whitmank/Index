// Authored by Karter Whitman using Claude Sonnet 5
// The "magic" half of relocation (hash.ts mints the signature; intake.ts
// captures it). A resource whose file has gone missing but still carries
// a content hash is a resource this service is actively trying to find a
// new home for — by watching a handful of common folders live, and by
// periodically re-scanning them as a safety net. A match relinks with no
// confirmation and no user action: the same posture as another window's
// write landing as news (`records:changed`), not a locally-initiated,
// undoable change.
import fs from "node:fs";
import path from "node:path";
import {
  applyChange,
  deviceOf,
  getItem,
  listItemsWithResources,
  type Change,
  type Item,
  type Resource,
  type StoredRecord,
} from "@index/database";
import { loadExcludedFolders, loadWatchedFolders, selfDevice } from "../config.js";
import { deriveForResource } from "./derivations.js";
import { sha256File } from "./hash.js";
import { pathToUri } from "./intake.js";
import { resolveExistingFile } from "./resolver.js";

// Notified rather than imported: `broadcast` lives under windowBehavior/,
// which pulls in Electron, and this service (like gc.ts) has to run and
// be testable under plain Node. main.ts wires the real broadcasters in;
// tests can leave them no-ops or supply their own.
type RelinkListener = (change: Change, records: StoredRecord[]) => void;
let onRelinked: RelinkListener = () => {};

export function setRelinkListener(listener: RelinkListener): void {
  onRelinked = listener;
}

/** Fires when a resource's availability changes shape — something newly
 * missing, or something no longer missing — without necessarily meaning
 * a relink happened (a resource can simply become missing with nowhere
 * found yet). This is what lets an open ResourcesEditor show "missing"
 * the instant a file vanishes, instead of only on its next unrelated
 * re-render — see reconcile()'s diff below. */
type AvailabilityListener = () => void;
let onAvailabilityChanged: AvailabilityListener = () => {};

export function setAvailabilityListener(listener: AvailabilityListener): void {
  onAvailabilityChanged = listener;
}

const SKIP_NAMES = new Set(["node_modules", ".git", ".Trash", "Library"]);
// A personal watch list defaults to a few specific folders, but nothing
// stops someone pointing it at home itself — and a home directory easily
// holds well over 100k files outside node_modules/.git/Library (measured:
// a real one here cleared 60k in Pictures + a project folder alone). The
// cap only exists to stop a truly pathological mount (a whole external
// or network drive) from walking forever; it must sit far above any
// realistic personal folder; a stat() per candidate is cheap enough that
// a million-file backstop still finishes in seconds, not minutes.
const RECURSIVE_LIMITS = { maxDepth: 20, maxFiles: 1_000_000 };
const DEBOUNCE_MS = 500;
const PERIODIC_MS = 2 * 60 * 1000;

interface Root {
  dir: string;
  limits: { maxDepth: number; maxFiles: number };
}

/** The user-editable watch list (Settings' Files tab; config.ts's
 * `loadWatchedFolders`, defaulting to the usual five), each walked
 * recursively — no hardcoded home entry. `findByHash` below tries roots
 * in this exact order and stops at the first match, so list order *is*
 * search priority: put likely landing spots first, and a broad catch-all
 * like home itself last, if you want one at all — nothing scans it for
 * you unless you add it. */
function wellKnownRoots(): Root[] {
  return loadWatchedFolders()
    .map((dir) => ({ dir, limits: RECURSIVE_LIMITS }))
    .filter((root) => {
      try {
        return fs.statSync(root.dir).isDirectory();
      } catch {
        return false;
      }
    });
}

interface WalkedFile {
  path: string;
  size: number;
}

/** Whether `dir` is a user-excluded folder or sits inside one — checked
 * against absolute paths, unlike `SKIP_NAMES`'s check by name alone. */
export function isExcluded(dir: string, excluded: string[]): boolean {
  return excluded.some((folder) => dir === folder || dir.startsWith(folder + path.sep));
}

/** Bounded recursive walk: skips symlinks (never followed — the direct
 * fix for a symlink cycle hanging the walk), dotfiles/dirs, known noise,
 * and anything under a user-excluded folder. Stops at `maxFiles` rather
 * than throwing — a capped, best-effort answer beats a walk that never
 * finishes on a huge folder. */
async function* walk(
  dir: string,
  limits: { maxDepth: number; maxFiles: number },
  excluded: string[],
  depth = 0,
  budget = { remaining: limits.maxFiles },
): AsyncGenerator<WalkedFile> {
  if (budget.remaining <= 0 || isExcluded(dir, excluded)) return;

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (budget.remaining <= 0) return;
    if (entry.name.startsWith(".") || SKIP_NAMES.has(entry.name)) continue;
    if (entry.isSymbolicLink()) continue;

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (depth >= limits.maxDepth || isExcluded(full, excluded)) continue;
      yield* walk(full, limits, excluded, depth + 1, budget);
      continue;
    }
    if (!entry.isFile()) continue;

    let size: number;
    try {
      size = (await fs.promises.stat(full)).size;
    } catch {
      continue;
    }
    budget.remaining -= 1;
    yield { path: full, size };
  }
}

/**
 * Walks `root` (or every well-known root, when omitted) looking for a
 * file matching `size` and, once size matches, `hash`. Roots are still
 * tried in order and the search stops at the first root that yields
 * anything — that's what makes watch-list order a search priority. But
 * within that root, every matching file is collected before deciding:
 * duplicate content (an old copy left somewhere, a stale export) is
 * genuinely ambiguous by hash alone, and the file just moved here is the
 * one whose `ctime` — metadata-change time, distinct from `mtime` — is
 * most recent. A plain move updates `ctime` even though it preserves the
 * modified/created dates Finder shows, which is why those can read
 * identical across duplicates while this still tells them apart.
 */
export async function findByHash(hash: string, size: number, root?: string): Promise<string | null> {
  const roots: Root[] = root ? [{ dir: root, limits: RECURSIVE_LIMITS }] : wellKnownRoots();
  const excluded = loadExcludedFolders();

  for (const { dir, limits } of roots) {
    const candidates: { path: string; ctimeMs: number }[] = [];

    for await (const file of walk(dir, limits, excluded)) {
      if (file.size !== size) continue;
      const candidateHash = await sha256File(file.path).catch(() => null);
      if (candidateHash !== hash) continue;
      const stat = await fs.promises.stat(file.path).catch(() => null);
      candidates.push({ path: file.path, ctimeMs: stat?.ctimeMs ?? 0 });
    }

    if (candidates.length === 0) continue;
    candidates.sort((a, b) => b.ctimeMs - a.ctimeMs);
    const winner = candidates[0];
    if (winner) return winner.path;
  }
  return null;
}

interface MissingEntry {
  itemId: string;
  uri: string;
  contentHash: string;
  size: number;
}

let missing = new Map<string, MissingEntry>();
const inFlight = new Set<string>();

function keyOf(itemId: string, uri: string): string {
  return `${itemId}#${uri}`;
}

/** Hash+persist a resource that already resolves but predates this
 * feature, so it's protected against a future move. One-time per
 * resource, ever — re-fetches by uri rather than trusting the caller's
 * copy, in case it changed between the scan and this write. */
async function backfillHash(item: Item, resourceUri: string, filepath: string): Promise<void> {
  try {
    const [contentHash, stat] = await Promise.all([
      sha256File(filepath),
      fs.promises.stat(filepath),
    ]);
    const fresh = await getItem(item.id);
    const index = fresh?.resources.findIndex((r) => r.uri === resourceUri) ?? -1;
    if (!fresh || index === -1 || fresh.resources[index]?.contentHash) return;

    const resources = [...fresh.resources];
    const target = resources[index];
    if (!target) return;
    resources[index] = { ...target, contentHash, size: stat.size };
    const after = { ...fresh, resources };
    await applyChange({ description: "Record a file's identity", pairs: [{ before: fresh, after }] });
  } catch (error) {
    console.error(`[relink] backfill failed for ${resourceUri}:`, error);
  }
}

/** Rebuilds the missing-resource registry from scratch: every live local
 * resource either still resolves (backfilling a hash if it lacks one) or
 * is missing-with-a-hash (a relink candidate). Replacing the map wholesale
 * is what drops an entry the instant it's fixed, removed, or its item is
 * deleted — no separate cleanup path needed. */
export async function reconcile(): Promise<void> {
  const previousKeys = missing;
  const items = await listItemsWithResources();
  const fresh = new Map<string, MissingEntry>();

  for (const item of items) {
    for (const resource of item.resources) {
      if (deviceOf(resource.uri) !== selfDevice()) continue;

      const filepath = resolveExistingFile(resource.uri);
      if (filepath) {
        if (!resource.contentHash) await backfillHash(item, resource.uri, filepath);
        continue;
      }

      if (resource.contentHash && resource.size !== undefined) {
        const key = keyOf(item.id, resource.uri);
        fresh.set(key, {
          itemId: item.id,
          uri: resource.uri,
          contentHash: resource.contentHash,
          size: resource.size,
        });
      }
    }
  }

  missing = fresh;

  // Same cardinality and every fresh key already present ⇒ the sets are
  // identical (finite sets, equal size, one contains the other). Anything
  // else means a resource just became missing or just stopped being —
  // either way, an open ResourcesEditor needs to re-check, not wait for
  // its next unrelated re-render.
  const unchanged =
    previousKeys.size === fresh.size && [...fresh.keys()].every((key) => previousKeys.has(key));
  if (!unchanged) onAvailabilityChanged();
}

/**
 * The one relink path: shared by the live watcher, the periodic scan, and
 * the manual "search a folder…" IPC handler. Re-fetches the item and finds
 * the resource by uri rather than trusting `entry` — the registry only
 * carries identity, not a live copy, so this is what stays correct if the
 * user edited or removed the resource while a search was in flight. The
 * `inFlight` guard is what keeps a watch event and the periodic scan from
 * both relinking the same resource at once.
 */
export async function relinkOne(entry: MissingEntry, foundPath: string): Promise<StoredRecord[] | null> {
  const key = keyOf(entry.itemId, entry.uri);
  if (inFlight.has(key)) return null;
  inFlight.add(key);

  try {
    const item = await getItem(entry.itemId);
    if (!item) return null;
    const index = item.resources.findIndex((r) => r.uri === entry.uri);
    if (index === -1) return null;

    const stat = await fs.promises.stat(foundPath).catch(() => null);
    if (!stat || stat.size !== entry.size) return null;

    const current = item.resources[index];
    if (!current) return null;
    const relinked: Resource = {
      ...current,
      uri: pathToUri(foundPath),
      name: path.basename(foundPath),
      cached: undefined,
    };
    relinked.cached = await deriveForResource(relinked);

    const resources = [...item.resources];
    resources[index] = relinked;
    const after = { ...item, resources };
    const change: Change = {
      description: `Relink '${relinked.name}'`,
      pairs: [{ before: item, after }],
    };
    const records = await applyChange(change);
    missing.delete(key);
    onRelinked(change, records);
    return records;
  } catch (error) {
    console.error(`[relink] failed to relink ${entry.uri}:`, error);
    return null;
  } finally {
    inFlight.delete(key);
  }
}

async function scanAgainstMissing(): Promise<void> {
  for (const entry of [...missing.values()]) {
    const found = await findByHash(entry.contentHash, entry.size);
    if (found) await relinkOne(entry, found);
  }
}

const watchers: fs.FSWatcher[] = [];
let debounceTimer: NodeJS.Timeout | null = null;

/**
 * Debounces onto `run` (reconcile + scan) rather than trying to match the
 * touched path against the current `missing` registry directly. That
 * registry is only as fresh as the last reconcile, so a resource that
 * *just* went missing — the ordinary case, moving a file that was still
 * resolving a moment ago — isn't in it yet, and a stat-only check against
 * stale state would silently do nothing until the next periodic tick (up
 * to two minutes later). Re-running the full reconcile on every burst of
 * local file activity is what actually notices a resource going missing
 * and finds its new home in the same pass; the `missing.size` guard below
 * keeps a quiet folder cheap.
 */
function scheduleRun(run: () => Promise<void>): void {
  if (debounceTimer) return;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void run();
  }, DEBOUNCE_MS);
}

/** `{recursive: true}` is macOS/Windows-only — Node throws on Linux. Each
 * root degrades independently: a root that can't be watched live is still
 * covered by the periodic reconcile, just without near-instant relink. */
function startWatchers(run: () => Promise<void>): void {
  for (const { dir } of wellKnownRoots()) {
    try {
      const watcher = fs.watch(dir, { recursive: true }, () => scheduleRun(run));
      watcher.on("error", (error) => console.error(`[relink] watcher error on ${dir}:`, error));
      watchers.push(watcher);
    } catch (error) {
      console.error(`[relink] could not watch ${dir}:`, error);
    }
  }
}

let currentRun: (() => Promise<void>) | null = null;

/** Reconcile + scan again right now, outside the debounce/periodic
 * schedule — for a settings change that should take effect immediately
 * without touching what's being watched (the exclude list: it only
 * filters search candidates, never which folders `fs.watch` covers). */
export function runNow(): void {
  void currentRun?.();
}

/** Called after the watch list changes (Settings' "add a folder…" / a
 * removal): tear down the old watchers and stand up fresh ones from
 * `wellKnownRoots()`'s now-updated read of `loadWatchedFolders()`, then
 * run a pass immediately — adding a folder is a request to look there
 * now, not just from now on. */
export function refreshWatchList(): void {
  for (const watcher of watchers.splice(0)) watcher.close();
  if (currentRun) startWatchers(currentRun);
  runNow();
}

/** Reconcile + scan once immediately (catches files moved while the app
 * was closed), start live watching — every burst of local file activity
 * re-runs the same pass, debounced — then repeat on a timer regardless,
 * as a safety net for whatever the watchers miss (a root that couldn't be
 * watched, an event macOS coalesced away). Mirrors gc.ts's
 * `startSweeping`. */
export function startAutoRelink(): () => void {
  const run = async (): Promise<void> => {
    try {
      await reconcile();
      if (missing.size > 0) await scanAgainstMissing();
    } catch (error) {
      console.error("[relink] reconcile failed:", error);
    }
  };

  currentRun = run;
  void run();
  startWatchers(run);
  const timer = setInterval(() => void run(), PERIODIC_MS);

  return () => {
    clearInterval(timer);
    if (debounceTimer) clearTimeout(debounceTimer);
    for (const watcher of watchers.splice(0)) watcher.close();
    currentRun = null;
  };
}
