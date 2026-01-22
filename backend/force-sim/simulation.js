import * as d3 from 'd3-force'

/**
 * Create and configure a D3 force simulation
 *
 * @param {Array} nodes - Array of node objects with {id, label, x, y}
 * @param {Array} links - Array of link objects with {id, source_id, target_id}
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @returns {Object} D3 force simulation instance
 */
export function createSimulation(nodes, links, width, height) {
  // Transform links IN-PLACE to use D3's expected format
  // D3 will replace source/target strings with actual node object references
  links.forEach(link => {
    link.source = link.source_id
    link.target = link.target_id
  })

  // Initialize nodes at center if they don't have positions
  const centerX = width / 2
  const centerY = height / 2
  nodes.forEach(node => {
    if (node.x == null) node.x = centerX + (Math.random() - 0.5) * 50
    if (node.y == null) node.y = centerY + (Math.random() - 0.5) * 50
  })

  // Create the simulation with nodes
  const simulation = d3.forceSimulation(nodes)
    // Links: Spring forces between connected nodes
    .force('link', d3.forceLink(links)
      .id(d => d.id)
      .distance(35)   // Short links for tight grouping
      .strength(0.8)  // Strong springs
    )
    // Charge: Repulsion between all nodes
    .force('charge', d3.forceManyBody()
      .strength(-40)  // Minimal repulsion
    )
    // Center: Gravity toward canvas center
    .force('center', d3.forceCenter(centerX, centerY))
    // X/Y positioning forces to pull toward center
    .force('x', d3.forceX(centerX).strength(0.1))
    .force('y', d3.forceY(centerY).strength(0.1))
    // Collide: Prevent node overlap
    .force('collide', d3.forceCollide()
      .radius(10)  // Tiny collision buffer
      .strength(0.9)
    )
    // Simulation settings
    .alphaDecay(0.02)  // Moderate cooling
    .velocityDecay(0.3)  // Less friction for smoother movement

  return simulation
}

/**
 * Reheat the simulation to restart physics
 * Useful after manual node repositioning
 *
 * @param {Object} simulation - D3 simulation instance
 */
export function reheatSimulation(simulation) {
  if (!simulation) return

  simulation
    .alpha(0.3)  // Set energy level
    .restart()   // Resume simulation
}

/**
 * Stop the simulation completely
 *
 * @param {Object} simulation - D3 simulation instance
 */
export function stopSimulation(simulation) {
  if (!simulation) return

  simulation.stop()
}
