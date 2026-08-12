// Authored by Karter Whitman using Claude Opus 4.8
// The package's public surface. The backend imports from here at
// runtime; the frontend imports `@index/database/types` type-only, so
// nothing of this package reaches the renderer bundle.
export { defaultDirectory, getDb, startDatabase } from "./db.js";
export type { DatabaseHandle, DatabaseOptions } from "./db.js";

export { applyChange, invert } from "./changes.js";
export { seed } from "./seed.js";

export { connectionId, itemId, labelId, ulid } from "./ids.js";
export { deviceOf, devicePrefix, formatOf, formatOfResource, sameTypeName, schemaFor } from "./derive.js";

export * from "./records/index.js";

export * from "./types.js";
