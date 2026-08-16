// Authored by Karter Whitman using Claude Sonnet 5
// Where the item classifier's model comes from: a person's own library of
// `.gguf` files, not something this app downloads or manages the identity
// of. This is the one file that touches both `@index/item-modeler`'s
// item classifier and the filesystem — everything else about *which*
// model file exists is config.ts's plain load/save, the same as the
// watched-folder list.
import fs from "node:fs";
import path from "node:path";
import { loadModelSettings, saveModelSettings } from "../config.js";

export interface FoundModel {
  path: string;
  filename: string;
  sizeBytes: number;
}

const GGUF = /\.gguf$/i;

function walk(from: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(from, { withFileTypes: true });
  } catch {
    // A location that no longer exists (moved, unmounted) contributes
    // nothing rather than failing the whole scan.
    return [];
  }

  const found: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(from, entry.name);
    if (entry.isDirectory()) found.push(...walk(full));
    else if (GGUF.test(entry.name)) found.push(full);
  }
  return found;
}

/** Every `.gguf` file findable under the configured locations, sorted for
 * a stable Settings list. Cheap enough to re-run on every ask — a
 * person's model library is small, and nothing here is cached. */
export function scanForModels(): FoundModel[] {
  const { locations } = loadModelSettings();
  const paths = locations.flatMap(walk).sort();
  return paths.map((filePath) => ({
    path: filePath,
    filename: path.basename(filePath),
    sizeBytes: fs.statSync(filePath).size,
  }));
}

/** The active model for a task, or null when nothing is chosen, the
 * chosen file no longer exists on disk (moved or deleted since
 * selecting it), or the task has never been set. Null degrades the same
 * way everywhere downstream — the item classifier's own "no modelPath"
 * path already covers all three without special-casing any of them. */
export function getActiveModel(task: string): string | null {
  const { active } = loadModelSettings();
  const selected = active[task];
  if (!selected) return null;
  try {
    return fs.statSync(selected).isFile() ? selected : null;
  } catch {
    return null;
  }
}

export function setActiveModel(task: string, modelPath: string): void {
  const settings = loadModelSettings();
  saveModelSettings({ ...settings, active: { ...settings.active, [task]: modelPath } });
}
