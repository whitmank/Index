# Index v0.4 — Architecture Plan
<!-- Author: Claude Code -->

## Decision Summary

**SurrealDB is the persistent store.** JSON files become a human-readable export layer, not the source of truth.

**LIVE SELECT drives UI reactivity.** Mutations write to SurrealDB; the DB pushes diffs to the renderer. No full state reloads.

---

## The Problem with v0.3

In v0.3, the data flow is:

```
Mutation → SurrealDB (ephemeral, temp dir)
         → persistToIndex() [sync, blocks mutation]
         → renderer calls loadObjects() [full reload]
```

Three problems:
1. SurrealDB is ephemeral — JSON files are the real source of truth, not the DB
2. Every mutation synchronously writes all files and reloads all state
3. SurrealDB's live query capabilities go completely unused

---

## v0.4 Target Architecture

### Storage

SurrealDB points at a persistent path instead of a temp dir:

```
~/.index/
├── surreal/          ← SurrealDB's own storage (source of truth)
├── export/           ← Human-readable JSON export (generated, not canonical)
│   ├── objects/
│   ├── tag_definitions/
│   ├── tag_assignments.json
│   └── collections/
└── .device-id
```

SurrealDB startup change — from:
```js
tempDbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'index-db-'));
spawn('surreal', ['start', `file://${tempDbDir}/db.surdb`]);
```

To:
```js
const dbPath = path.join(os.homedir(), '.index', 'surreal');
spawn('surreal', ['start', `file://${dbPath}`]);
```

### Consequences of Persistent Storage

- **No hydration step** — DB is already populated from last session; no JSON-to-DB import on startup
- **No crash loss window** — writes survive process death; SurrealDB handles its own durability
- **JSON export is optional** — run on quit, on demand from settings, or on a background timer

### One-Time Migration (v0.3 → v0.4)

On first launch of v0.4, detect if `~/.index/surreal/` is absent but `~/.index/objects/` exists (v0.3 data). If so, run a one-time import: read the v0.3 JSON files and insert into SurrealDB. Mark migration complete with a version file (`~/.index/.version`).

```js
async function migrateFromV3IfNeeded(db) {
  const versionFile = path.join(indexDir, '.version');
  if (fs.existsSync(versionFile)) return; // already migrated

  const objectsDir = path.join(indexDir, 'objects');
  if (fs.existsSync(objectsDir)) {
    await importFromJsonFiles(db, indexDir); // existing hydration logic
    console.log('[Migration] v0.3 data imported into SurrealDB');
  }

  fs.writeFileSync(versionFile, JSON.stringify({ version: '0.4', migratedAt: new Date().toISOString() }));
}
```

---

## Reactive UI via LIVE SELECT

SurrealDB's `LIVE SELECT` pushes a diff to the subscriber whenever a record changes.

### Main Process: Subscribe at Startup

After DB is ready, subscribe to the tables the renderer cares about:

```js
// electron/main/db/live-queries.js

export async function startLiveQueries(db, mainWindow) {
  await db.live('objects', ({ action, result }) => {
    mainWindow.webContents.send('live:objects', { action, result });
  });

  await db.live('tag_assignments', ({ action, result }) => {
    mainWindow.webContents.send('live:tagAssignments', { action, result });
  });

  await db.live('collections', ({ action, result }) => {
    mainWindow.webContents.send('live:collections', { action, result });
  });
}
```

Each `action` is one of: `CREATE`, `UPDATE`, `DELETE`. `result` is the full affected record.

### Preload: Expose Live Channels

```js
// electron/preload/index.js (additions)

onObjectsLive: (callback) => {
  ipcRenderer.removeAllListeners('live:objects');
  ipcRenderer.on('live:objects', (_e, data) => callback(data));
},
onTagAssignmentsLive: (callback) => {
  ipcRenderer.removeAllListeners('live:tagAssignments');
  ipcRenderer.on('live:tagAssignments', (_e, data) => callback(data));
},
onCollectionsLive: (callback) => {
  ipcRenderer.removeAllListeners('live:collections');
  ipcRenderer.on('live:collections', (_e, data) => callback(data));
},
```

### Frontend Stores: Apply Patches, Don't Reload

The `useObjectsStore` subscribes once on app mount and applies granular patches:

```js
// src/store/objects.js

