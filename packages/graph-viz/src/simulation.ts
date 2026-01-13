import {
  forceSimulation,
  forceManyBody,
  forceCenter,
  forceLink,
  forceCollide,
  forceRadial,
  Simulation,
} from 'd3'
import type { D3Config, NodeData, LinkData } from './types'

export class GraphSimulation {
  private simulation: Simulation<NodeData, LinkData>
  private graphData: { nodes: NodeData[], links: LinkData[] }

  constructor(
    nodes: NodeData[],
    links: LinkData[],
    config: D3Config,
    width: number,
    height: number
  ) {
    this.graphData = { nodes, links }
    this.simulation = this.createSimulation(nodes, links, config, width, height)
  }

  /**
   * Create D3 force simulation with configured forces
   * - charge: Nodes repel each other
   * - center: Pulls nodes toward center
   * - link: Maintains link distances
   * - collide: Prevents node overlap
   * - radial (optional): Creates circular layout
   */
  private createSimulation(
    nodes: NodeData[],
    links: LinkData[],
    config: D3Config,
    width: number,
    height: number
  ): Simulation<NodeData, LinkData> {
    const sim = forceSimulation<NodeData>(nodes)
      .force("charge", forceManyBody().strength(-100 * config.repelForce))
      .force("center", forceCenter().strength(config.centerForce))
      .force("link", forceLink(links).distance(config.linkDistance))
      .force("collide", forceCollide<NodeData>((n) => this.nodeRadius(n)).iterations(3))

    // Add radial force for circular layout (global graph)
    if (config.enableRadial) {
      const radius = (Math.min(width, height) / 2) * 0.8
      sim.force("radial", forceRadial(radius).strength(0.2))
    }

    return sim
  }

  /**
   * Calculate node radius based on number of connections
   * More connected nodes are larger
   */
  private nodeRadius(d: NodeData): number {
    const numLinks = this.graphData.links.filter(
      (l) => l.source.id === d.id || l.target.id === d.id
    ).length
    return 2 + Math.sqrt(numLinks)
  }

  /**
   * Get the node radius for a given node (public method)
   */
  getNodeRadius(d: NodeData): number {
    return this.nodeRadius(d)
  }

  /**
   * Get the simulation instance
   */
  getSimulation(): Simulation<NodeData, LinkData> {
    return this.simulation
  }

  /**
   * Restart simulation with target alpha
   */
  restart(targetAlpha: number = 1): void {
    this.simulation.alpha(targetAlpha).restart()
  }

  /**
   * Stop the simulation
   */
  stop(): void {
    this.simulation.stop()
  }

  /**
   * Register a tick callback
   */
  onTick(callback: () => void): void {
    this.simulation.on("tick", callback)
  }
}
