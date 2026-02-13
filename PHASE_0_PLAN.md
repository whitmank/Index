# Phase 0: Electron + Database Foundation

## Context
Rebuilding the Index application from first principles. Phase 0 establishes the minimal foundation: Electron shell that starts SurrealDB, loads data from disk, and provides IPC bridge for future state management.

**Architecture**: Disk (.index/ files) → SurrealDB (in-memory) → IPC bridge → React state store (Phase 1)

## Scope
- Strip Electron to essentials
- Start SurrealDB instance
- Load/persist data from `.index/` directory
- IPC bridge for DB operations
- Minimal React shell (just loads, no UI)

## File Structure

### Keep (simplified)
- `electron/main/index.js` - Main process, startup/shutdown
- `electron/preload/index.js` - Context bridge for IPC
- `electron/main/ipc/` - IPC handlers (DB operations only)

### Remove
- `services/database-manager.js` (Express logic unnecessary)
- `services/port-manager.js` (no Express)
- `services/path-resolver.js` (simplify inline)
- Complex file watching (defer to Phase 2)

### Add
- `electron/main/db/index.js` - SurrealDB lifecycle
- `electron/main/db/hydration.js` - Load from .index/
- `electron/main/db/persistence.js` - Save to .index/

## .index/ Directory Structure

```
.index/
├── nodes/
│   └── nodes.json          # Array of all nodes
├── tags/
│   └── tags.json           # Array of all tags
├── links/
│   └── links.json          # Array of all links
└── collections/
    └── collections.json    # Array of all collections
```

Format: Simple JSON files, one per data type. Keep it simple.

## Implementation Steps

### 1. Create DB service (`electron/main/db/index.js`)
- Start SurrealDB with in-memory mode
- Connect to DB instance
- Return connection handle

### 2. Hydration service (`electron/main/db/hydration.js`)
- Read .index/ JSON files
- Insert into SurrealDB tables
- Handle missing files (create empty arrays)

### 3. Persistence service (`electron/main/db/persistence.js`)
- Query all data from SurrealDB
- Write to .index/ JSON files
- Called on app shutdown or explicit save

### 4. IPC bridge (`electron/main/ipc/db-handlers.js`)
- `db:query` - Execute SurrealDB query, return results
- `db:mutate` - Execute mutation, persist to disk
- `db:getAll` - Get all nodes/tags/links/collections

### 5. Simplify main process (`electron/main/index.js`)
- Remove service complexity
- Start SurrealDB → hydrate → create window
- On quit: persist → stop DB

### 6. Minimal React shell
- Just load the app, confirm IPC works
- No real UI yet

## Startup Sequence

1. Parse args (--db namespace/database)
2. Start SurrealDB instance
3. Hydrate from .index/ files
4. Create BrowserWindow
5. Load React (from Vite dev server)
6. Register IPC handlers

## Shutdown Sequence

1. Persist all data to .index/ files
2. Stop SurrealDB
3. Close window
4. Exit

## Verification

- Run `npm run electron:dev`
- Confirm SurrealDB starts
- Confirm .index/ files are created if missing
- Confirm data loads into DB
- Open DevTools, call `window.electronAPI.dbQuery('SELECT * FROM nodes')`
- Confirm results returned
- Close app, confirm .index/ files updated

## Critical Files
- `electron/main/index.js` - Rewrite for simplicity
- `electron/main/db/index.js` - New DB service
- `electron/main/db/hydration.js` - New hydration
- `electron/main/db/persistence.js` - New persistence
- `electron/main/ipc/db-handlers.js` - New IPC bridge
- `electron/preload/index.js` - Update for DB IPC