// Called once, in App.jsx useEffect on mount
subscribeToLive: () => {
  window.electronAPI.onObjectsLive(({ action, result }) => {
    const { objects } = useObjectsStore.getState();
    const id = result.id?.id || result.id;

    if (action === 'CREATE') {
      set({ objects: [...objects, result] });
    } else if (action === 'UPDATE') {
      set({ objects: objects.map(o => (o.id?.id || o.id) === id ? result : o) });
    } else if (action === 'DELETE') {
      set({ objects: objects.filter(o => (o.id?.id || o.id) !== id) });
    }
  });
},
```

Mutations become simple fire-and-forget — they write to SurrealDB, and the LIVE SELECT pushes the result back:

```js
addObject: async (objectData) => {
  const result = await window.electronAPI.db.createObject(objectData);
  if (!result.success) throw new Error(result.error);
  return result.data;
  // No loadObjects() — the live subscription will handle the UI update
},
```

### Mutation Flow (v0.4)

```
User action
  → store.addObject()
  → IPC: db:createObject
  → main: createObjectCore() writes to SurrealDB
  → SurrealDB LIVE SELECT fires
  → main: webContents.send('live:objects', { action: 'CREATE', result })
  → renderer: live subscriber patches store state
  → React re-renders affected components
```

No full reload. No synchronous file I/O in the critical path.

---

## JSON Export (Background, Non-Blocking)

`persistToIndex()` is removed from all mutation handlers. It becomes `exportToJson()` and runs:

1. **On `before-quit`** — always, to ensure the export is current on a clean exit
2. **On a debounced timer** — e.g. 5 seconds after the last mutation (configurable)
3. **On demand** — from a "Export data" button in Settings

```js
// electron/main/db/export.js

const EXPORT_DEBOUNCE_MS = 5000;
let exportTimer = null;

export function scheduleExport(db) {
  clearTimeout(exportTimer);
  exportTimer = setTimeout(() => exportToJson(db), EXPORT_DEBOUNCE_MS);
}

export async function exportToJson(db) {
  // Same logic as current persistToIndex(), writes to ~/.index/export/
}
```

The main process calls `scheduleExport(db)` from mutation handlers instead of `await persistToIndex(db)`.

---

## What Gets Removed

| v0.3 Pattern | v0.4 Replacement |
|---|---|
| `persistToIndex()` in every handler | `scheduleExport()` in mutation handlers |
| `hydrateFromIndex()` on startup | Not needed — SurrealDB is already populated |
| `loadObjects()` after every mutation | Live patch applied by store subscriber |
| `broadcastObjectsChanged()` | Replaced by LIVE SELECT push |
| `onObjectsChanged` IPC listener | Replaced by `onObjectsLive` |
| Temp dir for SurrealDB | Persistent path at `~/.index/surreal/` |
| File watcher on `~/.index/objects/` | Not needed — SurrealDB is canonical |

The file watcher (`electron/main/watchers/objects.js`) can be retired entirely. External edits to `~/.index/objects/` will no longer affect the live app (they would only take effect on the next manual import or migration). This is an acceptable trade-off: the JSON export is for humans to read, not to edit live.

---

## Impact on IPC Handlers

Mutation handlers simplify significantly. The pattern:

```js
// v0.3
const result = await db.create('objects', record);
await persistToIndex(db);           // sync file I/O
return { success: true, data: result };
```

Becomes:

```js
// v0.4
const result = await db.create('objects', record);
scheduleExport(db);                 // async, non-blocking
return { success: true, data: result };
// LIVE SELECT will push the change to renderer automatically
```

---

## Domain Logic Centralization

### The Problem in v0.3

Business rules about system tags are split across layers:

- `TagAssignmentSection.jsx` enforces "system tags can't be deleted" — a UI component acting as domain enforcer
- `TagAssignmentSection.jsx` hardcodes `DISPLAYED_SYSTEM_TAG_TYPES`, `SYSTEM_TAG_ORDER`, `getTagTypeLabel()` — display metadata as UI constants
- `object-service.js` correctly owns "media_type is object-level" — backend domain logic
- `db:deleteTag` handler does **not** reject deletion of system tags — no backend enforcement

The result: the renderer is the only thing preventing invalid operations. If the IPC is called directly, the rule can be bypassed.

### Tag Types as First-Class Data

Define the system tag type registry in one place on the backend:

```js
// electron/main/domain/tag-types.js

