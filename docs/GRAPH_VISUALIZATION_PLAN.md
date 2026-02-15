---
Author: Claude Code (Anthropic)
Created: 2026-02-15
---

# D3.js Graph Visualization Implementation Plan

## Context

Replace the current list-based object view with a graph visualization. The existing list in App.jsx is a placeholder - users will now see objects as nodes in a force-directed graph. This is the foundation for the semantic, relationship-based interface described in PROJECT_DESIGN.md.

## Design Decisions

- **View**: Graph completely replaces list view
- **D3 Integration**: Declarative hybrid - D3 handles force simulation math, React renders SVG elements
- **Scope**: Visualization only - nodes for objects, no edges/relationships yet
- **Architecture**: Decompose App.jsx into separate components
- **State**: New Zustand store (`src/store/graph.js`) for positions/zoom with disk persistence
- **Interactions**: Drag nodes to reposition, zoom/pan canvas, click node opens source
- **Visuals**: Simple circles, uniform size and color, object names in faded text
- **Object creation**: Deferred to later session

## Dependencies

Add to package.json:
- `d3-force` - Force simulation calculations
- `d3-zoom` - Zoom/pan behavior
- `d3-drag` - Drag behavior

## Implementation Outline

### 1. Install Dependencies
```bash
npm install d3-force d3-zoom d3-drag
```

### 2. Create Graph Store
**File**: `src/store/graph.js`
- Node positions (keyed by object ID)
- Zoom/pan transform state
- Actions: update positions, save/load from disk
- IPC handlers for persistence to `~/.index/graph-state.json`

### 3. Create GraphView Component
**File**: `src/components/GraphView.jsx`
- Receives objects from props
- Uses d3-force simulation for layout calculations
- Renders `<svg>` with `<circle>` nodes and `<text>` labels
- Handles drag, zoom, pan interactions
- Syncs positions to graph store
- Click handler opens source via `window.electronAPI.openSource()`

### 4. Refactor App.jsx
- Remove list view code (forms, list rendering, edit mode)
- Import and render `<GraphView objects={objects} />`
- Keep object loading logic and Zustand integration
- Becomes thin orchestrator

### 5. Update Styles
**File**: `src/App.css`
- Remove list-specific styles
- Add graph container styles
- SVG should fill available space
- Match existing dark theme (nodes in blue accent color)

### 6. Add IPC for Graph Persistence
**Files**: `electron/main/ipc/db-handlers.js`, `electron/preload/index.js`
- Handler to save graph state JSON to disk
- Handler to load graph state on startup
- Expose via `window.electronAPI.graph.save/load()`

## Critical Files

**Create:**
- `src/store/graph.js` - Graph state management
- `src/components/GraphView.jsx` - Visualization component

**Modify:**
- `src/App.jsx` - Strip down to orchestrator
- `src/App.css` - Graph styles
- `package.json` - D3 dependencies
- `electron/main/ipc/db-handlers.js` - Persistence handlers
- `electron/preload/index.js` - Expose graph IPC

**Remove:**
- List view code from App.jsx (forms, edit mode, list rendering)

## Verification

1. Run `npm run electron:dev`
2. Objects appear as circles in force-directed layout
3. Drag nodes - positions update and persist
4. Zoom/pan works smoothly
5. Click node opens source file
6. Close and reopen app - layout is restored
7. Graph state saved to `~/.index/graph-state.json`

## Out of Scope

- Relationship visualization (edges)
- Creating new objects from graph view
- Node selection/highlighting
- Details panel
- Multi-select operations
- Graph layout algorithms beyond force-directed
