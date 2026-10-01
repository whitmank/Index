---
title: UI Audit — Index 0.6
date: 2026-05-03
author: Claude Sonnet 4.6
---

# UI Audit — Index 0.6

## Overview

Index 0.6 is a personal semantic layer over files and URLs. Built with Electron + React 18, Zustand, D3, and SurrealDB. Three-table data model: nodes, edges, edge_types.

The app uses a **modal/sidebar overlay pattern** with a persistent address bar:

```
┌─────────────────────────────────────┐
│          AddressBar                 │  ← Back | Search | View toggle | New menu
├─────────────────────────────────────┤
│                                     │
│  Main Content Area                  │
│  (List, Graph, or Settings)         │
│                                     │
│  + Detail Pane (right sidebar)      │
│                                     │
└─────────────────────────────────────┘
```

---

## Navigation Model

Three top-level modes:
1. **Browsing** (`activeTopView: 'list'`) — list or graph of current group's children
2. **Viewing Detail** — side pane overlay showing node properties, sources, edges
3. **Settings** (`activeTopView: 'settings'`)

Navigation history (`navHistory`, `navCursor`) supports back/forward.

Special node IDs:
- `nodes:⟨~⟩` — home (user entry point)
- `nodes:⟨/⟩` — root (all non-system nodes)

---

## Screens

### Address Bar (persistent)
**File:** `src/components/AddressBar.jsx`

What the user sees:
- Left: Back button (disabled at history start)
- Center: Current location label — click to enter search mode
  - Search dropdown: groups (○), objects (●), tags (◇)
  - Tab toggles dropdown, Enter/Click selects, Escape closes
- Right: View toggle (≡ list / ⬡ graph), "+" new-node menu (Object or Group)

Issues:
- No result count — user doesn't know if query returns 0 or 100 matches before navigating
- No focus trap — clicking outside closes dropdown
- "+" is not visually identifiable as a dropdown

---

### List View (primary browsing)
**File:** `src/components/NodeListView.jsx`

Finder-style two-column table. Default sort: system nodes first (hidden), groups before objects, created date descending.

User interactions:
- Single click: select (opens detail pane if not a group)
- Cmd/Shift+Click: multi-select
- Double-click: enter group
- Arrow keys / W/S: move selection
- Cmd+A: select all
- Delete/Backspace: delete selected
- Drag & drop files/links: create nodes

Issues:
- Sort order resets on navigation away
- No undo on delete — permanent and immediate
- No visual drag feedback
- Thumbnail load failures are silent
- Clicking an object opens detail pane but provides no path forward — terminus

---

### Detail Pane (right sidebar / full-width for objects)
**File:** `src/components/NodeDetailPane.jsx`

Sections:
- **Name:** Double-click to edit inline; Enter saves, Escape cancels; schema badge shown
- **Sources** (objects only): file/URL URIs; click to open in system app
- **Edges:** Grouped by edge type; "+" to add; "×" to remove
  - Add form: direction (→ out / ← in), edge type (auto-created), target node (fuzzy name match)

Issues:
- Edge target matched by name — undefined behavior if two nodes share a name
- Silent failure if target name not found — no error shown
- No feedback on name save (no spinner, no confirmation)
- Direction toggle ("→ out / ← in") unexplained
- No edge type autocomplete
- No duplicate edge prevention in UI
- Full-width close button calls `navBack()` — potential dead-end depending on history state

---

### Graph View (D3 force-directed)
**File:** `src/components/GraphView.jsx`

SVG canvas with draggable nodes and directed edges. Nodes: circles (12px). Labels truncated to 24 chars. Edges: lines with arrow markers.

User interactions:
- Click node: select, open detail pane
- Drag node: fix position
- Scroll/pinch: zoom and pan

Issues:
- No edge type labels visible
- No keyboard navigation
- No context menu on nodes
- Arrow markers don't scale with zoom
- No loading/settling indicator for large graphs
- Node selection styling may be non-obvious

---

### Settings (4 tabs)
**File:** `src/components/SettingsView.jsx`

| Tab | Content | Issues |
|---|---|---|
| Devices | Read-only list of device nodes | Completely inert — no actions, no explanation |
| Edge Types | Create/delete edge types | No explanation of purpose for new users |
| Appearance | HSLA sliders (hue, saturation, lightness, opacity) | No reset to defaults; opacity slider allows 0 (guarded in code, not UI) |
| Keybinds | Static reference table | Read-only — no customization |

Tab switching: Cmd+1/2/3/4.

---

## Component Tree

### List/Graph screen
```
App.jsx
├── AddressBar
│   ├── Back button
│   ├── Search input (toggleable)
│   │   └── Filtered dropdown
│   ├── View toggle
│   └── New menu
├── NodeListView (activeView: 'list')
│   └── NodeRow × N
└── GraphView (activeView: 'graph')
│   └── SVG / D3
└── NodeDetailPane (if detailNodeId set)
    ├── Name editor
    ├── Sources list
    └── Edges editor
```

### Object screen (full-width detail)
```
App.jsx
├── AddressBar
└── NodeDetailPane (fullWidth: true)
```

### Settings screen
```
App.jsx
├── AddressBar
└── SettingsView
    └── DevicesTab | EdgeTypesTab | AppearanceTab | KeybindsTab
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Cmd+, | Open settings |
| Cmd+L | Search / address bar |
| Cmd+` | Go to home (~) |
| Cmd+/ | Go to root (/) |
| A / ← | Navigate back |
| D / → | Navigate forward |
| V | Toggle list/graph view |
| Cmd+V | Paste URL/file path |
| Enter | Open object detail |
| Delete / Backspace | Delete selected |
| Cmd+A | Select all |
| W / ↑ | Move selection up |
| S / ↓ | Move selection down |
| Escape | Dismiss overlays / clear selection |

---

## Critical Issues

| Issue | Severity |
|---|---|
| Edge creation fails silently if target name not found | High |
| Two nodes with same name — edge add behavior undefined | High |
| No async feedback on create/update/delete | High |
| Objects have no "enter" action — detail pane is a terminus | Medium |
| Detail pane full-width close → `navBack()` — potential dead-end | Medium |
| Sort order not persisted across navigation | Low |
| Thumbnail cache unbounded (in-memory, grows without limit) | Low |

---

## Feature Completeness

| Feature | Status |
|---|---|
| Browse groups | Complete |
| View/edit objects | Complete |
| Create nodes and groups | Complete |
| Create/delete edges | Complete |
| Delete nodes | Complete |
| Search / navigate | Complete |
| Drag-drop files | Complete |
| Paste URLs | Complete |
| Back/forward navigation | Complete |
| Appearance customization | Complete |
| Keyboard shortcuts | Complete |
| Multi-selection | Complete |
| Graph visualization | Complete |
| Real-time sync (IPC live updates) | Complete |
| Device management | Stub only |
| Keybind customization | Not implemented |
| Undo/redo | Not implemented |
| Bulk operations | Not implemented |
| Async error feedback | Not implemented |