export const SYSTEM_TAG_TYPES = {
  media_type: {
    label: 'Media Type',
    scope: 'object',       // assigned once per object (from first source)
    display: true,         // shown in tag UI
    editable: true,        // value can be changed by user
    deletable: false,
    order: 0,
  },
  file_type: {
    label: 'File Type',
    scope: 'source',       // one per unique file extension across sources
    display: false,        // hidden in tag UI (queryable, not shown)
    editable: false,
    deletable: false,
    order: 1,
  },
  origin: {
    label: 'Origin',
    scope: 'source',       // one per unique device origin across sources
    display: false,
    editable: false,
    deletable: false,
    order: 2,
  },
};

export function isSystemTagDeletable(type) {
  return SYSTEM_TAG_TYPES[type]?.deletable ?? true;
}
```

Expose via IPC once at startup:

```js
ipcMain.handle('db:getTagTypes', () => ({
  success: true,
  data: SYSTEM_TAG_TYPES,
}));
```

The frontend fetches this once and caches it (e.g. in a `useTagTypesStore` or as a context value). `TagAssignmentSection` stops hardcoding rules and reads from the registry:

```js
// Before (v0.3) — hardcoded in component
const DISPLAYED_SYSTEM_TAG_TYPES = new Set(['media_type']);

// After (v0.4) — driven by registry
const displayedSystemTags = systemTags.filter(t => tagTypes[t.type]?.display);
const orderedSystemTags = displayedSystemTags.sort(
  (a, b) => (tagTypes[a.type]?.order ?? 99) - (tagTypes[b.type]?.order ?? 99)
);
```

### Enforcement at the IPC Boundary

Domain constraints move to the handler, not the component:

```js
// db-handlers.js — db:deleteTag
const tag = await db.query(`SELECT * FROM tag_definitions:${tagId}`);
if (tag.system && !isSystemTagDeletable(tag.type)) {
  return { success: false, error: 'System tags cannot be deleted' };
}
```

The renderer no longer needs to know this rule — it just handles the error response if it somehow fires a disallowed operation.

### Benefits

- **Adding a new system tag type** requires touching exactly one file: `tag-types.js`
- **User-defined tag types** can adopt the same metadata shape in the future, enabling per-type display/edit rules without code changes
- **The renderer is a view** — it renders what the backend describes, not what it hardcodes

### Phase Plan Addition

Add a **Phase 5 — Domain Centralization** step:
- Create `electron/main/domain/tag-types.js`
- Expose `db:getTagTypes` via IPC
- Move system tag deletion guard to `db:deleteTag` handler
- Remove hardcoded constants from `TagAssignmentSection.jsx`
- Add tag type metadata to `useTagsStore` (fetched once on mount)

---

## ID Normalization (Housekeeping, v0.4)

Since SurrealDB IDs continue to return as `RecordId` objects, v0.4 should centralize normalization at the IPC boundary rather than at every consumption site. All handlers normalize before returning:

```js
// electron/main/utils/normalize.js

export function normalizeRecord(record) {
  if (!record) return record;
  return {
    ...record,
    id: record.id?.id || record.id,
  };
}
```

Applied in handlers:
```js
return { success: true, data: normalizeRecord(result) };
```

Removes the `id?.id || id` pattern from all components and stores.

---

## Zustand Store Consolidation

### The Problem in v0.3

Three stores (`useObjectsStore`, `useCollectionsStore`, `useTagsStore`) operate independently but always need to coordinate. Assigning a tag requires calling both the tags store and reloading objects. There's no shared state — each store calls IPC independently and manages its own loading/error flags. With LIVE SELECT arriving in v0.4, each store would need its own live subscription, its own listener setup, and its own patch logic.

### One Store

Consolidate into a single `useIndexStore` using Zustand's slice pattern:

```js
// src/store/index.js

