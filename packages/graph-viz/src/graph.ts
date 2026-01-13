import type { D3Config, ContentDetails, NodeRenderData, LinkRenderData } from './types'
import { GraphDataProcessor } from './dataProcessor'
import { GraphSimulation } from './simulation'
import { GraphRenderer } from './renderer'
import {
  HoverStateManager,
  DragHandler,
  ZoomHandler,
  computeStyleMap,
  getVisited,
  addToVisited,
} from './interactions'

export class GraphController {
  private dataProcessor!: GraphDataProcessor
  private simulation!: GraphSimulation
  private renderer: GraphRenderer
  private hoverManager: HoverStateManager
  private dragHandler: DragHandler
  private zoomHandler: ZoomHandler
  private stopAnimation: boolean = false
  private nodeRenderData: NodeRenderData[] = []
  private linkRenderData: LinkRenderData[] = []
  private width: number = 0
  private height: number = 0

  constructor(
    private container: HTMLElement,
    private currentSlug: string,
    private config: D3Config
  ) {
    this.renderer = new GraphRenderer()
    this.hoverManager = new HoverStateManager()
    this.dragHandler = new DragHandler()
    this.zoomHandler = new ZoomHandler()
  }

  /**
   * Main initialization - orchestrates all components
   */
  async init(): Promise<void> {
    try {
      // 1. Load data
      const contentIndex = await this.loadData()

      // 2. Process data
      this.dataProcessor = new GraphDataProcessor(contentIndex)
      const { links, tags } = this.dataProcessor.buildLinks(
        this.config.showTags,
        this.config.removeTags
      )

      // Compute neighborhood
      const neighbourhood = this.dataProcessor.computeNeighborhood(
        this.currentSlug,
        this.config.depth,
        links,
        this.config.showTags,
        tags
      )

      // Build graph data
      const graphData = this.dataProcessor.buildGraphData(neighbourhood, links)

      // 3. Get container dimensions
      this.width = this.container.offsetWidth
      this.height = Math.max(this.container.offsetHeight, 250)

      // 4. Initialize simulation
      this.simulation = new GraphSimulation(
        graphData.nodes,
        graphData.links,
        this.config,
        this.width,
        this.height
      )

      // 5. Create renderer
      const canvas = await this.renderer.init(this.width, this.height)
      this.container.appendChild(canvas)

      // 6. Compute styles
      const computedStyles = computeStyleMap()
      const visited = getVisited()

      // 7. Create node and link graphics
      this.nodeRenderData = this.renderer.createNodeGraphics(
        graphData.nodes,
        this.config,
        computedStyles,
        this.currentSlug,
        visited,
        (d) => this.simulation.getNodeRadius(d),
        (nodeId, oldOpacity) => {
          this.hoverManager.updateHoverInfo(nodeId, this.nodeRenderData, this.linkRenderData)
          if (!this.dragHandler.isDragging()) {
            this.renderPixiFromD3()
          }
          return oldOpacity
        },
        () => {
          this.hoverManager.updateHoverInfo(null, this.nodeRenderData, this.linkRenderData)
          if (!this.dragHandler.isDragging()) {
            this.renderPixiFromD3()
          }
        }
      )

      this.linkRenderData = this.renderer.createLinkGraphics(graphData.links, computedStyles)

      // 8. Setup interactions
      const canvas$ = this.renderer.getCanvas()!
      const stage = this.renderer.getStage()!
      const labelsContainer = this.renderer.getLabelsContainer()!

      // Setup drag
      if (this.config.drag) {
        this.dragHandler.setupDrag(
          canvas$,
          graphData,
          this.simulation,
          () => this.hoverManager.getHoveredNodeId(),
          (nodeId) => this.handleNodeClick(nodeId)
        )
      } else {
        this.dragHandler.setupClickHandlers(this.nodeRenderData, (nodeId) =>
          this.handleNodeClick(nodeId)
        )
      }

      // Setup zoom
      if (this.config.zoom) {
        this.zoomHandler.setupZoom(
          canvas$,
          stage,
          labelsContainer,
          this.width,
          this.height,
          this.config.opacityScale,
          this.nodeRenderData,
          (transform) => {
            this.dragHandler.setCurrentTransform(transform)
          }
        )
      }

      // 9. Start animation loop
      requestAnimationFrame((time) => this.animate(time))
    } catch (error) {
      console.error('Failed to initialize graph:', error)
    }
  }

  /**
   * Load content index data
   */
  private async loadData(): Promise<Record<string, ContentDetails>> {
    const response = await fetch('../test-data/contentIndex.json')
    if (!response.ok) {
      throw new Error('Failed to load content index')
    }
    return response.json()
  }

  /**
   * Handle node click (navigation)
   */
  private handleNodeClick(nodeId: string): void {
    console.log(`Navigating to: ${nodeId}`)
    addToVisited(nodeId)
    // In a real implementation, this would navigate to the page
    // window.location.href = nodeId
  }

  /**
   * Re-render when hover state changes
   */
  private renderPixiFromD3(): void {
    this.renderer.updateNodePositions(this.nodeRenderData, this.width, this.height)
    this.renderer.updateLinkGraphics(this.linkRenderData, this.width, this.height)
    this.renderer.render()
  }

  /**
   * Animation loop
   */
  private animate(_time: number): void {
    if (this.stopAnimation) return

    // Update node positions from simulation
    this.renderer.updateNodePositions(this.nodeRenderData, this.width, this.height)

    // Update link graphics
    this.renderer.updateLinkGraphics(this.linkRenderData, this.width, this.height)

    // Render frame
    this.renderer.render()

    requestAnimationFrame((t) => this.animate(t))
  }

  /**
   * Cleanup and destroy
   */
  destroy(): void {
    this.stopAnimation = true
    this.simulation.stop()
    this.renderer.destroy()
  }
}
