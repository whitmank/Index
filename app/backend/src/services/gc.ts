// Authored by Karter Whitman using Claude Opus 4.8
// The sweep (PRODUCT-SPEC §1.7): purge records flagged deleted longer ago
// than the retention window, then drop derivation cache files nothing
// points at any more. Deletion being soft is what makes undo-after-delete
// free; this is the other half of that bargain.
import fs from "node:fs";
import { listLiveResourceUris, purgeDeletedBefore } from "@index/database";
import { orphanedCacheFiles } from "./derivations.js";

const RETENTION_DAYS = 30; // PRODUCT-SPEC §4
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000; // every six hours, plus launch

export interface Sweep {
  items: number;
  connections: number;
  derivations: number;
}

export async function sweep(): Promise<Sweep> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const purged = await purgeDeletedBefore(cutoff);

  let derivations = 0;
  for (const file of orphanedCacheFiles(await listLiveResourceUris())) {
    try {
      fs.rmSync(file);
      derivations += 1;
    } catch {
      /* someone else got there first */
    }
  }

  return { ...purged, derivations };
}

/** Sweep now, then every six hours. Returns the way to stop. */
export function startSweeping(onSwept: (result: Sweep) => void): () => void {
  const run = async () => {
    try {
      const result = await sweep();
      console.log(
        `[gc] swept ${result.items} items, ${result.connections} connections, ${result.derivations} derivations`,
      );
      onSwept(result);
    } catch (error) {
      console.error("[gc] sweep failed:", error);
    }
  };

  void run();
  const timer = setInterval(() => void run(), SWEEP_INTERVAL_MS);
  return () => clearInterval(timer);
}