export const useIndexStore = create((set, get) => ({
  // --- Objects ---
  objects: [],

  // --- Collections ---
  collections: [],
  activeCollectionId: null,

  // --- Tags ---
  tags: [],           // all tag definitions
  tagTypes: {},       // system tag type registry (from db:getTagTypes)
  objectTags: {},     // objectId → tag[] cache

  // --- Live subscription (wired once on app mount) ---
  subscribeToLive: () => {
    window.electronAPI.onObjectsLive(({ action, result }) => {
      // patch objects array in place
    });
    window.electronAPI.onTagAssignmentsLive(({ action, result }) => {
      // patch objectTags cache in place
    });
    window.electronAPI.onCollectionsLive(({ action, result }) => {
      // patch collections array in place
    });
  },

  // --- Derived ---
  filteredObjects: () => {
    const { objects, collections, activeCollectionId } = get();
    if (!activeCollectionId) return objects;
    // evaluate active collection query against objects
  },

  // --- Object actions ---
  addObject: async (data) => { ... },
  updateObject: async (id, data) => { ... },
  deleteObject: async (id) => { ... },

  // --- Collection actions ---
  activateCollection: (id) => set({ activeCollectionId: id }),
  addCollection: async (data) => { ... },
  removeCollection: async (id) => { ... },

  // --- Tag actions ---
  assignTag: async (objectId, tagId) => { ... },
  unassignTag: async (objectId, tagId) => { ... },
  loadTagsForObject: async (objectId) => { ... },
}));
```

### What Happens to `useHistoryStore`

Keep it separate. The history store is orthogonal — it tracks user intent, not data state. It doesn't need live updates, doesn't interact with IPC, and has no coordination requirements with the data stores. Keeping it isolated makes it easier to reason about.

### Benefits

- **One live subscription setup** on app mount instead of three
- **Cross-domain operations are atomic** — assigning a tag can update `objectTags` and `objects` in a single `set()` call
- **One loading/error state** — simpler UI error handling
- **`filteredObjects` as a derived selector** — no separate store action needed; computed from active collection + objects on read

### Phase Plan Addition

Add a **Phase 6 — Store Consolidation** step (do alongside Phase 1–2):
- Create `src/store/index.js` with merged slice structure
- Wire single `subscribeToLive()` call in `App.jsx` on mount
- Migrate all component imports from three stores to one
- Delete `src/store/objects.js`, `src/store/collections.js`, `src/store/tags.js`
- Keep `src/store/history.js` independent

---

## Undo System

### Current State (v0.3)

`useHistoryStore` exists with a generic command stack:
```js
push({ description: string, undo: async fn })
undo() → calls history[currentIndex].undo()
```

It is only wired to one operation (object deletion). The infrastructure is correct; the coverage is not.

### What Should Be Undoable

Every destructive or hard-to-reverse user action:

| Operation | Undo Action |
|---|---|
| Delete object | Recreate with same sources; reassign user tags |
| Rename object | Restore previous name |
| Change graph label | Restore previous label |
| Assign tag | Unassign tag |
| Unassign tag | Reassign tag |
| Add source to object | Remove that source |
| Create collection | Delete collection |
| Delete collection | Recreate with same query |

**Not undoable** (read-only or reversible by nature):
- Window profile switch
- Appearance settings
- Collection activation (filter state, no data change)

### Implementation Pattern

Each store action captures a snapshot and pushes to history before executing:

```js
deleteObject: async (id) => {
  const object = get().objects.find(o => o.id === id);
  const userTags = (get().objectTags[id] || []).filter(t => !t.system);

  useHistoryStore.getState().push({
    description: `Delete "${object.name}"`,
    undo: async () => {
      const { data } = await window.electronAPI.db.createObject({
        name: object.name,
        sources: object.sources,
      });
      const newId = data?.id;
      for (const tag of userTags) {
        await window.electronAPI.db.assignTag(newId, tag.id);
      }
      // LIVE SELECT pushes the restored object to the store automatically
    },
  });

  await window.electronAPI.db.deleteObject(id);
  // LIVE SELECT removes the object from the store automatically
},
```

With LIVE SELECT, undo closures become simpler — they just call the inverse IPC operation and the UI updates automatically. No manual `loadObjects()` needed anywhere in the undo function.

### User Feedback

Undo without feedback is invisible. Add a transient toast notification after any undoable action:

```
[ Deleted "report.pdf"   Cmd+Z to undo ]
```

- Appears for 4 seconds
- Dismissed on Cmd+Z (which also triggers undo)
- Replaced by the next action's toast if fired quickly
- No external library needed — a single positioned `<div>` with CSS transition

### Stack Behaviour

- **Depth**: 20 entries (current limit is appropriate)
- **Session-only**: not persisted across restarts
- **Cleared on restart**: avoids confusing cross-session undo state

### Phase Plan Addition

Add a **Phase 7 — Undo System** step:
- Wire `push()` to all undoable store actions (see table above)
- Add toast notification component
- Ensure undo closures rely on LIVE SELECT for UI updates, not manual reloads

---

## Phase Plan

### Phase 0 — Persistent SurrealDB (prerequisite)
- Change SurrealDB path from temp dir to `~/.index/surreal/`
- Implement `migrateFromV3IfNeeded()` for one-time data import
- Remove startup hydration (replace with existence check)
- Validate: data survives app restart without JSON loading

### Phase 1 — LIVE SELECT Subscriptions
- Implement `startLiveQueries()` in main process
- Expose `onObjectsLive`, `onTagAssignmentsLive`, `onCollectionsLive` via preload
- Add `subscribeToLive()` to each store
- Wire subscription in `App.jsx` on mount

### Phase 2 — Remove Full Reloads
- Remove `loadObjects()` / `loadCollections()` / `loadTags()` from all mutation handlers
- Keep initial load on mount only (to populate store from current DB state)
- Validate: mutations produce correct UI updates via live patches only

### Phase 3 — Async Export
- Replace `persistToIndex()` with `scheduleExport()` in all handlers
- Ensure `exportToJson()` runs on `before-quit`
- Add "Export data" action to Settings UI
- Retire file watcher

### Phase 4 — ID Normalization
- Implement `normalizeRecord()` utility
- Apply at IPC boundary in all handlers
- Remove `id?.id || id` from stores and components

### Phase 5 — Domain Centralization
- Create `electron/main/domain/tag-types.js` with system tag registry
- Expose `db:getTagTypes` IPC handler
- Move system tag deletion enforcement to `db:deleteTag` handler
- Remove hardcoded `DISPLAYED_SYSTEM_TAG_TYPES`, `SYSTEM_TAG_ORDER`, `getTagTypeLabel()` from `TagAssignmentSection.jsx`
- Fetch and cache tag type metadata in consolidated store on mount

### Phase 6 — Store Consolidation (alongside Phase 1–2)
- Create `src/store/index.js` with merged `useIndexStore`
- Wire single `subscribeToLive()` on app mount
- Migrate all component imports from `useObjectsStore`, `useCollectionsStore`, `useTagsStore` to `useIndexStore`
- Implement `filteredObjects` as an in-store derived selector (no separate evaluation call)
- Delete the three individual store files; keep `src/store/history.js` independent

### Phase 7 — Undo System
- Wire `useHistoryStore.push()` to all undoable actions (delete object, rename, label change, assign/unassign tag, add/remove source, create/delete collection)
- Add toast notification component for undo feedback
- Ensure all undo closures rely on LIVE SELECT for UI updates (no manual reloads)

---

## Success Criteria

- [ ] App data persists across restarts without any JSON loading on startup
- [ ] Adding an object updates the graph within one render cycle, no full reload
- [ ] Assigning a tag updates the UI immediately via live patch
- [ ] JSON export files in `~/.index/export/` accurately reflect current state after quit
- [ ] v0.3 data is automatically imported on first v0.4 launch
- [ ] No `persistToIndex()` calls remain in mutation handlers
- [ ] No `loadObjects()` calls remain in mutation handlers or store actions
- [ ] No hardcoded system tag type constants exist in frontend components
- [ ] Attempting to delete a system tag via IPC is rejected by the handler, not the UI
- [ ] Adding a new system tag type requires touching only `tag-types.js`
- [ ] All data state managed by a single `useIndexStore`; three old stores deleted
- [ ] All undoable operations push to history stack before executing
- [ ] Undo toast appears after every destructive action
- [ ] Undo closures require no manual `loadObjects()` calls — LIVE SELECT handles UI
