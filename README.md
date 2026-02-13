# Index - Phase 0: Electron + Database Foundation

Minimal Electron window with Vite + React. Ready for SurrealDB integration.

## Setup

```bash
npm install
npm run electron:dev
```

The Electron window will open with the Vite dev server at `http://localhost:5173`.

## Structure

- `electron/main/index.js` - Electron main process
- `electron/preload/index.js` - Context bridge for IPC
- `src/` - React frontend source
- `vite.config.js` - Vite configuration
- `package.json` - Dependencies and scripts

## Next Steps (Phase 0)

1. Add SurrealDB lifecycle management (`electron/main/db/`)
2. Add data hydration from `.index/` files
3. Add data persistence to disk
4. Add IPC handlers for DB operations
5. Build minimal UI to test IPC
