// Authored by Karter Whitman using Claude Opus 4.8
// User data lives in ~/.index/, never in the repo: the SurrealDB store,
// the derivation cache, and the device table. Reachability and
// credentials stay out of the database by design (DESIGN-CONCEPT §8).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const INDEX_DIR = path.join(os.homedir(), ".index");
export const SURREAL_DIR = path.join(INDEX_DIR, "surreal");
export const CACHE_DIR = path.join(INDEX_DIR, "cache");
export const DEVICES_FILE = path.join(INDEX_DIR, "devices.toml");
export const WINDOW_FILE = path.join(INDEX_DIR, "window.json");
export const WATCHLIST_FILE = path.join(INDEX_DIR, "watchlist.json");

export interface DeviceConfig {
  /** This machine's device id — the authority intake stamps on new uris. */
  self: string;
  /** device id → the path prefix its uris resolve under, for devices
   * reachable as a mounted volume. */
  mounts: Record<string, string>;
}

const DEFAULT_CONFIG: DeviceConfig = { self: "local", mounts: {} };

export function ensureDirectories(): void {
  for (const dir of [INDEX_DIR, SURREAL_DIR, CACHE_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * A deliberately small TOML reader — the device table is a `self` key and
 * a `[mounts]` section of string values, and a parser for that is shorter
 * and easier to trust than a dependency. Anything it doesn't understand
 * it ignores, so a hand-edited file with a stray line still loads.
 */
function parseToml(source: string): DeviceConfig {
  const config: DeviceConfig = { self: DEFAULT_CONFIG.self, mounts: {} };
  let section = "";

  for (const raw of source.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;

    const heading = /^\[([^\]]+)\]$/.exec(line);
    if (heading?.[1]) {
      section = heading[1].trim();
      continue;
    }

    const pair = /^([A-Za-z0-9_.-]+)\s*=\s*"([^"]*)"$/.exec(line);
    if (!pair) continue;
    const [, key, value] = pair;
    if (!key || value === undefined) continue;

    if (section === "" && key === "self") config.self = value;
    else if (section === "mounts") config.mounts[key] = value;
  }

  return config;
}

let cached: DeviceConfig | null = null;

export function loadDeviceConfig(): DeviceConfig {
  if (cached) return cached;
  try {
    cached = parseToml(fs.readFileSync(DEVICES_FILE, "utf8"));
  } catch {
    // No file is the normal case on a fresh machine: this device is
    // `local` and nothing else is mounted.
    cached = { ...DEFAULT_CONFIG };
  }
  return cached;
}

export function selfDevice(): string {
  return loadDeviceConfig().self;
}

const DEFAULT_WATCHED_FOLDER_NAMES = ["Downloads", "Desktop", "Documents", "Pictures", "Movies"];

export function defaultWatchedFolders(): string[] {
  const home = os.homedir();
  return DEFAULT_WATCHED_FOLDER_NAMES.map((name) => path.join(home, name));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/** The folders relink.ts watches live and searches for a moved file's
 * content, in priority order. Defaults to the usual five until the user
 * edits the list from Settings — a per-machine preference, so it lives
 * beside `devices.toml` rather than in the database (DESIGN-CONCEPT §8). */
export function loadWatchedFolders(): string[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(WATCHLIST_FILE, "utf8")) as { folders?: unknown };
    if (isStringArray(parsed.folders)) return parsed.folders;
  } catch {
    // No file yet, or a hand-edited one that no longer parses — the
    // defaults are the reasonable fallback either way.
  }
  return defaultWatchedFolders();
}

export function saveWatchedFolders(folders: string[]): void {
  try {
    fs.writeFileSync(WATCHLIST_FILE, `${JSON.stringify({ folders }, null, 2)}\n`);
  } catch (error) {
    console.error("[config] could not save watched folders:", error);
  }
}

export const EXCLUDELIST_FILE = path.join(INDEX_DIR, "excludelist.json");

/** Folders a relocation search must never consider a match from — an old
 * app's own data directory, a backup, anywhere known to hold stale
 * duplicate content rather than where a file actually belongs. No
 * default: nothing is excluded until the user says so from Settings. */
