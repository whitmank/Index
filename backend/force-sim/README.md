# Force Simulation Module

D3 force simulation physics engine for graph visualization.

## Structure

```
backend/force-sim/
├── index.js        # Module entry point (re-exports)
├── simulation.js   # Simulation creation and lifecycle
├── controls.js     # Dynamic node/link manipulation
└── package.json
```

## Usage

```javascript
import {
  createSimulation,
  reheatSimulation,
  stopSimulation,
  addNode,
  removeNode,
  addLink,
  removeLink,
  updateSimulationSize
} from '@index/force-sim'

// Create simulation
const nodes = [{ id: 'a', label: 'Node A' }, { id: 'b', label: 'Node B' }]
const links = [{ id: 'link1', source_id: 'a', target_id: 'b' }]
const simulation = createSimulation(nodes, links, 800, 600)

// Listen for position updates
simulation.on('tick', () => {
  // nodes now have x, y, vx, vy properties
  console.log(nodes.map(n => ({ id: n.id, x: n.x, y: n.y })))
})

// Dynamic updates
addNode(simulation, { id: 'c', label: 'Node C' })
addLink(simulation, { id: 'link2', source_id: 'b', target_id: 'c' })

// Reheat after manual repositioning
reheatSimulation(simulation)

// Cleanup
stopSimulation(simulation)
```

## API

### Simulation Lifecycle

| Function | Parameters | Description |
|----------|------------|-------------|
| `createSimulation` | `(nodes, links, width, height)` | Create new simulation |
| `reheatSimulation` | `(simulation)` | Restart physics (alpha 0.3) |
| `stopSimulation` | `(simulation)` | Stop simulation |

### Dynamic Controls

| Function | Parameters | Description |
|----------|------------|-------------|
| `addNode` | `(simulation, node)` | Add node to simulation |
| `removeNode` | `(simulation, nodeId)` | Remove node by ID |
| `addLink` | `(simulation, link)` | Add link (needs `source_id`, `target_id`) |
| `removeLink` | `(simulation, linkId)` | Remove link by ID |
| `updateSimulationSize` | `(simulation, width, height)` | Update center force |

## Forces

The simulation uses four forces:

- **link** - Spring forces between connected nodes (distance: 150, strength: 0.5)
- **charge** - Repulsion between all nodes (strength: -400)
- **center** - Gravity toward canvas center (strength: 0.1)
- **collide** - Prevent node overlap (radius: 30, strength: 0.8)

## Data Format

### Nodes
```javascript
{
  id: 'nodes:abc123',  // Unique identifier
  label: 'Node Label', // Display name
  x: 150.5,            // Position (set by simulation)
  y: 200.3             // Position (set by simulation)
}
```

### Links
```javascript
{
  id: 'links:xyz789',     // Unique identifier
  source_id: 'nodes:abc', // Source node ID
  target_id: 'nodes:def'  // Target node ID
}
```
