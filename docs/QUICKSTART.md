# Quick Start Guide
<!-- Author: Claude Code -->

## Installation

```bash
npm install
```

## Development

```bash
npm run electron:dev
```

Starts the Vite dev server and launches Electron. The app loads from `http://localhost:5173`.

On first launch you'll be prompted to name this device (e.g. "My Laptop"). This name is used as the `origin` value on all locally-added sources.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Cmd+` | Toggle window visibility |
| Cmd+I | Capture frontmost browser tab |
| Cmd+. | Toggle settings modal |
| Cmd+; | Toggle object detail sidebar |
| Cmd+Z | Undo last destructive action |

## Building

```bash
npm run electron:build
```

Builds Vite assets and packages via Electron Builder. Output: `dist-electron/`.

## Project Structure

```
index-workspace/0.3/
├── electron/
│   ├── main/
│   │   ├── index.js              # App entry point, lifecycle, hotkeys
│   │   ├── capture/              # Global Cmd+I capture (Safari + default handlers)
│   │   ├── config/               # Device ID, window settings persistence
│   │   ├── db/                   # SurrealDB lifecycle, hydration, persistence, repair
│   │   ├── ipc/                  # IPC handlers (db, device, window)
│   │   ├── utils/                # Metadata extraction, file recovery
│   │   ├── watchers/             # File system watcher (~/.index/objects/)
│   │   └── window-manager/       # macOS window profiles (overlay, window)
│   └── preload/
│       └── index.js              # Context bridge (secure IPC)
├── src/
│   ├── App.jsx                   # Root component, drag-drop, paste, keyboard
│   ├── components/               # GraphView, ObjectDetailSidebar, CollectionsSidebar,
│   │                             # SettingsModal, TagAssignmentSection, AppearanceSettings
│   ├── hooks/                    # useKeyboardShortcuts, useAppearance
│   ├── lib/                      # forceSimulation (D3 config)
│   ├── store/                    # objects, collections, tags, history (Zustand)
│   └── styles/                   # GraphView.css
├── docs/                         # Documentation
│   ├── GLOSSARY.md               # Canonical terminology
│   ├── BACKLOG.md                # Planned features
│   ├── PROJECT_DESIGN.md         # Design principles and architecture
│   ├── QUICKSTART.md             # This file
│   ├── dev-logs/                 # Session development logs
│   └── feature-dev/              # Feature specs and architecture plans
├── vite.config.js
├── package.json
└── index.html
```

## Data Storage

All data is stored in `~/.index/` on the user's machine.

```
~/.index/
├── objects/                 # One JSON file per object
├── tag_definitions/         # One JSON file per tag
├── tag_assignments.json     # All object↔tag mappings
├── collections/             # One JSON file per collection
├── .device-id               # Device identification
└── window-settings.json     # Window size/position/profile
```

## Environment

- **Node.js**: 22+
- **Electron**: 39.2.7
- **SurrealDB**: 1.3.2 (must be installed and in PATH)
- **React**: 18.2.0
- **Vite**: 6.0.0

### macOS

- SurrealDB installed via Homebrew: `brew install surrealdb/tap/surreal`
- Native vibrancy (`popover`) for window blur
- Frameless transparent overlay window by default
- Cmd+I capture requires Automation permission (System Settings → Privacy)

### Windows / Linux

- CSS fallback for window blur effects
- Capture system (Cmd+I) is macOS-only in v0.3

## Troubleshooting

**SurrealDB not found:**
```bash
which surreal       # should return a path
brew install surrealdb/tap/surreal
```

**Port 8000 in use:**
```bash
lsof -i :8000
kill -9 <PID>
```

**Data not appearing after restart:**
```bash
ls -la ~/.index/objects/    # check files exist
```

**Device naming dialog not appearing:**
Delete `~/.index/.device-id` to trigger first-run dialog again.
