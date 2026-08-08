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
