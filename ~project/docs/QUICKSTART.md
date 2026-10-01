---
author: Claude Sonnet 4.6
date: 2026-03-26
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
| Cmd+Shift+Space | Toggle main window visibility |
| Cmd+\` | Navigate to `~` (home) |
| Cmd+/ | Navigate to `/` (all objects) |
| Cmd+I | Capture frontmost browser tab |
| Cmd+K | Open command palette |
| Cmd+L | Focus address bar / space navigator |
| Cmd+, | Open settings |
| V | Toggle list / graph view |
| `` ` `` | Cycle list filter (hold 300 ms for combined) |
| Cmd+A / Cmd+← | Navigate back |
| Cmd+D / Cmd+→ | Navigate forward |
| Escape | Close / restore prior context |

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
      live-queries.js     # LIVE SELECT → renderer push (objects + 5 edge tables)
      export.js           # Async JSON export
      migration.js        # v0.3 → v0.4 one-time import
      repair.js           # System tag repair
      services/
        object-service.js    # Object creation + system tag edge + sourced_from assignment
        space-service.js     # Space membership evaluation (tag + device rules)
        device-service.js    # Device records + sourced_from edge management
        system-tags.js       # Find-or-create system tags
    dialogs/              # Device naming dialog (first run)
    domain/               # System tag type registry (SYSTEM_TAG_TYPES, seedTagTypes)
    ipc/                  # IPC handlers: objects, tags, tag types, spaces, edges
    utils/                # Metadata extraction, ID normalization, file recovery
    window-manager/       # macOS window profiles (overlay, window)
  preload/
    index.js              # Context bridge — secure IPC surface

src/
  App.jsx                 # Root component, view routing, filter/sort pref persistence
  icons/
    index.jsx             # Shared icons: ObjectIcon (●), SpaceIcon (○), MonadIcon (◎)
  components/
    ObjectListView.jsx    # List view — two-bit filter, sort, per-space pref callbacks
    ObjectDetailPane.jsx  # Detail sidebar — name, source, tags, rules, pin
    TagAssignmentSection.jsx # Tag assignment with typedEdges pattern + TagAddInput
    SpaceRulesSection.jsx # Inline space rule editor (tag + device groups)
    AddressBar.jsx        # Navigation strip + integrated CMD+L navigator + create dropdown
    CommandPalette.jsx    # CMD+K command interface
    TagsView.jsx          # Tag management, grouped by type
    GraphView.jsx         # D3 force-directed graph — ●/○ nodes, click-to-select
    SettingsView.jsx      # Settings — appearance, keybinds tab
    AppearanceSettings.jsx # HSLA appearance controls
    CreateSpaceModal.jsx  # ORPHANED — replaced by SpaceRulesSection + inline create
    CalendarView.jsx      # Archived — not active
    DayView.jsx           # Archived — not active
  hooks/                  # useKeyboardShortcuts, useAppearance
  store/
    index.js              # useIndexStore — unified state + LIVE SELECT wiring
  lib/
    forceSimulation.js    # D3 force simulation — getNodes accessor, update helpers

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