export function loadExcludedFolders(): string[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(EXCLUDELIST_FILE, "utf8")) as { folders?: unknown };
    if (isStringArray(parsed.folders)) return parsed.folders;
  } catch {
    // No file yet, or a hand-edited one that no longer parses — nothing
    // excluded is the right fallback either way.
  }
  return [];
}

export function saveExcludedFolders(folders: string[]): void {
  try {
    fs.writeFileSync(EXCLUDELIST_FILE, `${JSON.stringify({ folders }, null, 2)}\n`);
  } catch (error) {
    console.error("[config] could not save excluded folders:", error);
  }
}

export const SPOTIFY_CREDENTIALS_FILE = path.join(INDEX_DIR, "spotify.json");

export interface SpotifyCredentials {
  clientId: string;
  clientSecret: string;
  /** The redirect URI registered for this app in Spotify's developer
   * dashboard. The Client Credentials flow this app actually uses never
   * sends the user through it, but the dashboard requires one to create
   * an app at all — kept here, alongside the id/secret it was
   * registered with, so it isn't lost if a future flow needs it. */
  redirectUri?: string;
}

const EMPTY_SPOTIFY_CREDENTIALS: SpotifyCredentials = { clientId: "", clientSecret: "" };

/** A Spotify Client Credentials app's id/secret — reachability-adjacent,
 * so it lives beside `devices.toml`/the watchlist rather than in the
 * database (DESIGN-CONCEPT §8). Always returns a usable object, empty
 * strings meaning "not configured yet" rather than throwing — whether
 * that's actually usable is for the caller asking for a token to decide. */
export function loadSpotifyCredentials(): SpotifyCredentials {
  try {
    const parsed = JSON.parse(fs.readFileSync(SPOTIFY_CREDENTIALS_FILE, "utf8")) as Partial<SpotifyCredentials>;
    return {
      clientId: typeof parsed.clientId === "string" ? parsed.clientId : "",
      clientSecret: typeof parsed.clientSecret === "string" ? parsed.clientSecret : "",
      redirectUri: typeof parsed.redirectUri === "string" ? parsed.redirectUri : undefined,
    };
  } catch {
    return { ...EMPTY_SPOTIFY_CREDENTIALS };
  }
}

export function saveSpotifyCredentials(credentials: SpotifyCredentials): void {
  try {
    fs.writeFileSync(SPOTIFY_CREDENTIALS_FILE, `${JSON.stringify(credentials, null, 2)}\n`);
  } catch (error) {
    console.error("[config] could not save spotify credentials:", error);
  }
}

export const MODELS_FILE = path.join(INDEX_DIR, "models.json");

export interface ModelSettings {
  /** Directories to look for `.gguf` files in — a person's own model
   * library, not something this app fetches into. No default: this is a
   * specialized, personal location with nothing sensible to guess. */
  locations: string[];
  /** Which discovered model file is active, keyed by task (e.g.
   * "classification"). Absent means "nothing chosen yet" for that task —
   * the caller's own default, not this file's. */
  active: Record<string, string>;
}

const EMPTY_MODEL_SETTINGS: ModelSettings = { locations: [], active: {} };

export function loadModelSettings(): ModelSettings {
  try {
    const parsed = JSON.parse(fs.readFileSync(MODELS_FILE, "utf8")) as Partial<ModelSettings>;
    const locations = isStringArray(parsed.locations) ? parsed.locations : [];
    const active: Record<string, string> = {};
    if (parsed.active && typeof parsed.active === "object") {
      for (const [task, value] of Object.entries(parsed.active)) {
        if (typeof value === "string") active[task] = value;
      }
    }
    return { locations, active };
  } catch {
    // No file yet, or a hand-edited one that no longer parses — nothing
    // chosen is the right fallback either way.
    return { ...EMPTY_MODEL_SETTINGS, active: {} };
  }
}

export function saveModelSettings(settings: ModelSettings): void {
  try {
    fs.writeFileSync(MODELS_FILE, `${JSON.stringify(settings, null, 2)}\n`);
  } catch (error) {
    console.error("[config] could not save model settings:", error);
  }
}
