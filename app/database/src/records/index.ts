// Authored by Karter Whitman using Claude Opus 4.8
// The repository's surface: one module per stored record type — items,
// connections, labels, schemas. Plain reads only; nothing here writes
// (that's changes.ts) or embeds a feature concept (Space membership
// lives in ../sets/, search in ../search/, both built on these reads).
export {
  displayNameOf,
  getItem,
  getItemDetail,
  getItemIncludingDeleted,
  listItems,
  listItemsWithResources,
  listLiveItems,
  nameOf,
} from "./items.js";

export {
  findConnection,
  getConnection,
  listArrowsInto,
  listArrowSourcesInto,
  listConnectionsAmong,
  listConnectionsTouching,
  listMemberOfTargets,
} from "./connections.js";

export { ensureLabel, listLabels } from "./labels.js";

export { listSchemas, upsertSchema, type SchemaInput } from "./schemas.js";

export { listLiveResourceUris, purgeDeletedBefore, type Purge } from "./sweep.js";
