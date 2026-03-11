/**
 * Force Simulation Logic
 *
 * Pure D3 force simulation setup and management.
 * Separated from React rendering logic.
 *
 * Author: Claude Code (Anthropic)
 */

import { forceSimulation, forceManyBody, forceCenter, forceCollide } from 'd3-force';

/**
 * Create a force simulation for graph nodes
 *
 * @param {Array} nodes - Array of node objects with id and name
 * @param {Object} dimensions - { width, height } of the simulation space
 * @param {Function} onTick - Callback function called on each simulation tick
 * @returns {Object} D3 force simulation instance
 */
export function createForceSimulation(nodes, dimensions, onTick) {
  if (!nodes || nodes.length === 0) {
    return null;
  }

  const simulation = forceSimulation(nodes)
    .force('charge', forceManyBody().strength(-80))
    .force('center', forceCenter(dimensions.width / 2, dimensions.height / 2))
    .force('collide', forceCollide(18))
    .on('tick', () => {
      // Apply boundary constraints
      nodes.forEach(node => {
        const padding = 12; // node radius
        node.x = Math.max(padding, Math.min(dimensions.width - padding, node.x));
        node.y = Math.max(padding, Math.min(dimensions.height - padding, node.y));
      });
      onTick();
    });

  return simulation;
}

/**
 * Extract positions from simulation nodes
 *
 * @param {Array} nodes - D3 nodes from simulation
 * @returns {Object} Map of node id to { x, y } position
 */
export function extractPositions(nodes) {
  const positions = {};
  nodes.forEach(node => {
    positions[node.id] = {
      x: node.x,
      y: node.y,
    };
  });
  return positions;
}

/**
 * Stop a running simulation
 *
 * @param {Object} simulation - D3 force simulation instance
 */
export function stopSimulation(simulation) {
  if (simulation) {
    simulation.stop();
  }
}
