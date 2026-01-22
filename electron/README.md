# Electron Module

Desktop app wrapper providing native OS integration.

## Structure

```
electron/
├── main/
│   ├── index.js          # App lifecycle, window creation
│   ├── ipc/
│   │   ├── channels.js   # IPC channel constants
│   │   └── handlers.js   # IPC message handlers
│   └── services/
│       ├── database-manager.js   # SurrealDB process management
│       └── path-resolver.js      # Dev/prod path resolution
├── preload/
│   └── index.js          # Context bridge (renderer API)
└── resources/            # App icons
```

## IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `fs:select-directory` | renderer → main | Open folder picker |
| `fs:select-file` | renderer → main | Open file picker |
| `fs:select-paths` | renderer → main | Multi-select files/folders |
| `fs:get-file-metadata` | renderer → main | Get file stats |
| `fs:watch-path` | renderer → main | Start watching path |
| `fs:file-changed` | main → renderer | File change event |

## Renderer API

The preload script exposes `window.electronAPI`:

```javascript
await window.electronAPI.selectDirectory()
await window.electronAPI.selectPaths({ multiple: true })
await window.electronAPI.getFileMetadata(path)
```

## Development

Main process auto-reloads on changes (via `electron-reloader`).

Renderer loads from Vite dev server at `http://localhost:5173`.
