---
author: Claude Opus 4.7
date: 2026-04-19
version: 0.6
based_on: 0.5/docs/QUICKSTART.md (Claude Sonnet 4.6, 2026-03-26)
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

On first boot, the graph migration runs automatically: the boot-time backfill (`graph-migration.js`) walks all existing legacy `tagged`+`typed` pairs and mirrors them into the corresponding per-edge RELATION tables. Idempotent — safe to re-run.

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
| Cmd+E | Edit tags / rules for selected object(s) |
| W / ↑ | Move selection up in list |
| S / ↓ | Move selection down in list |
| A / ← | Navigate back |
| D / → | Navigate forward / enter selected |
| Shift+W/S/↑/↓ | Extend list selection (Finder range) |
| Cmd+A | Select all objects in current view |
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
├── appearance.json            # Appearance settings (IPC-backed; localStorage is in-session cache)
└── window-settings.json       # Window geometry and profile
```

Export runs automatically — debounced 5 seconds after any mutation, and on quit. Export paths still use legacy table names; they will be updated when Phase 3 drops those tables.

---

## Project Structure

```
electron/
  main/
    index.js              # Entry point — app lifecycle, hotkeys, startup sequence
    capture/              # Cmd+I global capture (Safari + default handlers)
    config/               # Device ID, window settings, appearance settings
    db/
      connection.js       # SurrealDB process management, table/edge init, system spaces
      edges.js            # SYSTEM_EDGES registry; addEdge/removeEdge helpers
      graph-migration.js  # Boot-time backfill to new shape; dual-write helpers
      rule-compiler.js    # Rule → SurrealQL compiler
      live-queries.js     # LIVE SELECT → renderer push (objects + legacy + pilot edges)
      export.js           # Async JSON export
      migration.js        # v0.3 → v0.4 one-time import + legacy schema patches
      repair.js           # System tag repair
      surreal-utils.js    # Shared SurrealDB query helpers
      services/
        edge-service.js      # getPillsForObject — new-shape pill reads
        object-service.js    # Object creation + system tag edge + sourced_from assignment
        space-service.js     # Space membership evaluation (rule + contains − excludes)
        device-service.js    # Device records + sourced_from edge management
        system-tags.js       # Find-or-create system tags
    dialogs/              # Device naming dialog (first run)
    domain/               # System tag type registry (SYSTEM_TAG_TYPES, seedTagTypes)
    ipc/                  # IPC handlers: objects, tags, tag types, spaces, edges, devices
    utils/                # Metadata extraction, ID normalization, file recovery
    window-manager/       # macOS window profiles (overlay, window)
  preload/
    index.js              # Context bridge — secure IPC surface

src/
  App.jsx                 # Root component, view routing, filter/sort pref persistence
  icons/
    index.jsx             # Shared icons: ObjectIcon (●), SpaceIcon (○), MonadIcon (◎), TypeIcon
  components/
    ObjectListView.jsx    # List view — two-bit filter, sort, thumbnails, kind column, multi-select
    ObjectDetailPane.jsx  # Detail sidebar — name, type, source, pills, rules, pin, thumbnail
    TagAssignmentSection.jsx # Pill UI (new shape reads; legacy IPC mutations)
    TagAddInput.jsx       # Flexible typed/untyped tag input with autocomplete (shared)
    TagEditModal.jsx      # CMD+E modal — space rules / object tags / batch tag editing
    SpaceRulesSection.jsx # Inline space rule editor (stub — Stage B+ deferred)
    TypeSchemaSection.jsx # Guided schema field rows, driven by type-Object schema
    ObjectCardModal.jsx   # Card-style modal view for an object
    QuickSpaceView.jsx    # Quick-access space overlay
    ObjectSourceView.jsx  # Dispatches to PdfViewer or webview by source type
    PdfViewer.jsx         # Canvas-based PDF renderer (pdfjs-dist), continuous scroll
    AddressBar.jsx        # Navigation strip + CMD+L general search (spaces + objects)
    CommandPalette.jsx    # CMD+K command interface
    TagsView.jsx          # Tag management — Types pinned first, icon picker, schema editor
    GraphView.jsx         # D3 force-directed graph — ●/○ nodes, click-to-select
    SettingsView.jsx      # Settings — appearance, devices, keybinds tab
    AppearanceSettings.jsx# HSLA appearance controls
    ImportModal.jsx       # Finder import UI — per-folder tags, space creation
    CreateSpaceModal.jsx  # ORPHANED — replaced by SpaceRulesSection + inline create
    _archive/             # CalendarView, DayView, TagAssignmentSection (old), UndoToast
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
  architecture.md         # Deep-dive: unified graph model, dual-write, read/write paths
  data-model-proposal.md  # Original proposal for the unified graph data model
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

**Pill data stale / not showing**

Check for `[ObjectService] mirror failed` or `[GraphMigration]` warnings in the Electron console. The dual-write mirror is non-fatal — legacy tags exist but the new-shape pill cache may be incomplete. Re-launching triggers the idempotent boot-time backfill.
