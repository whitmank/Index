---
author: Claude Code
date: 2026-03-17
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
| Cmd+` | Toggle overlay window |
| Cmd+Shift+` | Toggle main window visibility |
| Cmd+I | Capture frontmost browser tab |
| Cmd+K | Open command palette |
| Cmd+L | Focus address bar / navigate to space |
| Cmd+, | Open settings |
| Cmd+. | Toggle detail panel |
| Cmd+/ | Navigate to root |
| Cmd+O | Create new object |
| Cmd+A / Cmd+← | Navigate back |
| Cmd+D / Cmd+→ | Navigate forward |
| Cmd+Z | Undo last destructive action |
| Escape | Close / cancel |

**Cmd+I capture** requires Automation permission on macOS: System Settings → Privacy & Security → Automation.

---

## Data

All data lives in `~/.index/` on the user's machine.

```
~/.index/
├── surreal/                   # SurrealDB — primary source of truth
├── export/                    # Auto-exported JSON (human-readable backup)
│   ├── objects/
│   ├── tag_definitions/
│   ├── tag_types/
│   ├── tagged_edges.json
│   ├── contains_edges.json
│   ├── excludes_edges.json
│   └── typed_edges.json
├── .device-id                 # Device UUID and name
├── .version                   # Written on first v0.4 boot; gates v0.3 migration
└── window-settings.json       # Window geometry and profile
```

Export runs automatically — debounced 5 seconds after any mutation, and on quit.

On first boot, any existing v0.3 data at `~/.index/objects/` is automatically imported into SurrealDB.

---

## Project Structure

```
electron/
  main/
    index.js              # Entry point — app lifecycle, hotkeys, startup sequence
    capture/              # Cmd+I global capture (Safari + default handlers)
    config/               # Device ID, window settings
    db/
      connection.js       # SurrealDB process management, table/edge init, system spaces
      live-queries.js     # LIVE SELECT → renderer push (objects + 4 edge tables)
      export.js           # Async JSON export
      migration.js        # v0.3 → v0.4 one-time import
      repair.js           # System tag repair
      services/
        object-service.js    # Object creation + system tag edge assignment
        space-service.js     # Space membership evaluation
        system-tags.js       # Find-or-create system tags
    dialogs/              # Device naming dialog (first run)
    domain/               # System tag type registry (SYSTEM_TAG_TYPES, seedTagTypes)
    ipc/                  # IPC handlers: objects, tags, tag types, spaces, edges
    utils/                # Metadata extraction, ID normalization, file recovery
    window-manager/       # macOS window profiles (overlay, window)
  preload/
    index.js              # Context bridge — secure IPC surface

src/
  App.jsx                 # Root component, view routing
  components/
    ObjectListView.jsx    # List view — spaces and leaf objects
    AddressBar.jsx        # Navigation strip + integrated CMD+L navigator
    CommandPalette.jsx    # CMD+K command interface
    TagsView.jsx          # Tag management, grouped by type
    QuickSpaceView.jsx    # Floating overlay window
    GraphView.jsx         # D3 force-directed visualization
    CreateSpaceModal.jsx  # Space creation/edit form
    CalendarView.jsx      # Monthly calendar grid
    DayView.jsx           # Object list for a selected calendar day
    SettingsView.jsx      # Settings page
    AppearanceSettings.jsx # HSLA appearance controls
  hooks/                  # useKeyboardShortcuts, useAppearance
  store/
    index.js              # useIndexStore — unified state + LIVE SELECT wiring
  lib/
    forceSimulation.js    # D3 force simulation

docs/
  ABOUT.md                # Technical reference: architecture, flows, key files, roadmap
  GLOSSARY.md             # Canonical terminology, data model, and IPC API
  BACKLOG.md              # Known gaps and planned features
  QUICKSTART.md           # This file
  PROJECT_DESIGN.md       # Design philosophy and principles
  COMMENT-CONVENTION.md   # Comment policy for the codebase
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
