# Interactive Graph Visualization

This is a reimplementation of the Quartz interactive graph feature using D3.js, Pixi.js, and Preact.

## Features

- **Force-directed graph layout** using D3.js physics simulation
- **High-performance rendering** with Pixi.js WebGPU/Canvas
- **Interactive nodes** with hover, click, drag, and zoom
- **Neighbor highlighting** on hover
- **Label opacity** adjusts based on zoom level
- **Visited state tracking** using localStorage

## Project Structure

```
quartz-graph_reverse/
├── src/
│   ├── types.ts              # TypeScript type definitions
│   ├── dataProcessor.ts      # BFS neighborhood computation
│   ├── simulation.ts         # D3 force simulation
│   ├── renderer.ts           # Pixi.js 3-layer rendering
│   ├── interactions.ts       # Hover, drag, zoom handlers
│   ├── graph.ts              # Main graph controller
│   ├── Graph.tsx             # Preact component wrapper
│   └── index.ts              # Entry point
├── test-data/
│   └── contentIndex.json     # Sample graph data (10 nodes)
├── index.html                # HTML test harness
├── styles.css                # CSS styles
└── package.json              # Dependencies

repo/                          # Original Quartz implementation (reference)
```

## Installation

```bash
npm install
```

## Development

Start the development server:

```bash
npm run dev
```

Then open http://localhost:5173/ in your browser.

## Building

Build for production:

```bash
npm run build
```

The output will be in the `dist/` directory.

## How It Works

### Architecture

The implementation uses a three-layer architecture:

1. **D3.js Force Simulation** - Calculates node positions using physics
   - `forceManyBody`: Nodes repel each other
   - `forceCenter`: Pulls toward center
   - `forceLink`: Maintains link distances
   - `forceCollide`: Prevents overlap

2. **Pixi.js Rendering** - High-performance canvas rendering with 3 z-index layers:
   - Layer 1: Links (background)
   - Layer 2: Node circles
   - Layer 3: Labels (foreground)

3. **Interaction Handlers** - Manages user input:
   - Hover: Highlights connected nodes/links
   - Drag: Repositions nodes (< 500ms = click navigation)
   - Zoom: Scales viewport, adjusts label opacity

### Data Flow

1. Load `contentIndex.json` with node data
2. Build links between nodes
3. Compute neighborhood using BFS (Breadth-First Search)
4. Initialize D3 simulation with forces
5. Create Pixi graphics for nodes and links
6. Setup event handlers
7. Start animation loop:
   - Update positions from D3
   - Redraw links
   - Render frame

### Key Implementation Details

**Node Positioning**
```typescript
// Nodes centered in canvas
node.position.set(x + width/2, y + height/2)
```

**Node Radius**
```typescript
// Size based on connectivity
radius = 2 + Math.sqrt(numConnections)
```

**Link Rendering**
```typescript
// Redrawn every frame
gfx.clear()
gfx.moveTo(source.x + width/2, source.y + height/2)
gfx.lineTo(target.x + width/2, target.y + height/2)
```

**BFS Neighborhood**
```typescript
// Uses "__SENTINEL" to track depth levels
const wl = [startNode, "__SENTINEL"]
while (depth >= 0 && wl.length > 0) {
  const cur = wl.shift()
  if (cur === "__SENTINEL") {
    depth--
    wl.push("__SENTINEL")
  } else {
    // Add neighbors to work list
  }
}
```

**Zoom Label Opacity**
```typescript
// Labels fade in as you zoom in
opacity = Math.max((zoomLevel * opacityScale - 1) / 3.75, 0)
```

## Configuration

The graph accepts a `D3Config` object:

```typescript
{
  drag: true,              // Enable node dragging
  zoom: true,              // Enable zoom/pan
  depth: 1,                // Neighborhood depth (1 = immediate neighbors, -1 = all)
  scale: 1.1,              // Initial scale factor
  repelForce: 0.5,         // Node repulsion strength
  centerForce: 0.3,        // Center attraction strength
  linkDistance: 30,        // Distance between linked nodes
  fontSize: 0.6,           // Label font size
  opacityScale: 1,         // Label opacity scaling
  showTags: false,         // Show tag nodes
  removeTags: [],          // Tags to exclude
  focusOnHover: false,     // Dim non-connected nodes on hover
  enableRadial: false      // Use radial force layout
}
```

## Test Data

The `test-data/contentIndex.json` contains 10 interconnected nodes representing a knowledge graph about graph visualization topics:

- introduction
- basics
- visualization
- d3-overview
- algorithms
- data-structures
- force-layouts
- pixi-rendering
- bfs-search
- webgl-performance

Each node has:
- `slug`: Unique identifier
- `title`: Display name
- `links`: Array of connected node slugs
- `tags`: Associated tags
- `content`: Description text

## Usage in Preact

```tsx
import Graph from './Graph'

function App() {
  const config = {
    drag: true,
    zoom: true,
    depth: 1,
    scale: 1.1,
    repelForce: 0.5,
    centerForce: 0.3,
    linkDistance: 30,
    fontSize: 0.6,
    opacityScale: 1,
    showTags: false,
    removeTags: [],
  }

  return <Graph config={config} currentSlug="introduction" />
}
```

## Dependencies

- **d3** (v7.9.0) - Force simulation and interaction utilities
- **pixi.js** (v8.14.3) - WebGPU/Canvas rendering
- **preact** (v10.19.3) - Lightweight React alternative

## Reference Implementation

The original implementation is located in `repo/quartz/components/`:
- `Graph.tsx` - Component wrapper
- `scripts/graph.inline.ts` - Core logic (650+ lines)
- `styles/graph.scss` - Styling

## License

This is a reverse-engineered implementation for educational purposes.
