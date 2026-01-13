import { Application, Container, Graphics, Text, Circle } from 'pixi.js'
import type { D3Config, NodeData, LinkData, NodeRenderData, LinkRenderData, StyleMap } from './types'

export class GraphRenderer {
  private app: Application | null = null
  private stage: Container | null = null
  private labelsContainer: Container<Text> | null = null
  private nodesContainer: Container<Graphics> | null = null
  private linkContainer: Container<Graphics> | null = null

  /**
   * Initialize Pixi application with WebGPU/Canvas
   */
  async init(width: number, height: number): Promise<HTMLCanvasElement> {
    this.app = new Application()
    await this.app.init({
      width,
      height,
      antialias: true,
      autoStart: false,
      autoDensity: true,
      backgroundAlpha: 0,
      preference: "webgpu",
      resolution: window.devicePixelRatio,
      eventMode: "static",
    })

    this.stage = this.app.stage
    this.stage.interactive = false

    // Create 3-layer container hierarchy (z-index ordering)
    this.linkContainer = new Container<Graphics>({ zIndex: 1, isRenderGroup: true })
    this.nodesContainer = new Container<Graphics>({ zIndex: 2, isRenderGroup: true })
    this.labelsContainer = new Container<Text>({ zIndex: 3, isRenderGroup: true })

    this.stage.addChild(this.nodesContainer, this.labelsContainer, this.linkContainer)

    return this.app.canvas
  }

  /**
   * Create node graphics with event handlers
   */
  createNodeGraphics(
    nodes: NodeData[],
    config: D3Config,
    computedStyles: StyleMap,
    currentSlug: string,
    visited: Set<string>,
    nodeRadius: (d: NodeData) => number,
    onPointerOver: (nodeId: string, oldOpacity: number) => number,
    onPointerLeave: () => void
  ): NodeRenderData[] {
    if (!this.nodesContainer || !this.labelsContainer) {
      throw new Error("Renderer not initialized")
    }

    const nodeRenderData: NodeRenderData[] = []

    // Calculate node color
    const getColor = (d: NodeData): string => {
      const isCurrent = d.id === currentSlug
      if (isCurrent) {
        return computedStyles["--secondary"]
      } else if (visited.has(d.id) || d.id.startsWith("tags/")) {
        return computedStyles["--tertiary"]
      } else {
        return computedStyles["--gray"]
      }
    }

    for (const n of nodes) {
      const nodeId = n.id
      const isTagNode = nodeId.startsWith("tags/")
      const radius = nodeRadius(n)
      const nodeColor = getColor(n)

      // Create label
      const label = new Text({
        interactive: false,
        eventMode: "none",
        text: n.text,
        alpha: 0,
        anchor: { x: 0.5, y: 1.2 },
        style: {
          fontSize: config.fontSize * 15,
          fill: computedStyles["--dark"],
          fontFamily: computedStyles["--bodyFont"],
        },
        resolution: window.devicePixelRatio * 4,
      })
      label.scale.set(1 / config.scale)

      // Create node graphic
      let oldLabelOpacity = 0
      const gfx = new Graphics({
        interactive: true,
        label: nodeId,
        eventMode: "static",
        hitArea: new Circle(0, 0, radius),
        cursor: "pointer",
      })
        .circle(0, 0, radius)
        .fill({ color: isTagNode ? computedStyles["--light"] : nodeColor })
        .on("pointerover", (e) => {
          oldLabelOpacity = label.alpha
          onPointerOver(e.target.label, oldLabelOpacity)
        })
        .on("pointerleave", () => {
          label.alpha = oldLabelOpacity
          onPointerLeave()
        })

      // Add stroke for tag nodes
      if (isTagNode) {
        gfx.stroke({ width: 2, color: computedStyles["--tertiary"] })
      }

      this.nodesContainer!.addChild(gfx)
      this.labelsContainer!.addChild(label)

      nodeRenderData.push({
        simulationData: n,
        gfx,
        label,
        color: nodeColor,
        alpha: 1,
        active: false,
      })
    }

    return nodeRenderData
  }

  /**
   * Create link graphics
   */
  createLinkGraphics(
    links: LinkData[],
    computedStyles: StyleMap
  ): LinkRenderData[] {
    if (!this.linkContainer) {
      throw new Error("Renderer not initialized")
    }

    const linkRenderData: LinkRenderData[] = []

    for (const l of links) {
      const gfx = new Graphics({ interactive: false, eventMode: "none" })
      this.linkContainer.addChild(gfx)

      linkRenderData.push({
        simulationData: l,
        gfx,
        color: computedStyles["--lightgray"],
        alpha: 1,
        active: false,
      })
    }

    return linkRenderData
  }

  /**
   * Update node positions from D3 simulation
   */
  updateNodePositions(nodeRenderData: NodeRenderData[], width: number, height: number): void {
    for (const n of nodeRenderData) {
      const { x, y } = n.simulationData
      if (!x || !y) continue

      // Center nodes in canvas
      n.gfx.position.set(x + width / 2, y + height / 2)
      if (n.label) {
        n.label.position.set(x + width / 2, y + height / 2)
      }
    }
  }

  /**
   * Redraw links (must be done every frame)
   */
  updateLinkGraphics(linkRenderData: LinkRenderData[], width: number, height: number): void {
    for (const l of linkRenderData) {
      const linkData = l.simulationData
      l.gfx.clear()
      l.gfx.moveTo(linkData.source.x! + width / 2, linkData.source.y! + height / 2)
      l.gfx
        .lineTo(linkData.target.x! + width / 2, linkData.target.y! + height / 2)
        .stroke({ alpha: l.alpha, width: 1, color: l.color })
    }
  }

  /**
   * Render the scene
   */
  render(): void {
    if (!this.app || !this.stage) return
    this.app.renderer.render(this.stage)
  }

  /**
   * Get the stage (for zoom/pan transformations)
   */
  getStage(): Container | null {
    return this.stage
  }

  /**
   * Get the labels container (for opacity adjustments on zoom)
   */
  getLabelsContainer(): Container<Text> | null {
    return this.labelsContainer
  }

  /**
   * Get the canvas element
   */
  getCanvas(): HTMLCanvasElement | null {
    return this.app?.canvas ?? null
  }

  /**
   * Cleanup and destroy
   */
  destroy(): void {
    if (this.app) {
      this.app.destroy()
      this.app = null
    }
    this.stage = null
    this.labelsContainer = null
    this.nodesContainer = null
    this.linkContainer = null
  }
}
