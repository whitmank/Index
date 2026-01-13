import { GraphController } from './graph'
import type { D3Config } from './types'

/**
 * Initialize graph from container element
 */
async function initializeGraph() {
  const container = document.getElementById('graph-container')
  if (!container) {
    console.error('Graph container not found')
    return
  }

  const configStr = container.dataset.cfg
  if (!configStr) {
    console.error('Graph configuration not found')
    return
  }

  const config: D3Config = JSON.parse(configStr)
  const currentSlug = 'introduction' // Default starting node

  const graph = new GraphController(container, currentSlug, config)
  await graph.init()

  // Store graph instance for cleanup if needed
  ;(window as any).__graphInstance = graph
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeGraph)
} else {
  initializeGraph()
}

export { GraphController }
