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
 * Create a force simulation for graph nodes.
 *
 * @param {Function} getNodes - Accessor returning the live node array. Called on every tick
 *   so boundary constraints always iterate the current array after simulation.nodes() updates.
 * @param {Object} dimensions - { width, height } of the simulation space
 * @param {Function} onTick - Callback called on each simulation tick
 * @returns {Object} D3 force simulation instance
 */
export function createForceSimulation(getNodes, dimensions, onTick) {
  const initialNodes = getNodes();
  if (!initialNodes || initialNodes.length === 0) return null;

  const simulation = forceSimulation(initialNodes)
    .force('charge', forceManyBody().strength(-80))
    .force('center', forceCenter(dimensions.width / 2, dimensions.height / 2))
    .force('collide', forceCollide(18))
    .on('tick', () => {
      // Use the accessor so boundary constraints always target the live node array,
      // even after simulation.nodes() replaces it during a data update.
      getNodes().forEach(node => {
        const padding = 12; // node radius
        node.x = Math.max(padding, Math.min(dimensions.width - padding, node.x));
        node.y = Math.max(padding, Math.min(dimensions.height - padding, node.y));
      });
      onTick();
    });

  return simulation;
}

/**
 * Update simulation nodes in-place. Survivors keep their x/y/vx/vy.
 * D3 only randomizes nodes that lack coordinates, so pre-seeded survivors are untouched.
 *
 * @param {Object} simulation - D3 force simulation instance
 * @param {Array} newNodes - Reconciled node array (survivors have coordinates pre-set)
 * @param {Object} dimensions - { width, height }
 */
export function updateSimulationNodes(simulation, newNodes, dimensions) {
  simulation.nodes(newNodes);
  simulation.force('center', forceCenter(dimensions.width / 2, dimensions.height / 2));
  simulation.alpha(0.3).restart();
}

/**
 * Nudge the simulation after a container resize.
 * Lower alpha than a data update — less visually disruptive.
 *
 * @param {Object} simulation - D3 force simulation instance
 * @param {Object} dimensions - { width, height }
 */
export function updateSimulationDimensions(simulation, dimensions) {
  simulation.force('center', forceCenter(dimensions.width / 2, dimensions.height / 2));
  simulation.alpha(0.15).restart();
}

/**
 * Stop a running simulation.
 *
 * @param {Object} simulation - D3 force simulation instance
 */
export function stopSimulation(simulation) {
  if (simulation) {
    simulation.stop();
  }
}
