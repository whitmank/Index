---
Author: Claude Code
Updated: 2026-03-12
---

# Index — Quick Start

## Prerequisites

- **Node.js** 22+
- **SurrealDB** 1.3.2+ — must be installed and available in PATH

```bash
brew install surrealdb/tap/surreal
which surreal   # verify
```

---

## Setup

```bash
npm install
```

---

## Running

```bash
npm run electron:dev
```

Starts the Vite dev server and launches Electron. UI loads from `http://localhost:5173`.

On first launch, you'll be prompted to name this device (e.g. "My Laptop"). This name is recorded as the `origin` on all locally-added sources.

---

## Building

```bash
npm run electron:build
```

Produces a distributable in `dist-electron/`.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Cmd+` | Toggle window visibility |
| Cmd+I | Capture frontmost browser tab |
| Cmd+, | Toggle settings |
| Cmd+. | Toggle object detail sidebar |
| Cmd+Z | Undo last destructive action |

**Cmd+I capture** requires Automation permission on macOS: System Settings → Privacy & Security → Automation.

---

## Data

All data lives in `~/.index/` on the user's machine.

```
~/.index/
├── surreal/                 # SurrealDB — primary source of truth
├── export/                  # Auto-exported JSON (human-readable backup)
│   ├── objects/
│   ├── tag_definitions/
│   ├── collections/
│   └── tag_assignments.json
├── .device-id               # Device UUID and name
├── .version                 # Written on first v0.4 boot; gates v0.3 migration
└── window-settings.json     # Window geometry and profile
```

Export runs automatically — debounced 5 seconds after any mutation, and on quit.

On first v0.4 boot, any existing v0.3 data at `~/.index/objects/` is automatically imported into SurrealDB.

---

## Project Structure

```
electron/
  main/
    index.js              # Entry point — app lifecycle, hotkeys, startup sequence
    capture/              # Cmd+I global capture (Safari + default handlers)
    config/               # Device ID, window settings
    db/
      connection.js       # SurrealDB process management
      live-queries.js     # LIVE SELECT → renderer push
      export.js           # Async JSON export
      migration.js        # v0.3 → v0.4 one-time import
      repair.js           # System tag repair
      services/
        object-service.js # Object creation + system tag assignment
        system-tags.js    # Find-or-create system tags
    dialogs/              # Device naming dialog (first run)
    domain/               # System tag type registry
    ipc/                  # IPC handlers: db, device, window
    utils/                # Metadata extraction, ID normalization, file recovery
    window-manager/       # macOS window profiles (overlay, window)
  preload/
    index.js              # Context bridge — secure IPC surface

src/
  App.jsx                 # Root component
  components/             # GraphView, ObjectDetailSidebar, CollectionsSidebar,
                          # SettingsModal, TagAssignmentSection, UndoToast
  hooks/                  # useKeyboardShortcuts, useAppearance
  lib/                    # forceSimulation (D3 config)
  store/
    index.js              # useIndexStore — unified state
    history.js            # useHistoryStore — undo stack

docs/
  ABOUT.md                # Technical reference: architecture, flows, key files, roadmap
  GLOSSARY.md             # Canonical terminology and IPC API
  BACKLOG.md              # Known gaps and planned features
  PROJECT_DESIGN.md       # Design philosophy and principles
```

---

## Troubleshooting

**SurrealDB not found at startup**
```bash
which surreal                         # must return a path
brew install surrealdb/tap/surreal    # install if missing
```

**Port 8000 already in use**
```bash
lsof -i :8000
kill -9 <PID>
```

**Blank screen / data not loading**
```bash
ls ~/.index/surreal/    # confirm DB directory exists
```

**Reset device name**
```bash
rm ~/.index/.device-id    # triggers naming dialog on next launch
```

**Wipe and start fresh**
```bash
rm -rf ~/.index/surreal/
```
