// Authored by Karter Whitman using Claude Opus 4.8
// Single source of truth for this instance's data directory.
//
// All persistent state (SurrealDB files, device id, settings, JSON export)
// lives under INDEX_DIR. Set INDEX_DATA_DIR to run this build fully isolated
// from any other Index instance — the dev launcher does this automatically,
// deriving a per-workspace directory (e.g. ~/.index-0.5).

import path from 'path';
import os from 'os';

export const INDEX_DIR = process.env.INDEX_DATA_DIR
  ? path.resolve(process.env.INDEX_DATA_DIR)
  : path.join(os.homedir(), '.index');
