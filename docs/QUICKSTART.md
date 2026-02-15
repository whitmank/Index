# Quick Start Guide

## Installation

```bash
npm install
```

## Development

```bash
npm run electron:dev
```

This starts the Vite dev server and launches Electron. The app loads from `http://localhost:5173` in development mode.

### Global Hotkey

- **macOS**: Cmd+` (backtick)
- **Windows/Linux**: Ctrl+` (backtick)

Toggle window visibility with the hotkey. Window is hidden by default on startup.

## Building

```bash
npm run electron:build
```

Builds the Vite assets and packages the Electron app via Electron Builder. Outputs to `dist-electron/`.

## Project Structure

```
index-workspace/
├── electron/
│   ├── main/
│   │   ├── index.js           # App entry point
│   │   ├── db/                # Database lifecycle
│   │   ├── ipc/               # IPC handlers
│   │   ├── watchers/          # File watchers
│   │   └── utils/             # Utilities
│   └── preload/
│       └── index.js           # Context bridge
├── src/
│   ├── App.jsx                # React app
│   ├── App.css                # Styling
│   ├── store/                 # Zustand stores
│   └── hooks/                 # Custom hooks
├── docs/                      # Documentation
├── vite.config.js             # Vite config
├── package.json               # Dependencies
└── index.html                 # HTML entry
```

## Data Storage

Objects, relationships, and tags are persisted to `~/.index/` as JSON files.

- `~/.index/objects/` - Individual object files
- `~/.index/relationships/` - Relationship array
- `~/.index/tags/` - Tag array

## Environment

- **Node.js**: 22+ (included with Electron)
- **Electron**: 39.2.7
- **SurrealDB**: 1.3.2 (required)
- **React**: 18.2.0
- **Vite**: 6.0.0

### macOS Specific

- Requires SurrealDB binary installed (via Homebrew or system package manager)
- Uses native vibrancy (`popover`) for window blur effects
- Frameless, transparent overlay window

### Windows/Linux

- CSS fallback for window blur effects
- Frameless, transparent overlay window

## Troubleshooting

### SurrealDB not found
Ensure SurrealDB is installed and in PATH:
```bash
which surreal
```

### Port 8000 already in use
The database uses port 8000. Check for other processes:
```bash
lsof -i :8000
```

### Data not persisting
Check `~/.index/` directory exists and is writable:
```bash
ls -la ~/.index/
```

## Documentation

- `docs/dev-logs/` - Development session logs
- `docs/PHASE_1_PLAN.md` - Next phase roadmap
- `docs/0 - CORE/` - Architecture and design documents
